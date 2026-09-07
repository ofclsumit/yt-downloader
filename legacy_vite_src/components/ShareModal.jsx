import React, { useState } from 'react';
import { copyToClipboard } from '../utils/share';
import { getNativeYouTubeUrl } from '../utils/youtube';
import { formatTimestamp } from '../utils/time';
import { useToast } from './common/Toast';

export default function ShareModal({
  isOpen,
  onClose,
  videoId,
  startTime,
  endTime,
  shareUrl,
}) {
  const [copied, setCopied] = useState(false);
  let toast;
  try {
    toast = useToast();
  } catch (e) {
    toast = null;
  }

  if (!isOpen) return null;

  const handleCopy = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopied(true);
      if (toast) toast.success('Clip link copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const nativeYtUrl = getNativeYouTubeUrl(videoId, startTime);
  const durationSec = Math.max(0, endTime - startTime);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="share-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="share-title" className="modal-title">Share Clip</h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close share modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Anyone with this link will open this exact video with your selected start and end boundaries ready to preview.
        </p>

        {/* Clip Summary Card */}
        <div className="share-details-list">
          <div className="share-detail-item">
            <span>Video ID:</span>
            <span>{videoId}</span>
          </div>
          <div className="share-detail-item">
            <span>Clip Range:</span>
            <span>{formatTimestamp(startTime)} &rarr; {formatTimestamp(endTime)}</span>
          </div>
          <div className="share-detail-item">
            <span>Clip Duration:</span>
            <span>{formatTimestamp(durationSec)} ({durationSec}s)</span>
          </div>
        </div>

        {/* Share Link Input + Copy Button */}
        <div className="share-link-box">
          <input
            type="text"
            className="share-link-input"
            value={shareUrl}
            readOnly
            onFocus={(e) => e.target.select()}
            aria-label="Generated clip link"
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleCopy}
            style={{ height: '42px', padding: '0 1.25rem' }}
          >
            {copied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                <span>Link copied</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Copy Share Link</span>
              </>
            )}
          </button>
        </div>

        {/* Native YouTube Option */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
          <a
            href={nativeYtUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ width: '100%', textDecoration: 'none', gap: '0.6rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
            </svg>
            <span>Open on YouTube at {formatTimestamp(startTime)}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <p className="share-notice">
            Note: YouTube only starts playback from your start time; YouTube does not natively enforce an end boundary. The full clip experience with automatic end pause is preserved when viewing through this application.
          </p>
        </div>
      </div>
    </div>
  );
}
