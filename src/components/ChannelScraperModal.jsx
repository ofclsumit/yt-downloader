import React, { useState, useEffect } from 'react';
import { apiUrl } from '../config/api';

export default function ChannelScraperModal({ isOpen, onClose, initialChannelUrl }) {
  const [channelUrl, setChannelUrl] = useState(initialChannelUrl || '');
  const [statusData, setStatusData] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialChannelUrl) {
      setChannelUrl(initialChannelUrl);
    }
  }, [initialChannelUrl]);

  useEffect(() => {
    if (!isOpen) return;

    let isSubscribed = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(apiUrl('/api/channel/status'));
        if (res.ok) {
          const data = await res.json();
          if (isSubscribed) setStatusData(data);
        }
      } catch (err) {
        console.warn('Failed to poll channel status:', err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  const handleStartScraping = async (e) => {
    if (e) e.preventDefault();
    if (!channelUrl.trim()) return;

    setError(null);
    setIsStarting(true);
    try {
      const res = await fetch(apiUrl('/api/channel/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_url: channelUrl.trim(), start_from: 0 }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to start channel scraping');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  if (!isOpen) return null;

  const isRunning = statusData?.is_running || false;
  const totalFound = statusData?.total_found || 0;
  const downloadedCount = statusData?.downloaded_count || 0;
  const logs = statusData?.logs || [];

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="channel-title">
      <div className="modal-content" style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3 id="channel-title" className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📺</span>
            <span>Channel Batch Downloader</span>
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '0.75rem 0' }}>
          <form onSubmit={handleStartScraping} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="url"
              className="url-text-input"
              style={{ flex: '1 1 240px', minWidth: '0' }}
              placeholder="e.g. https://www.youtube.com/@CareerGenie1/shorts"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              disabled={isRunning}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={isRunning || isStarting || !channelUrl.trim()}
              style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', flex: '1 1 140px', whiteSpace: 'nowrap' }}
            >
              {isRunning ? 'Scraping Active...' : isStarting ? 'Starting...' : 'Start Batch Scrape'}
            </button>
          </form>

          {error && (
            <div className="alert-box alert-danger" style={{ marginBottom: '1rem' }}>
              <span>{error}</span>
            </div>
          )}

          {/* Status Metrics Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
              <div style={{ fontWeight: 700, color: isRunning ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                {isRunning ? '● Running' : 'Idle'}
              </div>
            </div>
            <div style={{ background: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Videos Found</div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{totalFound}</div>
            </div>
            <div style={{ background: 'var(--bg-input)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Downloaded</div>
              <div style={{ fontWeight: 700, color: '#38bdf8' }}>{downloadedCount}</div>
            </div>
          </div>

          {/* Terminal Logs Output */}
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Live Processing Stream:
          </div>
          <div
            style={{
              background: '#090d16',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.75rem',
              height: '220px',
              overflowY: 'auto',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '0.75rem',
              color: '#94a3b8',
              lineHeight: 1.45,
            }}
          >
            {logs.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No active downloads. Click "Start Batch Scrape" to launch the automated channel downloader.
              </div>
            ) : (
              logs.map((line, idx) => (
                <div key={idx} style={{ color: line.includes('Successfully') ? '#4ade80' : line.includes('Error') ? '#f87171' : '#cbd5e1' }}>
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
