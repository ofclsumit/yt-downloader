/**
 * Time manipulation, parsing, and formatting utilities
 */

/**
 * Parses user input into normalized integer/float seconds.
 * Supports:
 * - "HH:MM:SS" (e.g. "01:02:10" -> 3730)
 * - "MM:SS" (e.g. "02:10" -> 130)
 * - Raw seconds (e.g. "130" -> 130)
 *
 * @param {string | number} input
 * @returns {{ valid: boolean, seconds: number, error: string | null }}
 */
export function parseTimestamp(input) {
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

  // Pure number check (e.g. "130" or "130.5")
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
      return { valid: false, seconds: 0, error: 'Format must be MM:SS (with seconds < 60).' };
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

/**
 * Formats a duration in seconds to standard "HH:MM:SS" or "MM:SS".
 * @param {number} totalSeconds
 * @param {boolean} [forceHours=false]
 * @returns {string}
 */
export function formatTimestamp(totalSeconds, forceHours = false) {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) {
    return '00:00';
  }

  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  const seconds = safeSec % 60;

  const pad = (num) => num.toString().padStart(2, '0');

  if (hours > 0 || forceHours) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Validates start and end time against each other and optional duration.
 * @param {number} startSeconds
 * @param {number} endSeconds
 * @param {number} [videoDuration=0]
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateTimeRange(startSeconds, endSeconds, videoDuration = 0) {
  if (startSeconds < 0) {
    return { valid: false, error: 'Start time cannot be negative.' };
  }

  if (endSeconds <= startSeconds) {
    return { valid: false, error: 'End time must be after the start time.' };
  }

  if (videoDuration > 0) {
    if (startSeconds >= videoDuration) {
      return { valid: false, error: 'Start time cannot exceed video duration.' };
    }
    if (endSeconds > videoDuration) {
      return { valid: false, error: 'Selected timestamp exceeds the video duration.' };
    }
  }

  return { valid: true, error: null };
}
