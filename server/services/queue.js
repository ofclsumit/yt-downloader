import crypto from 'crypto';
import path from 'path';
import { config } from '../config.js';
import { processClip } from './ffmpeg.js';
import { getFileDetails, removeFileSafe, buildDownloadUrl } from './storage.js';

class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.waitingQueue = [];
    this.activeCount = 0;
  }

  createJob({ source, sourceType, start, end, duration, format = 'mp4' }) {
    const id = `job_${crypto.randomBytes(8).toString('hex')}`;
    const outputPath = path.join(config.clipsDir, `${id}.${format}`);

    const job = {
      id,
      source,
      sourceType,
      start,
      end,
      duration,
      format,
      status: 'queued', // queued | processing | completed | failed | cancelled | expired
      progress: 0,
      outputPath,
      fileSize: null,
      fileSizeBytes: 0,
      downloadUrl: null,
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      expiresAt: null,
      attempts: 0,
      activeProcess: null,
    };

    this.jobs.set(id, job);
    this.waitingQueue.push(id);

    // Trigger queue processing asynchronously
    setImmediate(() => this.processNext());

    return job;
  }

  getJob(id, reqBaseUrl = '') {
    const job = this.jobs.get(id);
    if (!job) return null;

    // Check expiration
    if (job.status === 'completed' && job.expiresAt) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > job.expiresAt) {
        job.status = 'expired';
        removeFileSafe(job.outputPath);
      }
    }

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      start: job.start,
      end: job.end,
      duration: job.duration,
      format: job.format,
      fileSize: job.fileSize,
      fileSizeBytes: job.fileSizeBytes,
      downloadUrl: job.status === 'completed' ? buildDownloadUrl(job.id, reqBaseUrl) : null,
      expiresAt: job.expiresAt,
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    };
  }

  cancelJob(id) {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'failed') {
      return false;
    }

    // Terminate running FFmpeg process if active
    if (job.activeProcess && typeof job.activeProcess.cancel === 'function') {
      job.activeProcess.cancel();
    }

    job.status = 'cancelled';
    job.error = 'Job was cancelled by user.';
    removeFileSafe(job.outputPath);

    // Remove from waiting queue if not yet started
    const waitIdx = this.waitingQueue.indexOf(id);
    if (waitIdx !== -1) {
      this.waitingQueue.splice(waitIdx, 1);
    }

    return true;
  }

  async processNext() {
    if (this.activeCount >= config.maxConcurrentWorkers) {
      return;
    }

    const nextId = this.waitingQueue.shift();
    if (!nextId) {
      return;
    }

    const job = this.jobs.get(nextId);
    if (!job || job.status === 'cancelled') {
      return this.processNext();
    }

    this.activeCount++;
    job.status = 'processing';
    job.startedAt = Date.now();
    job.attempts++;

    try {
      // Set timeout guard to prevent hung processes
      let timeoutId = null;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          if (job.activeProcess && typeof job.activeProcess.cancel === 'function') {
            job.activeProcess.cancel();
          }
          reject(new Error(`Processing timed out after ${config.jobTimeoutMs / 1000}s.`));
        }, config.jobTimeoutMs);
      });

      const ffmpegPromise = new Promise((resolve, reject) => {
        try {
          const proc = processClip({
            inputSource: job.source,
            startSeconds: job.start,
            durationSeconds: job.duration,
            outputPath: job.outputPath,
            onProgress: (percent) => {
              job.progress = percent;
            },
          });

          job.activeProcess = proc;

          proc.then(resolve).catch(reject);
        } catch (err) {
          reject(err);
        }
      });

      await Promise.race([ffmpegPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      // Successfully finished
      const fileDetails = getFileDetails(job.outputPath);
      job.status = 'completed';
      job.progress = 100;
      job.fileSize = fileDetails.formattedSize;
      job.fileSizeBytes = fileDetails.sizeBytes;
      job.completedAt = Date.now();
      job.expiresAt = Math.floor(Date.now() / 1000) + config.retentionSeconds;
      job.activeProcess = null;
    } catch (err) {
      job.activeProcess = null;
      console.error(`Error processing job ${job.id}:`, err.message);

      // Retry transient failures up to maxRetries if not cancelled
      if (job.status !== 'cancelled' && job.attempts < config.maxRetries) {
        console.log(`Scheduling retry attempt ${job.attempts + 1} for job ${job.id}...`);
        job.status = 'queued';
        job.progress = 0;
        // Exponential backoff delay
        setTimeout(() => {
          this.waitingQueue.unshift(job.id);
          this.processNext();
        }, Math.pow(2, job.attempts) * 1000);
      } else if (job.status !== 'cancelled') {
        job.status = 'failed';
        job.error = 'We could not create this clip. The source could not be processed.';
        removeFileSafe(job.outputPath);
      }
    } finally {
      this.activeCount--;
      setImmediate(() => this.processNext());
    }
  }

  getMetrics() {
    let queued = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    let expired = 0;
    let totalStorageBytes = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'queued') queued++;
      else if (job.status === 'processing') processing++;
      else if (job.status === 'completed') {
        completed++;
        totalStorageBytes += job.fileSizeBytes || 0;
      } else if (job.status === 'failed') failed++;
      else if (job.status === 'cancelled') cancelled++;
      else if (job.status === 'expired') expired++;
    }

    return {
      activeWorkers: this.activeCount,
      maxWorkers: config.maxConcurrentWorkers,
      queued,
      processing,
      completed,
      failed,
      cancelled,
      expired,
      totalJobs: this.jobs.size,
      totalStorageBytes,
      totalStorageFormatted: `${(totalStorageBytes / (1024 * 1024)).toFixed(1)} MB`,
    };
  }
}

export const jobQueue = new JobQueue();
