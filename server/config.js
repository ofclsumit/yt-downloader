import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '127.0.0.1',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://127.0.0.1:5173',

  // Storage directories
  tempDir: path.resolve(__dirname, '../temp'),
  clipsDir: path.resolve(__dirname, '../temp/clips'),
  uploadsDir: path.resolve(__dirname, '../temp/uploads'),

  // Security & Token Signing
  signedUrlSecret: process.env.SIGNED_URL_SECRET || crypto.randomBytes(32).toString('hex'),
  retentionSeconds: parseInt(process.env.RETENTION_SECONDS || '900', 10), // 15 minutes
  cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || '60000', 10), // 1 minute

  // Limits & Abuse Protection
  maxClipDuration: parseInt(process.env.MAX_CLIP_DURATION || '300', 10), // 5 minutes max clip
  maxSourceSize: parseInt(process.env.MAX_SOURCE_SIZE || '157286400', 10), // 150 MB
  maxConcurrentWorkers: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  jobTimeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || '120000', 10), // 2 minutes max processing time
  maxRetries: 3,

  // Rate Limiting (per IP window)
  rateLimitWindowMs: 60 * 1000,
  rateLimitMaxClips: 15,
};
