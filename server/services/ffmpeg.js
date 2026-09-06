import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
import path from 'path';

/**
 * Parses FFmpeg time string (HH:MM:SS.xx) into total seconds
 */
function parseTimeOutput(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  return parseFloat(timeStr) || 0;
}

/**
 * Executes a safe, bounded FFmpeg clip extraction.
 *
 * @param {Object} options
 * @param {string} options.inputSource - Local path or authorized stream URL
 * @param {number} options.startSeconds - Start timestamp in seconds
 * @param {number} options.durationSeconds - Duration in seconds
 * @param {string} options.outputPath - Destination MP4 path
 * @param {function} options.onProgress - Progress callback (percent: number)
 * @returns {Promise<{ success: boolean, outputPath: string, processRef: any }>}
 */
export function processClip({
  inputSource,
  startSeconds,
  durationSeconds,
  outputPath,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    const startStr = Math.max(0, startSeconds).toFixed(2);
    const durationStr = Math.max(0.1, durationSeconds).toFixed(2);

    // Safe argument array: NO shell interpolation, NO arbitrary parameters
    const args = [
      '-ss', startStr,
      '-i', inputSource,
      '-t', durationStr,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    const binary = ffmpegPath || 'ffmpeg';
    const child = spawn(binary, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'], // capture stderr for progress parsing
    });

    let stderrBuffer = '';
    let killed = false;

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Match FFmpeg time pattern: time=00:00:05.42 or time=5.42
      const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d+|\d+\.\d+)/);
      if (timeMatch && onProgress) {
        const currentSeconds = parseTimeOutput(timeMatch[1]);
        if (durationSeconds > 0) {
          const percent = Math.min(99, Math.max(1, Math.round((currentSeconds / durationSeconds) * 100)));
          onProgress(percent);
        }
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });

    child.on('close', (code) => {
      if (killed) {
        reject(new Error('Process was cancelled by user.'));
        return;
      }

      if (code === 0) {
        if (onProgress) onProgress(100);
        resolve({ success: true, outputPath });
      } else {
        const recentStderr = stderrBuffer.slice(-600);
        reject(new Error(`FFmpeg exited with code ${code}. Error: ${recentStderr || 'Unknown error'}`));
      }
    });

    // Provide cancellation method
    child.cancel = () => {
      killed = true;
      try {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1500);
      } catch (e) {}
    };

    // Return the child process reference immediately so callers can track/cancel it
    child.promise = { resolve, reject };
    return child;
  });
}
