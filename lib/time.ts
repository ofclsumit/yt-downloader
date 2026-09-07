/**
 * Time parsing, formatting, and boundary validation utilities.
 */

export interface ParsedTime {
  valid: boolean;
  seconds: number;
  error: string | null;
}

export function parseTimestamp(input: string | number | null | undefined): ParsedTime {
  if (input === null || input === undefined || input === '') {
    return { valid: false, seconds: 0, error: 'Please enter a timestamp.' };
  }

  if (typeof input === 'number') {
    if (isNaN(input) || input < 0) {
      return { valid: false, seconds: 0, error: 'Timestamp cannot be negative.' };
    }
    return { valid: true, seconds: Math.floor(input), error: null };
  }

  const str = input.toString().trim();
  if (!str) {
    return { valid: false, seconds: 0, error: 'Please enter a timestamp.' };
  }

  // Pure number check (e.g. "90" or "90.5")
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (isNaN(num) || num < 0) {
      return { valid: false, seconds: 0, error: 'Timestamp cannot be negative.' };
    }
    return { valid: true, seconds: Math.floor(num), error: null };
  }

  // Colon separated format (HH:MM:SS or MM:SS)
  const parts = str.split(':');
  if (parts.length === 2) {
    const [mStr, sStr] = parts;
    const minutes = parseInt(mStr, 10);
    const seconds = parseFloat(sStr);

    if (isNaN(minutes) || isNaN(seconds) || minutes < 0 || seconds < 0 || seconds >= 60) {
      return { valid: false, seconds: 0, error: 'Format must be MM:SS (seconds must be < 60).' };
    }
    return { valid: true, seconds: Math.floor(minutes * 60 + seconds), error: null };
  }

  if (parts.length === 3) {
    const [hStr, mStr, sStr] = parts;
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const seconds = parseFloat(sStr);

    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      isNaN(seconds) ||
      hours < 0 ||
      minutes < 0 ||
      minutes >= 60 ||
      seconds < 0 ||
      seconds >= 60
    ) {
      return { valid: false, seconds: 0, error: 'Format must be HH:MM:SS (minutes & seconds < 60).' };
    }
    return { valid: true, seconds: Math.floor(hours * 3600 + minutes * 60 + seconds), error: null };
  }

  return {
    valid: false,
    seconds: 0,
    error: 'Invalid format. Use HH:MM:SS, MM:SS, or seconds.',
  };
}

export function formatTimestamp(totalSeconds: number, forceHours = false): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return '00:00';
  }

  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  const pad = (num: number) => num.toString().padStart(2, '0');

  if (hours > 0 || forceHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatDurationDisplay(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec${seconds !== 1 ? 's' : ''}`);

  return parts.join(' ');
}

export function validateTimeRange(
  startSeconds: number,
  endSeconds: number,
  videoDuration: number = 0,
  maxClipDuration: number = 300
): { valid: boolean; error: string | null; errorCode?: string } {
  if (startSeconds < 0) {
    return { valid: false, error: 'Start timestamp cannot be negative.', errorCode: 'TIMESTAMP_INVALID' };
  }

  if (endSeconds <= startSeconds) {
    return { valid: false, error: 'The selected end time must be greater than the start time.', errorCode: 'TIMESTAMP_INVALID' };
  }

  const clipDuration = endSeconds - startSeconds;
  if (clipDuration > maxClipDuration) {
    return {
      valid: false,
      error: `The clip is too long (${Math.round(clipDuration)}s). Maximum allowed length is ${maxClipDuration}s (${Math.round(maxClipDuration / 60)} mins).`,
      errorCode: 'CLIP_TOO_LONG'
    };
  }

  if (videoDuration > 0) {
    if (startSeconds >= videoDuration) {
      return { valid: false, error: 'Start time cannot exceed the total video duration.', errorCode: 'TIMESTAMP_INVALID' };
    }
    if (endSeconds > videoDuration + 1.0) {
      return { valid: false, error: 'Selected end timestamp exceeds the video duration.', errorCode: 'TIMESTAMP_INVALID' };
    }
  }

  return { valid: true, error: null };
}
