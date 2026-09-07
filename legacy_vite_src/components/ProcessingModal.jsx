import React, { useEffect, useState } from 'react';
import { formatTimestamp } from '../utils/time';
import CircularLoader from './common/CircularLoader';
import { apiUrl } from '../config/api';

export default function ProcessingModal({
  isOpen,
  jobId,
  onClose,
  onCancel,
  start,
  end,
  isFullVideo,
  quality = '1080',
  availableQualities = [],
  onReset,
}) {
  const [jobState, setJobState] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isOpen || !jobId) {
      setJobState(null);
      setPollError(null);
      return;
    }

    let isSubscribed = true;
    let timerId = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch(apiUrl(`/api/clips/${jobId}`));
        if (!res.ok) {
          throw new Error('Could not retrieve job status.');
        }
        const data = await res.json();
        if (!isSubscribed) return;

        setJobState(data);

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          if (timerId) clearInterval(timerId);
        }
      } catch (err) {
        if (isSubscribed) {
          setPollError(err.message);
        }
      }
    };

    fetchStatus();
    timerId = setInterval(fetchStatus, 600);

    return () => {
      isSubscribed = false;
      if (timerId) clearInterval(timerId);
    };
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const status = jobState?.status || 'queued';
  const progress = jobState?.progress || 0;
  const clipDuration = Math.max(0, (end || 0) - (start || 0));

  const isAudio = quality === 'mp3';
  const selectedObj = availableQualities.find((q) => q.id === quality) || {
    id: quality,
    label: isAudio ? 'MP3 Audio' : (quality === 'best' ? 'Best Available' : `${quality}p`),
    badge: quality === 'best' ? 'Auto' : (isAudio ? 'Audio' : 'Video'),
    ext: isAudio ? 'mp3' : 'mp4',
  };

  const handleCancelClick = async () => {
    if (onCancel && jobId) {
      await onCancel(jobId);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="proc-title">
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 id="proc-title" className="modal-title">
            {status === 'completed'
              ? 'Your clip is ready'
              : status === 'failed'
              ? 'Download Failed'
              : status === 'cancelled'
              ? 'Job Cancelled'
              : isFullVideo
              ? 'Downloading Full Media'
              : 'Creating your clip'}
          </h3>
          {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* PROCESSING & QUEUED STATES (Requirements 10, 11, 12) */}
        {(status === 'queued' || status === 'processing') && (
          <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
            {/* Selected Configuration Badge */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.05rem' }}>
                  {selectedObj.label}
                </span>
                {selectedObj.badge && (
                  <span className={`quality-badge quality-badge-${selectedObj.badge.toLowerCase()}`}>
                    {selectedObj.badge}
                  </span>
                )}
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {isAudio ? 'MP3' : (selectedObj.ext || 'MP4').toUpperCase()}
                </span>
              </div>

              {!isFullVideo && (
                <div style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 600 }}>
                  {formatTimestamp(start)} &rarr; {formatTimestamp(end)} ({clipDuration}s)
                </div>
              )}
            </div>

            {/* Circular Loading Indicator (Requirement 10 & 11) */}
            <div style={{ margin: '1.5rem auto 1.25rem auto' }}>
              <CircularLoader
                size="lg"
                color="var(--accent-primary)"
                progress={progress > 0 && progress < 100 ? progress : null}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                {status === 'queued'
                  ? 'Queued in processing engine...'
                  : progress >= 90
                  ? (jobState?.step || 'Finalizing clip with FFmpeg...')
                  : `Processing: ${progress}%`}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {jobState?.step && progress < 90
                  ? jobState.step
                  : isFullVideo
                  ? 'Downloading media and organizing by category'
                  : 'Extracting precise timestamp range with FFmpeg'}
              </div>
              {pollError && (
                <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginTop: '0.4rem' }}>
                  Connection warning: {pollError}
                </div>
              )}
            </div>

            {/* Progress Bar (Shows real progress if > 0) */}
            {progress > 0 && (
              <div
                style={{
                  height: '8px',
                  background: 'var(--bg-input)',
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  position: 'relative',
                  marginBottom: '1.5rem',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.max(5, progress)}%`,
                    background: 'linear-gradient(90deg, #6366f1, #10b981)',
                    borderRadius: '9999px',
                    transition: 'width 0.3s ease-out',
                  }}
                />
              </div>
            )}

            <button
              type="button"
              className="btn-ghost"
              onClick={handleCancelClick}
              style={{ color: '#fca5a5' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span>Cancel</span>
            </button>
          </div>
        )}

        {/* COMPLETED STATE (Requirements 14, 15) */}
        {status === 'completed' && (
          <div style={{ padding: '0.5rem 0', animation: 'successScale var(--duration-smooth) var(--ease-spring)' }}>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '1.25rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--accent-emerald)">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.1rem' }}>
                  Your clip is ready
                </span>
              </div>

              <div className="share-details-list" style={{ background: 'transparent', padding: 0 }}>
                <div className="share-detail-item">
                  <span>File Name:</span>
                  <span style={{ wordBreak: 'break-all', fontWeight: 600 }}>{jobState.fileName || 'video.mp4'}</span>
                </div>
                <div className="share-detail-item">
                  <span>Category:</span>
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, textTransform: 'capitalize' }}>
                    {jobState.category || 'General'}
                  </span>
                </div>
                {!isFullVideo && (
                  <div className="share-detail-item">
                    <span>Clip Range:</span>
                    <span>{formatTimestamp(start)} &rarr; {formatTimestamp(end)} ({clipDuration}s)</span>
                  </div>
                )}
                <div className="share-detail-item">
                  <span>Quality &amp; Format:</span>
                  <span style={{ fontWeight: 700, color: isAudio ? '#ec4899' : '#38bdf8' }}>
                    {selectedObj.label} &bull; {isAudio ? 'MP3 Audio' : 'MP4 Video'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <a
                href={jobState.downloadUrl ? apiUrl(jobState.downloadUrl) : apiUrl(`/api/clips/${jobId}/download`)}
                download={jobState.fileName || 'video.mp4'}
                className={`btn-primary ${isDownloading ? 'btn-loading' : ''}`}
                style={{
                  width: '100%',
                  textDecoration: 'none',
                  background: 'var(--accent-emerald)',
                  textAlign: 'center',
                  justifyContent: 'center',
                }}
                onClick={() => {
                  setIsDownloading(true);
                  setTimeout(() => setIsDownloading(false), 2000);
                }}
              >
                {isDownloading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CircularLoader size="sm" color="#ffffff" />
                    <span>Preparing Download...</span>
                  </span>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download Clip</span>
                  </>
                )}
              </a>

              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  if (onReset) onReset();
                }}
              >
                Create Another Clip
              </button>
            </div>

            <p className="share-notice" style={{ textAlign: 'center', marginTop: '1rem' }}>
              Your download is ready. Click the button above to save the file to your device.
            </p>
          </div>
        )}

        {/* FAILED STATE */}
        {status === 'failed' && (
          <div style={{ padding: '1rem 0' }}>
            <div className="alert-box alert-danger" style={{ marginBottom: '1.25rem' }}>
              <svg className="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>{jobState?.error || 'Download failed. Please check the video URL and try again.'}</div>
            </div>

            <button type="button" className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>
              Close &amp; Try Again
            </button>
          </div>
        )}

        {/* CANCELLED STATE */}
        {status === 'cancelled' && (
          <div style={{ padding: '1rem 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Download job was cancelled.
            </p>
            <button type="button" className="btn-secondary" onClick={onClose} style={{ width: '100%' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
