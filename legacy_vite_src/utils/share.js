/**
 * Share URL creation, parameter extraction, and clipboard copy utilities
 */

/**
 * Builds deterministic share URL
 * @param {string} videoId
 * @param {number} start
 * @param {number} end
 * @returns {string}
 */
export function buildShareUrl(videoId, start, end) {
  if (!videoId) return '';
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('v', videoId);
  url.searchParams.set('start', Math.floor(start).toString());
  url.searchParams.set('end', Math.floor(end).toString());
  return url.toString();
}

/**
 * Parses query parameters from current window location or given search string.
 * @param {string} [searchStr]
 * @returns {{ videoId: string | null, start: number | null, end: number | null }}
 */
export function parseShareParams(searchStr = window.location.search) {
  const params = new URLSearchParams(searchStr);
  const videoId = params.get('v') || params.get('video');
  const startRaw = params.get('start');
  const endRaw = params.get('end');

  let start = null;
  let end = null;

  if (startRaw !== null && !isNaN(Number(startRaw))) {
    start = Math.max(0, parseInt(startRaw, 10));
  }

  if (endRaw !== null && !isNaN(Number(endRaw))) {
    end = Math.max(0, parseInt(endRaw, 10));
  }

  return {
    videoId: videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null,
    start,
    end,
  };
}

/**
 * Copies text to clipboard with graceful fallback
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('Clipboard API error, attempting fallback:', err);
    }
  }

  // Fallback using textarea + execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback clipboard copy failed:', err);
    return false;
  }
}
