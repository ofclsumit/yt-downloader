/**
 * YouTube URL extraction and validation utility
 * Strictly validates domain and extracts 11-character video ID.
 */

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
]);

/**
 * Extracts and validates YouTube video ID from arbitrary URL string.
 * @param {string} rawUrl
 * @returns {{ valid: boolean, videoId: string | null, error: string | null }}
 */
export function extractYouTubeVideoId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, videoId: null, error: 'Please enter a YouTube video URL.' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, videoId: null, error: 'Please enter a YouTube video URL.' };
  }

  let parsedUrl;
  try {
    // If user forgot protocol, prepend https://
    const urlWithProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsedUrl = new URL(urlWithProto);
  } catch (err) {
    return { valid: false, videoId: null, error: 'Please enter a valid YouTube video URL.' };
  }

  // Domain check
  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  const isAllowedHost = Array.from(ALLOWED_HOSTS).some(
    (allowed) => hostname === allowed || hostname === allowed.replace(/^www\./, '')
  );

  if (!isAllowedHost) {
    return {
      valid: false,
      videoId: null,
      error: 'Unsupported domain. Please enter a valid YouTube link (youtube.com or youtu.be).',
    };
  }

  let videoId = null;

  // Pattern 1: youtu.be/VIDEO_ID
  if (hostname === 'youtu.be') {
    const pathname = parsedUrl.pathname.replace(/^\/+/, '');
    const firstSegment = pathname.split('/')[0];
    if (firstSegment) {
      videoId = firstSegment;
    }
  }

  // Pattern 2: youtube.com/watch?v=VIDEO_ID
  if (!videoId && parsedUrl.pathname === '/watch') {
    videoId = parsedUrl.searchParams.get('v');
  }

  // Pattern 3: youtube.com/shorts/VIDEO_ID or youtube.com/embed/VIDEO_ID or youtube.com/v/VIDEO_ID
  if (!videoId) {
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && ['shorts', 'embed', 'v', 'live'].includes(segments[0])) {
      videoId = segments[1];
    }
  }

  // Validate standard YouTube 11-char video ID
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: false,
      videoId: null,
      error: 'Could not find a valid 11-character YouTube video ID.',
    };
  }

  return { valid: true, videoId, error: null };
}

/**
 * Returns clean YouTube video URL
 * @param {string} videoId
 * @param {number} [startTimeSeconds]
 * @returns {string}
 */
export function getNativeYouTubeUrl(videoId, startTimeSeconds = 0) {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const startInt = Math.floor(Math.max(0, startTimeSeconds));
  if (startInt > 0) {
    return `${base}&t=${startInt}s`;
  }
  return base;
}

/**
 * Returns YouTube thumbnail URL
 * @param {string} videoId
 * @param {'maxres'|'hq'|'mq'|'default'} quality
 * @returns {string}
 */
export function getYouTubeThumbnailUrl(videoId, quality = 'hq') {
  if (!videoId) return '';
  if (quality === 'maxres') {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  if (quality === 'hq') {
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
