/**
 * YouTube URL validation and video ID extraction utility.
 */

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'music.youtube.com',
]);

export interface VideoIdResult {
  valid: boolean;
  videoId: string | null;
  error: string | null;
}

export function extractYouTubeVideoId(rawUrl: string | null | undefined): VideoIdResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, videoId: null, error: 'Please enter a valid YouTube URL.' };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, videoId: null, error: 'Please enter a valid YouTube URL.' };
  }

  let parsedUrl: URL;
  try {
    const urlWithProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsedUrl = new URL(urlWithProto);
  } catch {
    return { valid: false, videoId: null, error: 'Please enter a valid URL.' };
  }

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

  let videoId: string | null = null;

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

  // Pattern 3: youtube.com/shorts/VIDEO_ID, /embed/VIDEO_ID, /live/VIDEO_ID
  if (!videoId) {
    const segments = parsedUrl.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && ['shorts', 'embed', 'v', 'live'].includes(segments[0])) {
      videoId = segments[1];
    }
  }

  // Verify YouTube 11-character video ID regex
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return {
      valid: false,
      videoId: null,
      error: 'Could not extract a valid 11-character YouTube video ID.',
    };
  }

  return { valid: true, videoId, error: null };
}

export function getYouTubeThumbnailUrl(
  videoId: string,
  quality: 'maxres' | 'hq' | 'mq' | 'default' = 'hq'
): string {
  if (!videoId) return '';
  const qualityMap = {
    maxres: 'maxresdefault.jpg',
    hq: 'hqdefault.jpg',
    mq: 'mqdefault.jpg',
    default: 'default.jpg',
  };
  return `https://i.ytimg.com/vi/${videoId}/${qualityMap[quality] || 'hqdefault.jpg'}`;
}

export function getNativeYouTubeUrl(videoId: string, startSeconds = 0): string {
  const base = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const startInt = Math.floor(Math.max(0, startSeconds));
  return startInt > 0 ? `${base}&t=${startInt}s` : base;
}
