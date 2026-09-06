import React from 'react';
import { formatTimestamp } from '../utils/time';
import QualitySelector from './QualitySelector';

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
  onCreateClip,
  onDownloadFullVideo,
  onShareClick,
  onReset,
  isValidRange,
  selectedQuality = '1080',
  availableQualities = [],
  onChangeQuality,
  isLoadingQualities = false,
  qualityError = null,
  onRetryQualities,
}) {
  const clipDuration = Math.max(0, endTime - startTime);
  const currentElapsed =
    currentTime !== null && currentTime !== undefined
      ? Math.max(0, Math.min(clipDuration, currentTime - startTime))
      : 0;

  const clipProgressPercent =
    clipDuration > 0 ? Math.min(100, Math.max(0, (currentElapsed / clipDuration) * 100)) : 0;

  const isAudio = selectedQuality === 'mp3';
  const selectedObj = availableQualities.find((q) => q.id === selectedQuality);
  const qualityBadgeText = selectedObj
    ? (isAudio ? 'MP3 Audio' : selectedObj.label)
    : (isAudio ? 'MP3 Audio' : (selectedQuality === 'best' ? 'Best Quality' : `${selectedQuality}p MP4`));

  return (
    <div className="clip-controls-wrapper">
      {/* Live Clip Progress Indicator Bar */}
      <div className="clip-preview-bar">
        <div className="preview-status-badge">
          {isPreviewingClip && isPlaying ? (
            <>
              <span className="status-dot" style={{ background: 'var(--accent-red)' }} />
              <span>Playing Clip</span>
            </>
          ) : isClipFinished ? (
            <>
              <span className="status-dot" style={{ background: 'var(--accent-emerald)' }} />
              <span>Clip Finished</span>
            </>
          ) : (
            <>
              <span className="status-dot" style={{ background: 'var(--text-muted)' }} />
              <span>Clip Ready</span>
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

      {/* Format & Quality Selector */}
      <QualitySelector
        availableQualities={availableQualities}
        selectedQuality={selectedQuality}
        onChangeQuality={onChangeQuality}
        isLoading={isLoadingQualities}
        error={qualityError}
        onRetry={onRetryQualities}
      />

      {/* Editor Action Buttons */}
      <div className="editor-actions-row">
        <div className="primary-action-group">
          {isClipFinished ? (
            <button
              type="button"
              className="btn-primary btn-action-replay"
              onClick={onReplayClip}
              disabled={!isValidRange}
              style={{ background: 'var(--accent-emerald)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
              </svg>
              <span>Replay Clip</span>
            </button>
          ) : isPreviewingClip && isPlaying ? (
            <button
              type="button"
              className="btn-primary btn-action-pause"
              onClick={onPauseClip}
              style={{ background: 'var(--accent-amber)', color: '#000000' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              <span>Pause Clip</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary btn-action-preview"
              onClick={onPreviewClip}
              disabled={!isValidRange}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Preview Clip</span>
            </button>
          )}

          {/* Download Selected Clip */}
          <button
            type="button"
            className="btn-primary btn-action-clip"
            onClick={onCreateClip}
            disabled={!isValidRange}
            style={{
              background: isAudio
                ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              boxShadow: isAudio
                ? '0 4px 14px rgba(236, 72, 153, 0.35)'
                : '0 4px 14px rgba(99, 102, 241, 0.35)',
              fontWeight: 700,
            }}
            title={`Download trimmed ${qualityBadgeText}`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
            <span>Download Clip ({qualityBadgeText})</span>
          </button>

          {/* Download Full Video / Audio */}
          <button
            type="button"
            className="btn-primary btn-action-full"
            onClick={onDownloadFullVideo}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              fontWeight: 600,
            }}
            title={`Download full ${qualityBadgeText} into categorized folder`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Download Full ({qualityBadgeText})</span>
          </button>
        </div>

        <div className="secondary-action-group">
          <button
            type="button"
            className="btn-secondary"
            onClick={onShareClick}
            disabled={!isValidRange}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Share</span>
          </button>

          <button
            type="button"
            className="btn-ghost"
            onClick={onReset}
            title="Reset clip and load another video"
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
