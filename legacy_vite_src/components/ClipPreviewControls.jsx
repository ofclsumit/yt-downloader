import React from 'react';
import { formatTimestamp } from '../utils/time';

export default function ClipPreviewControls({
  startTime,
  endTime,
  currentTime,
  isPlaying,
  isPreviewingClip,
  isClipFinished,
  onPreviewClip,
  onPauseClip,
  onReplayClip,
  onProceedToQuality,
  onShareClick,
  onReset,
  isValidRange,
}) {
  const clipDuration = Math.max(0, endTime - startTime);
  const currentElapsed =
    currentTime !== null && currentTime !== undefined
      ? Math.max(0, Math.min(clipDuration, currentTime - startTime))
      : 0;

  const clipProgressPercent =
    clipDuration > 0 ? Math.min(100, Math.max(0, (currentElapsed / clipDuration) * 100)) : 0;

  return (
    <div className="clip-controls-wrapper">
      {/* Live Clip Progress Indicator Bar */}
      <div className="clip-preview-bar">
        <div className="preview-status-badge">
          {isPreviewingClip && isPlaying ? (
            <>
              <span className="status-dot" style={{ background: 'var(--accent-red)' }} />
              <span>Playing Clip Preview</span>
            </>
          ) : isClipFinished ? (
            <>
              <span className="status-dot" style={{ background: 'var(--accent-emerald)' }} />
              <span>Clip Preview Finished</span>
            </>
          ) : (
            <>
              <span className="status-dot" style={{ background: 'var(--text-muted)' }} />
              <span>Clip Range Selected</span>
            </>
          )}
        </div>

        <div className="preview-progress-meter">
          <span>{formatTimestamp(startTime)}</span>
          <div className="progress-track-mini">
            <div className="progress-fill-mini" style={{ width: `${clipProgressPercent}%` }} />
          </div>
          <span>{formatTimestamp(endTime)}</span>
        </div>

        <div className="preview-time-digits">
          {formatTimestamp(currentTime !== null ? currentTime : startTime)} / {formatTimestamp(endTime)}
        </div>
      </div>


      {/* Editor Action Buttons for Step 2 */}
      <div className="editor-actions-row">
        <div className="primary-action-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          {/* Clip Playback Preview Toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
            {isClipFinished ? (
              <button
                type="button"
                className="btn-secondary btn-action-replay"
                onClick={onReplayClip}
                disabled={!isValidRange}
                style={{ flex: 1 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                </svg>
                <span>Replay Preview</span>
              </button>
            ) : isPreviewingClip && isPlaying ? (
              <button
                type="button"
                className="btn-secondary btn-action-pause"
                onClick={onPauseClip}
                style={{ flex: 1, color: 'var(--accent-amber)' }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                <span>Pause Preview</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary btn-action-preview"
                onClick={onPreviewClip}
                disabled={!isValidRange}
                style={{ flex: 1 }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>Preview Selected Clip</span>
              </button>
            )}
          </div>

          {/* Primary Proceed Button (Step 2 -> Step 3) */}
          <button
            type="button"
            className="btn-primary btn-proceed-quality"
            onClick={onProceedToQuality}
            disabled={!isValidRange}
            style={{
              width: '100%',
              padding: '0.9rem 1.25rem',
              fontSize: '1rem',
              fontWeight: 700,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.65rem',
              cursor: isValidRange ? 'pointer' : 'not-allowed',
            }}
            title={isValidRange ? "Proceed to select video quality and download options" : "Please select a valid start and end time"}
          >
            <span>Next: Choose Quality &amp; Download</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>

        {/* Secondary utilities */}
        <div className="secondary-action-group" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onShareClick}
            disabled={!isValidRange}
            style={{ fontSize: '0.85rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Share Timestamps</span>
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={onReset}
            title="Reset clip and load another video"
            style={{ fontSize: '0.85rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
