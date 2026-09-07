import React, { useState, useRef } from 'react';
import { extractYouTubeVideoId } from '../utils/youtube';
import CircularLoader from './common/CircularLoader';
import { useToast } from './common/Toast';
import { apiUrl } from '../config/api';

const SAMPLE_VIDEOS = [
  { label: 'Me at the zoo (Short 19s)', type: 'youtube', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { label: 'Big Buck Bunny (YouTube)', type: 'youtube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
  { label: 'Rick Astley (Music/Video)', type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  { label: 'Verified Sample Test', type: 'sample', id: 'sample:authorized' },
];

export default function YouTubeUrlInput({
  initialUrl = '',
  onLoadYouTube,
  onLoadChannel,
  onLoadLocalMedia,
  isLoading = false,
}) {
  const [activeTab, setActiveTab] = useState('url'); // 'url' | 'channel' | 'upload'
  const [url, setUrl] = useState(initialUrl);
  const [channelUrl, setChannelUrl] = useState('');
  const [inputError, setInputError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  let toast;
  try {
    toast = useToast();
  } catch (e) {
    toast = null;
  }

  const handleSubmitUrl = (e) => {
    if (e) e.preventDefault();
    setInputError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setInputError('Please enter a video URL.');
      return;
    }

    // Check if user entered a channel URL in video tab
    if (trimmed.includes('/@') || trimmed.includes('/channel/') || trimmed.includes('/c/') || trimmed.includes('/user/')) {
      if (onLoadChannel) {
        onLoadChannel(trimmed);
        return;
      }
    }

    // Check if it's the verified sample
    if (trimmed === 'sample:authorized') {
      onLoadLocalMedia({
        sourceRef: 'sample:authorized',
        mediaUrl: '/preview-media/sample_authorized.mp4',
        title: 'Verified Open-Source Sample Video',
        author: 'Authorized Media Test Source',
        duration: 45,
      });
      return;
    }

    const result = extractYouTubeVideoId(trimmed);
    if (!result.valid) {
      setInputError(result.error);
      return;
    }

    onLoadYouTube(result.videoId, trimmed);
  };

  const handleChannelSubmit = (e) => {
    if (e) e.preventDefault();
    setInputError(null);
    const trimmed = channelUrl.trim();
    if (!trimmed) {
      setInputError('Please enter a YouTube channel URL or @handle.');
      return;
    }
    if (onLoadChannel) {
      onLoadChannel(trimmed);
    }
  };

  const handleInputPaste = (e) => {
    const pastedText = e.clipboardData?.getData('text') || '';
    if (!pastedText.trim()) return;

    const trimmed = pastedText.trim();
    setUrl(trimmed);
    setInputError(null);
    if (toast) {
      toast.info('Video link pasted. Click "Analyze Video" to proceed.');
    }
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          const trimmed = text.trim();
          setUrl(trimmed);
          setInputError(null);
          if (toast) {
            toast.info('Video link pasted. Click "Analyze Video" to proceed.');
          }
        }
      }
    } catch (err) {
      console.warn('Clipboard read failed or permission denied:', err);
    }
  };

  const handleSampleClick = (sample) => {
    setInputError(null);
    const targetUrl = sample.type === 'sample' ? sample.id : sample.url;
    setUrl(targetUrl);
    if (toast) {
      toast.info(`Sample loaded: ${sample.label}. Click "Analyze Video" to proceed.`);
    }
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setInputError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(apiUrl('/api/upload'), {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload video file.');
      }

      const data = await res.json();
      onLoadLocalMedia({
        sourceRef: data.sourceRef,
        mediaUrl: data.mediaUrl,
        title: data.fileName,
        author: 'User Upload',
        duration: 0,
      });
    } catch (err) {
      setInputError(err.message || 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="card url-input-card">
      {/* Source Selection Tabs */}
      <div className="source-tabs-container">
        <button
          type="button"
          className={`source-tab-btn ${activeTab === 'url' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('url');
            setInputError(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
          </svg>
          <span>Single Clip</span>
        </button>

        <button
          type="button"
          className={`source-tab-btn ${activeTab === 'channel' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('channel');
            setInputError(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
          <span>Channel Scraper</span>
        </button>

        <button
          type="button"
          className={`source-tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('upload');
            setInputError(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>Upload File</span>
        </button>
      </div>

      {activeTab === 'url' && (
        <form onSubmit={handleSubmitUrl} className="url-input-form" noValidate>
          <div className="input-label-row">
            <label htmlFor="yt-url-input" className="input-label">
              Paste Online Video URL
            </label>
            <span className="url-examples-hint">Supports Shorts, Clips &amp; Videos</span>
          </div>

          <div className="input-action-row">
            <div className="url-input-wrapper">
              <span className="input-prefix-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </span>

              <input
                id="youtube-url-input"
                type="url"
                inputMode="url"
                className="url-text-input"
                placeholder="Paste video link (e.g. https://www.youtube.com/watch?v=...)"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (inputError) setInputError(null);
                }}
                onPaste={handleInputPaste}
                autoComplete="off"
                spellCheck="false"
                required
                aria-invalid={!!inputError}
              />

              <button
                type="button"
                className="input-paste-btn"
                onClick={handlePaste}
                title="Paste from clipboard"
                aria-label="Paste link from clipboard"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>Paste</span>
              </button>
            </div>

            <button
              type="submit"
              className={`btn-primary ${isLoading ? 'btn-loading' : ''}`}
              disabled={isLoading || !url.trim()}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
                  <CircularLoader size="sm" color="#ffffff" />
                  <span>Analyzing video...</span>
                </span>
              ) : (
                <>
                  <span>Analyze Video</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </>
              )}
            </button>
          </div>

          <div className="quick-samples">
            <span className="quick-sample-label">Quick samples:</span>
            {SAMPLE_VIDEOS.map((sample) => (
              <button
                key={sample.label}
                type="button"
                className="quick-sample-chip"
                onClick={() => handleSampleClick(sample)}
                style={sample.type === 'sample' ? { borderColor: 'var(--accent-emerald)', color: '#6ee7b7' } : {}}
              >
                {sample.label}
              </button>
            ))}
          </div>
        </form>
      )}

      {activeTab === 'channel' && (
        <form onSubmit={handleChannelSubmit} className="url-input-form">
          <div className="input-label-row">
            <label htmlFor="channel-url-input" className="input-label">
              Channel Batch Scraping &amp; Auto-Categorized Downloader
            </label>
            <span className="url-examples-hint">Ultra-Fast Lossless Engine</span>
          </div>

          <div className="input-action-row">
            <div className="url-input-wrapper">
              <span className="input-prefix-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
                </svg>
              </span>

              <input
                id="channel-url-input"
                type="text"
                className="url-text-input"
                placeholder="https://www.youtube.com/@CareerGenie1/shorts or channel URL"
                value={channelUrl}
                onChange={(e) => {
                  setChannelUrl(e.target.value);
                  if (inputError) setInputError(null);
                }}
                autoComplete="off"
                spellCheck="false"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={!channelUrl.trim()}>
              <span>Scrape Channel</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>
            Automatically discover all channel videos and shorts, organize into smart categories, and download batch clips directly.
          </div>
        </form>
      )}

      {activeTab === 'upload' && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFileDrop}
          style={{
            border: '2px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: 'var(--bg-input)',
            cursor: 'pointer',
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem auto', display: 'block' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>

          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
            {isUploading ? 'Uploading & Preparing Video...' : 'Click or Drag & Drop Video File'}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Supports MP4, WebM, MOV with fast lossless processing.
          </div>
        </div>
      )}

      {inputError && (
        <div className="alert-box alert-danger" style={{ marginTop: '1rem' }}>
          <svg className="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{inputError}</span>
        </div>
      )}
    </div>
  );
}
