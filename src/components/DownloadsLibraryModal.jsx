import React, { useState, useEffect } from 'react';
import { apiUrl } from '../config/api';

export default function DownloadsLibraryModal({ isOpen, onClose }) {
  const [downloads, setDownloads] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    if (!isOpen) return;

    const fetchDownloads = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(apiUrl('/api/downloads'));
        if (res.ok) {
          const data = await res.json();
          setDownloads(data.downloads || []);
        }
      } catch (err) {
        console.warn('Failed to load downloads list:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDownloads();
  }, [isOpen]);

  if (!isOpen) return null;

  const categories = ['all', ...Array.from(new Set(downloads.map((d) => d.category)))];
  const filteredDownloads = activeCategory === 'all'
    ? downloads
    : downloads.filter((d) => d.category === activeCategory);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="lib-title">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h3 id="lib-title" className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📁</span>
            <span>Saved Downloads Library ({downloads.length})</span>
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '0.75rem 0' }}>
          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className="quick-sample-chip"
                onClick={() => setActiveCategory(cat)}
                style={{
                  textTransform: 'capitalize',
                  borderColor: activeCategory === cat ? 'var(--accent-emerald)' : 'var(--border-subtle)',
                  color: activeCategory === cat ? '#6ee7b7' : 'var(--text-secondary)',
                  background: activeCategory === cat ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                }}
              >
                {cat} ({cat === 'all' ? downloads.length : downloads.filter((d) => d.category === cat).length})
              </button>
            ))}
          </div>

          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading downloads...
            </div>
          ) : filteredDownloads.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No downloaded videos in this category yet. Download videos from the main screen or run the channel scraper!
            </div>
          ) : (
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {filteredDownloads.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, marginRight: '1rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.fileName}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      📁 Category: <span style={{ color: 'var(--accent-emerald)', textTransform: 'capitalize' }}>{item.category}</span> • {item.sizeMb} MB
                    </div>
                  </div>

                  <a
                    href={apiUrl(item.downloadUrl)}
                    download={item.fileName}
                    className="btn-secondary"
                    style={{ textDecoration: 'none', padding: '0.4rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          )}
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
