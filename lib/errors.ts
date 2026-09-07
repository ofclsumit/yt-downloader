/**
 * Standard Error Codes and Friendly Error Messages.
 * Never expose raw stack traces or internal FFmpeg/yt-dlp errors to end users.
 */

export const ERROR_CODES = {
  INVALID_URL: 'INVALID_URL',
  VIDEO_UNAVAILABLE: 'VIDEO_UNAVAILABLE',
  VIDEO_PRIVATE: 'VIDEO_PRIVATE',
  AGE_RESTRICTED: 'AGE_RESTRICTED',
  REGION_RESTRICTED: 'REGION_RESTRICTED',
  TIMESTAMP_INVALID: 'TIMESTAMP_INVALID',
  CLIP_TOO_LONG: 'CLIP_TOO_LONG',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  STORAGE_FAILED: 'STORAGE_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  BOT_DETECTION: 'BOT_DETECTION',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_URL: 'Please enter a valid YouTube video URL (e.g., https://www.youtube.com/watch?v=...).',
  VIDEO_UNAVAILABLE: 'This video is unavailable, deleted, or cannot be accessed.',
  VIDEO_PRIVATE: 'This video is private and cannot be processed.',
  AGE_RESTRICTED: 'This video is age-restricted and requires account verification.',
  REGION_RESTRICTED: 'This video is geographically restricted and unavailable in the processing region.',
  TIMESTAMP_INVALID: 'Invalid timestamps. The end time must be greater than start time and within video bounds.',
  CLIP_TOO_LONG: 'The requested clip is too long. Please select a shorter timestamp range.',
  DOWNLOAD_FAILED: 'Failed to extract video data from YouTube. Please try again shortly.',
  PROCESSING_FAILED: 'An error occurred while trimming or encoding the media file.',
  STORAGE_FAILED: 'Failed to store or retrieve the generated clip from cloud storage.',
  RATE_LIMITED: 'Too many requests. Please wait a moment before creating another clip.',
  BOT_DETECTION: 'YouTube is currently blocking automated requests from the processing server. The administrator needs to configure a valid yt-dlp cookie session.',
  UNKNOWN_ERROR: 'Something went wrong while processing your clip. Please try again.',
};

export function getFriendlyErrorMessage(code?: string | null, fallback?: string | null): string {
  if (code && code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[code as ErrorCode];
  }
  return fallback || ERROR_MESSAGES.UNKNOWN_ERROR;
}
