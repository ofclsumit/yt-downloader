import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';
import { jobQueue } from '../services/queue.js';
import { verifySignedToken, removeFileSafe } from '../services/storage.js';

const router = express.Router();

// Simple in-memory rate limiter for abuse protection
const ipRequestCounts = new Map();
function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const userRecord = ipRequestCounts.get(ip) || { count: 0, resetTime: now + config.rateLimitWindowMs };

  if (now > userRecord.resetTime) {
    userRecord.count = 0;
    userRecord.resetTime = now + config.rateLimitWindowMs;
  }

  userRecord.count++;
  ipRequestCounts.set(ip, userRecord);

  if (userRecord.count > config.rateLimitMaxClips) {
    return res.status(429).json({
      error: 'Rate limit exceeded. Please wait a minute before creating more clips.',
    });
  }
  next();
}

// Multer setup for authorized source video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    const safeName = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
  if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(mp4|webm|mov|mkv)$/i)) {
    cb(null, true);
  } else {
    cb(new Error('Only MP4, WebM, MOV, and MKV video formats are supported.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: config.maxSourceSize },
  fileFilter,
});

/**
 * POST /api/upload
 * Allows user to upload an authorized video file for clipping
 */
router.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided.' });
  }

  const relativePath = path.relative(config.tempDir, req.file.path);
  res.json({
    success: true,
    fileId: req.file.filename,
    originalName: req.file.originalname,
    sizeBytes: req.file.size,
    relativePath,
    sourceRef: `upload:${req.file.filename}`,
  });
});

/**
 * POST /api/clips
 * Creates an asynchronous video clipping job
 */
router.post('/clips', rateLimitMiddleware, (req, res) => {
  const { source, sourceType = 'sample', start, end, format = 'mp4' } = req.body;

  // 1. Validate timestamps
  const startSec = parseFloat(start);
  const endSec = parseFloat(end);

  if (isNaN(startSec) || isNaN(endSec)) {
    return res.status(400).json({ error: 'Start and end timestamps must be valid numbers.' });
  }

  if (startSec < 0) {
    return res.status(400).json({ error: 'Start timestamp cannot be negative.' });
  }

  if (endSec <= startSec) {
    return res.status(400).json({ error: 'End timestamp must be strictly greater than start timestamp.' });
  }

  const duration = Math.round((endSec - startSec) * 100) / 100;
  if (duration > config.maxClipDuration) {
    return res.status(400).json({
      error: `Requested clip duration (${duration}s) exceeds maximum allowed limit of ${config.maxClipDuration}s.`,
    });
  }

  // 2. Resolve source path safely (SSRF protection: no arbitrary network URLs fetched directly)
  let resolvedSourcePath = null;

  if (sourceType === 'upload' || (typeof source === 'string' && source.startsWith('upload:'))) {
    const filename = source.replace('upload:', '');
    const sanitized = path.basename(filename); // Prevent directory traversal
    const candidatePath = path.join(config.uploadsDir, sanitized);

    if (!fs.existsSync(candidatePath)) {
      return res.status(404).json({ error: 'Uploaded source file was not found or has expired.' });
    }
    resolvedSourcePath = candidatePath;
  } else if (sourceType === 'sample' || source === 'sample:authorized' || !source || source.includes('sample')) {
    // Verified authorized local sample video
    const samplePath = path.join(config.tempDir, 'sample_authorized.mp4');
    if (fs.existsSync(samplePath)) {
      resolvedSourcePath = samplePath;
    } else {
      return res.status(500).json({ error: 'Sample media file is not initialized on the server.' });
    }
  } else if (typeof source === 'string' && (source.includes('youtube.com') || source.includes('youtu.be'))) {
    // Legal & technical compliance: YouTube protected CDN streams cannot be scraped or bypassed.
    return res.status(403).json({
      code: 'YOUTUBE_DIRECT_RESTRICTED',
      error:
        'In strict compliance with YouTube terms, protected media cannot be extracted directly without API partner credentials. Please use our verified open-source sample or upload your authorized source file to generate the clip.',
    });
  } else {
    return res.status(400).json({ error: 'Unsupported or unauthorized video source.' });
  }

  // 3. Enqueue job
  const job = jobQueue.createJob({
    source: resolvedSourcePath,
    sourceType,
    start: startSec,
    end: endSec,
    duration,
    format,
  });

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.status(202).json({
    jobId: job.id,
    status: job.status,
    start: job.start,
    end: job.end,
    duration: job.duration,
    statusUrl: `${baseUrl}/api/clips/${job.id}`,
  });
});

/**
 * GET /api/clips/:jobId
 * Returns real-time status of a processing job
 */
router.get('/clips/:jobId', (req, res) => {
  const { jobId } = req.params;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const job = jobQueue.getJob(jobId, baseUrl);

  if (!job) {
    return res.status(404).json({ error: 'Job not found or has been purged.' });
  }

  res.json(job);
});

/**
 * GET /api/clips/:jobId/download
 * Secure signed download endpoint
 */
router.get('/clips/:jobId/download', (req, res) => {
  const { jobId } = req.params;
  const { token, expires } = req.query;

  // 1. Verify signed token
  if (!verifySignedToken(jobId, expires, token)) {
    return res.status(403).json({
      error: 'Download link is invalid or has expired. Please create a new clip.',
    });
  }

  const rawJob = jobQueue.jobs.get(jobId);
  if (!rawJob || !fs.existsSync(rawJob.outputPath)) {
    return res.status(404).json({
      error: 'The generated clip file is no longer available on the server.',
    });
  }

  const filename = `clip_${jobId.replace('job_', '')}.mp4`;
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const fileStream = fs.createReadStream(rawJob.outputPath);
  fileStream.pipe(res);
});

/**
 * DELETE /api/clips/:jobId
 * Cancels active job or deletes completed clip
 */
router.delete('/clips/:jobId', (req, res) => {
  const { jobId } = req.params;
  const success = jobQueue.cancelJob(jobId);

  if (!success) {
    return res.status(400).json({ error: 'Could not cancel job or job is already finished.' });
  }

  res.json({ success: true, message: 'Job has been cancelled and temporary artifacts removed.' });
});

/**
 * GET /api/health
 * System health and service checks
 */
router.get('/health', (req, res) => {
  const metrics = jobQueue.getMetrics();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    queue: {
      activeWorkers: metrics.activeWorkers,
      maxWorkers: metrics.maxWorkers,
      queuedJobs: metrics.queued,
      processingJobs: metrics.processing,
    },
    storage: {
      totalClipsBytes: metrics.totalStorageBytes,
      totalClipsFormatted: metrics.totalStorageFormatted,
    },
  });
});

/**
 * GET /api/admin/metrics
 * Operational visibility metrics
 */
router.get('/admin/metrics', (req, res) => {
  const metrics = jobQueue.getMetrics();
  res.json(metrics);
});

export default router;
