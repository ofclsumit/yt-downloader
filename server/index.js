import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import { config } from './config.js';
import { initStorage } from './services/storage.js';
import { startCleanupDaemon } from './services/cleanup.js';
import apiRouter from './routes/api.js';

const app = express();

// Security Headers & CORS
app.use(
  helmet({
    contentSecurityPolicy: false, // Allow official YouTube player iframe & local video blobs
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost dev servers and requests with no origin (e.g. mobile/curl)
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure sample authorized media exists for instant testing and verification
function ensureSampleMedia() {
  const samplePath = path.join(config.tempDir, 'sample_authorized.mp4');
  if (!fs.existsSync(samplePath)) {
    console.log('Generating authorized sample video test file...');
    const binary = ffmpegPath || 'ffmpeg';
    const proc = spawn(binary, [
      '-f', 'lavfi', '-i', 'testsrc=duration=45:size=640x360:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=45',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-pix_fmt', 'yuv420p',
      '-y', samplePath,
    ], { windowsHide: true });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('Authorized sample video generated successfully at', samplePath);
      }
    });
  }
}

// Serve uploaded / sample files statically for local video preview when using uploaded sources
app.use('/preview-media', express.static(config.tempDir));

// Mount REST API
app.use('/api', apiRouter);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled API Error:', err);
  if (err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

// Initialize services and start server
initStorage();
ensureSampleMedia();
startCleanupDaemon();

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend API Server running at http://${config.host}:${config.port}`);
});

export default app;
