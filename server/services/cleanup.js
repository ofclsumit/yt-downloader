import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { jobQueue } from './queue.js';
import { removeFileSafe } from './storage.js';

let cleanupTimer = null;

export function startCleanupDaemon() {
  if (cleanupTimer) return;

  const runCleanup = () => {
    try {
      const now = Date.now();
      const nowSec = Math.floor(now / 1000);

      // 1. Purge expired clips in temporary clips directory
      if (fs.existsSync(config.clipsDir)) {
        const files = fs.readdirSync(config.clipsDir);
        for (const file of files) {
          const fullPath = path.join(config.clipsDir, file);
          try {
            const stats = fs.statSync(fullPath);
            const ageSec = (now - stats.mtimeMs) / 1000;
            if (ageSec > config.retentionSeconds) {
              removeFileSafe(fullPath);
            }
          } catch (e) {}
        }
      }

      // 2. Purge orphaned uploaded files older than 1 hour
      if (fs.existsSync(config.uploadsDir)) {
        const uploads = fs.readdirSync(config.uploadsDir);
        for (const file of uploads) {
          const fullPath = path.join(config.uploadsDir, file);
          try {
            const stats = fs.statSync(fullPath);
            const ageMs = now - stats.mtimeMs;
            if (ageMs > 3600000) {
              removeFileSafe(fullPath);
            }
          } catch (e) {}
        }
      }

      // 3. Update expired states in job queue
      for (const [id, job] of jobQueue.jobs.entries()) {
        if (job.status === 'completed' && job.expiresAt && nowSec > job.expiresAt) {
          job.status = 'expired';
          removeFileSafe(job.outputPath);
        }

        // Evict very old job records (> 2 hours) to avoid memory leaks
        if (now - job.createdAt > 7200000) {
          jobQueue.jobs.delete(id);
        }
      }
    } catch (err) {
      console.warn('Error during automated cleanup cycle:', err.message);
    }
  };

  // Run immediately then schedule on interval
  runCleanup();
  cleanupTimer = setInterval(runCleanup, config.cleanupIntervalMs);
  return cleanupTimer;
}

export function stopCleanupDaemon() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
