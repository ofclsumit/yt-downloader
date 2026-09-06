import React, { useEffect, useState } from 'react';
import { apiUrl } from '../config/api';

export default function AdminMetricsModal({ isOpen, onClose }) {
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [mRes, hRes] = await Promise.all([
          fetch(apiUrl('/api/admin/metrics')),
          fetch(apiUrl('/api/health')),
        ]);
        if (mRes.ok && hRes.ok) {
          setMetrics(await mRes.json());
          setHealth(await hRes.json());
        }
      } catch (err) {
        console.warn('Failed to fetch metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h3 id="admin-title" className="modal-title">System &amp; Pipeline Observability</h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close metrics modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading && !metrics ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading operational telemetry...
          </div>
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div className="timestamp-field">
                <span className="field-label">Active Workers</span>
                <span className="field-value-display" style={{ fontSize: '1.2rem', color: 'var(--accent-emerald)' }}>
                  {metrics?.activeWorkers} / {metrics?.maxWorkers}
                </span>
                <span className="field-inline-msg">FFmpeg worker concurrency</span>
              </div>

              <div className="timestamp-field">
                <span className="field-label">Queue Depth</span>
                <span className="field-value-display" style={{ fontSize: '1.2rem', color: 'var(--accent-blue)' }}>
                  {metrics?.queued} pending
                </span>
                <span className="field-inline-msg">Jobs waiting in queue</span>
              </div>

              <div className="timestamp-field">
                <span className="field-label">Completed Jobs</span>
                <span className="field-value-display" style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  {metrics?.completed}
                </span>
                <span className="field-inline-msg">{metrics?.totalJobs} total jobs processed</span>
              </div>

              <div className="timestamp-field">
                <span className="field-label">Temporary Storage</span>
                <span className="field-value-display" style={{ fontSize: '1.2rem', color: 'var(--accent-amber)' }}>
                  {metrics?.totalStorageFormatted}
                </span>
                <span className="field-inline-msg">Auto-purged after 15 mins</span>
              </div>
            </div>

            <div className="share-details-list">
              <div className="share-detail-item">
                <span>API Status:</span>
                <span style={{ color: 'var(--accent-emerald)' }}>{health?.status || 'Online'}</span>
              </div>
              <div className="share-detail-item">
                <span>Server Uptime:</span>
                <span>{health?.uptimeSeconds ? `${health.uptimeSeconds}s` : 'Active'}</span>
              </div>
              <div className="share-detail-item">
                <span>Cleanup Daemon:</span>
                <span>Running (Every 60s)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
