import React from 'react';
import { formatTimestamp } from '../utils/time';
import QualitySelector from './QualitySelector';

export default function QualityDownloadStep({
  startTime,
  endTime,
  duration,
  selectedQuality = '1080',
  availableQualities = [],
  onChangeQuality,
  isLoadingQualities = false,
  qualityError = null,
  onRetryQualities,
  onDownloadClip,
  onDownloadAudio,
  onBackToTimestamps,
  onShareClick,
  onReset,
}) {
  const clipDuration = Math.max(0, endTime - startTime);
  const isAudio = selectedQuality === 'mp3';
  const selectedObj = availableQualities.find((q) => q.id === selectedQuality);
  const qualityBadgeText = selectedObj
    ? (isAudio ? 'MP3 Audio' : selectedObj.label)
    : (isAudio ? 'MP3 Audio' : (selectedQuality === 'best' ? 'Best Quality' : `${selectedQuality}p MP4`));

  return (
    <div className="quality-download-step-wrapper">
      {/* Target Clip Summary Card */}
      <div
        className="card clip-target-summary-card"
        style={{
          padding: '1.15rem 1.35rem',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.09) 0%, rgba(168, 85, 247, 0.06) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: '14px',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a5b4fc', fontWeight: 700 }}>
              Selected Timestamp Range
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>{formatTimestamp(startTime)}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>&rarr;</span>
              <span>{formatTimestamp(endTime)}</span>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '9999px',
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                }}
              >
                {clipDuration}s clip
              </span>
            </div>
            <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
              Only this exact {clipDuration}-second segment will be fetched and processed locally. Full video will not be downloaded.
            </p>
          </div>

          <button
            type="button"
            className="btn-ghost"
            onClick={onBackToTimestamps}
            style={{
              fontSize: '0.82rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: 'rgba(255, 255, 255, 0.05)',
            }}
            title="Return to Step 2 to adjust timestamp range"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span>Change Timestamps</span>
          </button>
        </div>
      </div>

      {/* Step 3 Heading */}
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            3
          </span>
          <span>Choose Video Quality &amp; Download Options</span>
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
          Select the video resolution or audio format for your {clipDuration}s clip.
        </p>
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

      {/* Download Action Area */}
      <div className="download-options-card" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Primary Download Button for selected clip */}
        <button
          type="button"
          className="btn-primary"
          onClick={onDownloadClip}
          style={{
            width: '100%',
            padding: '0.95rem 1.5rem',
            fontSize: '1.05rem',
            fontWeight: 700,
            background: isAudio
              ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: isAudio
              ? '0 6px 20px rgba(236, 72, 153, 0.4)'
              : '0 6px 20px rgba(16, 185, 129, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.65rem',
            cursor: 'pointer',
          }}
          title={`Download only ${clipDuration}s clip at ${qualityBadgeText}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Download Clip ({qualityBadgeText})</span>
        </button>

        {/* Quick MP3 Audio Download Option if currently on Video quality */}
        {!isAudio && onDownloadAudio && (
          <button
            type="button"
            className="btn-secondary"
            onClick={onDownloadAudio}
            style={{
              width: '100%',
              padding: '0.75rem 1.25rem',
              fontSize: '0.88rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: '1px solid rgba(236, 72, 153, 0.3)',
              background: 'rgba(236, 72, 153, 0.08)',
              color: '#f472b6',
            }}
            title={`Extract audio from selected ${clipDuration}s range`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <span>Or Download as MP3 Audio ({clipDuration}s)</span>
          </button>
        )}

        {/* Navigation & Utilities Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onBackToTimestamps}
            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Timestamps</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={onShareClick}
              style={{ fontSize: '0.85rem' }}
              title="Share timestamp clip link"
            >
              Share
            </button>

            <button
              type="button"
              className="btn-ghost"
              onClick={onReset}
              style={{ fontSize: '0.85rem', color: '#fca5a5' }}
              title="End session and start over"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
