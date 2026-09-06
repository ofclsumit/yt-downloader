import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './server/config.js';
import { initStorage, generateSignedToken, verifySignedToken, getFileDetails } from './server/services/storage.js';
import { jobQueue } from './server/services/queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== Running Backend & Processing Architecture Tests ===');

// Initialize storage
initStorage();

async function runTests() {
  // 1. Signed URL Security Tests
  console.log('1. Testing Cryptographic Signed Token System...');
  const testJobId = 'job_test123';
  const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 min in future
  const token = generateSignedToken(testJobId, expiresAt);

  assert.strictEqual(typeof token, 'string');
  assert.strictEqual(token.length, 64); // SHA256 hex is 64 chars

  // Valid token verify
  const isValid = verifySignedToken(testJobId, expiresAt, token);
  assert.strictEqual(isValid, true, 'Valid token must verify successfully');

  // Tampered token verify
  const isTamperedValid = verifySignedToken(testJobId, expiresAt, 'badtoken'.padEnd(64, '0'));
  assert.strictEqual(isTamperedValid, false, 'Tampered token must be rejected');

  // Expired token verify
  const pastExpires = Math.floor(Date.now() / 1000) - 10;
  const expiredToken = generateSignedToken(testJobId, pastExpires);
  const isExpiredValid = verifySignedToken(testJobId, pastExpires, expiredToken);
  assert.strictEqual(isExpiredValid, false, 'Expired token must be rejected');
  console.log('✓ Signed token verification and tamper-resistance passed.');

  // 2. Real FFmpeg Processing Test
  console.log('2. Testing Asynchronous FFmpeg Job Execution...');
  const sampleSource = path.join(config.tempDir, 'sample_authorized.mp4');
  assert.ok(fs.existsSync(sampleSource), 'Sample video must exist for test');

  // Create job to cut 00:05 to 00:15 (10s duration)
  const job = jobQueue.createJob({
    source: sampleSource,
    sourceType: 'sample',
    start: 5,
    end: 15,
    duration: 10,
    format: 'mp4',
  });

  assert.strictEqual(job.status, 'queued');
  assert.strictEqual(job.duration, 10);

  // Poll until job completes
  console.log('Waiting for FFmpeg worker to process clip...');
  let completedJob = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const status = jobQueue.getJob(job.id, 'http://127.0.0.1:3001');
    if (status.status === 'completed' || status.status === 'failed') {
      completedJob = status;
      break;
    }
  }

  assert.ok(completedJob, 'Job must finish within timeout');
  assert.strictEqual(completedJob.status, 'completed');
  assert.strictEqual(completedJob.progress, 100);
  assert.ok(completedJob.downloadUrl, 'Download URL must be present');
  assert.ok(completedJob.fileSize, 'File size must be calculated');

  // Verify the generated MP4 file on disk
  const rawJob = jobQueue.jobs.get(job.id);
  assert.ok(fs.existsSync(rawJob.outputPath), 'Output MP4 file must exist on disk');
  const details = getFileDetails(rawJob.outputPath);
  assert.ok(details.sizeBytes > 1000, `Output MP4 must have content (got ${details.sizeBytes} bytes)`);
  console.log(`✓ FFmpeg worker successfully generated clip: ${details.formattedSize}`);

  // 3. Job Cancellation Test
  console.log('3. Testing Job Cancellation Handling...');
  const cancellableJob = jobQueue.createJob({
    source: sampleSource,
    sourceType: 'sample',
    start: 0,
    end: 30,
    duration: 30,
    format: 'mp4',
  });

  // Cancel immediately
  const cancelled = jobQueue.cancelJob(cancellableJob.id);
  assert.strictEqual(cancelled, true, 'Cancellation of active job must return true');
  const cancelledStatus = jobQueue.getJob(cancellableJob.id);
  assert.strictEqual(cancelledStatus.status, 'cancelled');
  console.log('✓ Job cancellation handled cleanly.');

  // 4. Metrics & Visibility Test
  console.log('4. Testing Operational Visibility Metrics...');
  const metrics = jobQueue.getMetrics();
  assert.ok(metrics.totalJobs >= 2, 'Metrics must track total jobs');
  assert.ok(metrics.completed >= 1, 'Metrics must track completed jobs');
  assert.ok(metrics.cancelled >= 1, 'Metrics must track cancelled jobs');
  assert.strictEqual(typeof metrics.totalStorageFormatted, 'string');
  console.log('✓ Metrics reporting:', metrics);

  console.log('=== All Backend Tests Passed Successfully! ===');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
