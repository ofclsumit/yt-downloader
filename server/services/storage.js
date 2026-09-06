import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';

// Ensure storage directories exist
export function initStorage() {
  if (!fs.existsSync(config.tempDir)) fs.mkdirSync(config.tempDir, { recursive: true });
  if (!fs.existsSync(config.clipsDir)) fs.mkdirSync(config.clipsDir, { recursive: true });
  if (!fs.existsSync(config.uploadsDir)) fs.mkdirSync(config.uploadsDir, { recursive: true });
}

/**
 * Generates an HMAC-SHA256 signature for a jobId and expiration timestamp
 */
export function generateSignedToken(jobId, expiresAt) {
  const payload = `${jobId}:${expiresAt}`;
  return crypto.createHmac('sha256', config.signedUrlSecret).update(payload).digest('hex');
}

/**
 * Validates whether a token signature is authentic and not expired
 */
export function verifySignedToken(jobId, expiresAt, token) {
  if (!jobId || !expiresAt || !token) return false;

  const now = Math.floor(Date.now() / 1000);
  if (parseInt(expiresAt, 10) < now) {
    return false; // Expired
  }

  const expectedToken = generateSignedToken(jobId, expiresAt);
  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expectedToken, 'hex'));
  } catch (err) {
    return false;
  }
}

/**
 * Builds the signed download URL for a completed job
 */
export function buildDownloadUrl(jobId, reqBaseUrl = '') {
  const expiresAt = Math.floor(Date.now() / 1000) + config.retentionSeconds;
  const token = generateSignedToken(jobId, expiresAt);
  return `${reqBaseUrl}/api/clips/${jobId}/download?token=${token}&expires=${expiresAt}`;
}

/**
 * Retrieves file size in bytes and formatted string
 */
export function getFileDetails(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { exists: false, sizeBytes: 0, formattedSize: '0 B' };
  }
  const stats = fs.statSync(filePath);
  const bytes = stats.size;

  let formattedSize = `${bytes} B`;
  if (bytes >= 1048576) {
    formattedSize = `${(bytes / 1048576).toFixed(1)} MB`;
  } else if (bytes >= 1024) {
    formattedSize = `${(bytes / 1024).toFixed(1)} KB`;
  }

  return { exists: true, sizeBytes: bytes, formattedSize };
}

/**
 * Safely removes a file if it exists
 */
export function removeFileSafe(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.warn(`Could not remove file ${filePath}:`, err.message);
  }
  return false;
}
