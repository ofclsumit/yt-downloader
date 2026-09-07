import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Header({ onReset, onOpenMetrics, onOpenChannelScraper, onOpenLibrary }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  return (
    <header className="app-header">
      <div className="header-inner">
        <a
          href="/"
          className="brand-logo"
          onClick={(e) => {
            if (onReset) {
              e.preventDefault();
              onReset();
              setMobileMenuOpen(false);
            }
          }}
          title="YouTube Video & Clip Downloader"
          aria-label="YouTube Downloader Home"
        >
          <div className="brand-icon-wrap" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
            </svg>
          </div>
          <span className="brand-text">YouTube Clip</span>
          <span className="brand-badge">PRO</span>
        </a>

        {/* Desktop Navigation (visible >= 768px) */}
        <nav className="header-desktop-nav" aria-label="Desktop Navigation">
          <button
            type="button"
            className="btn-ghost nav-item"
            onClick={onOpenChannelScraper}
            title="Batch download YouTube channels"
          >
            <span>📺</span>
            <span>Channel Batch</span>
          </button>

          <button
            type="button"
            className="btn-ghost nav-item"
            onClick={onOpenLibrary}
            title="View downloaded files by category"
          >
            <span>📁</span>
            <span>Library</span>
          </button>

          <button
            type="button"
            className="header-status"
            onClick={onOpenMetrics}
            title="Engine Telemetry & Status"
          >
            <span className="status-dot" aria-hidden="true"></span>
            <span>Engine Online</span>
          </button>
        </nav>

        {/* Mobile Hamburger Button (< 768px) */}
        <button
          type="button"
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Slide-Out Drawer Navigation portaled to document.body */}
      {mobileMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="mobile-drawer-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation"
          >
            <div className="mobile-drawer-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f8fafc' }}>Menu</span>
                <span className="brand-badge" style={{ fontSize: '0.68rem' }}>FastAPI + yt-dlp</span>
              </div>
              <button
                type="button"
                className="mobile-drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mobile-drawer-links">
              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  onOpenChannelScraper();
                  setMobileMenuOpen(false);
                }}
              >
                <div className="drawer-item-icon">📺</div>
                <div className="drawer-item-text">
                  <span className="drawer-item-title">Channel Scraper</span>
                  <span className="drawer-item-sub">Batch scrape channel videos &amp; shorts</span>
                </div>
              </button>

              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  onOpenLibrary();
                  setMobileMenuOpen(false);
                }}
              >
                <div className="drawer-item-icon">📁</div>
                <div className="drawer-item-text">
                  <span className="drawer-item-title">Downloads Library</span>
                  <span className="drawer-item-sub">Saved videos organized by category</span>
                </div>
              </button>

              <button
                type="button"
                className="mobile-drawer-item"
                onClick={() => {
                  onOpenMetrics();
                  setMobileMenuOpen(false);
                }}
              >
                <div className="drawer-item-icon">⚡</div>
                <div className="drawer-item-text">
                  <span className="drawer-item-title">Engine Telemetry</span>
                  <span className="drawer-item-sub">FFmpeg &amp; yt-dlp worker status</span>
                </div>
              </button>

              {onReset && (
                <button
                  type="button"
                  className="mobile-drawer-item"
                  onClick={() => {
                    onReset();
                    setMobileMenuOpen(false);
                  }}
                  style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '0.5rem', paddingTop: '1rem' }}
                >
                  <div className="drawer-item-icon">🔄</div>
                  <div className="drawer-item-text">
                    <span className="drawer-item-title">Reset / New Video</span>
                    <span className="drawer-item-sub">Paste a new YouTube URL</span>
                  </div>
                </button>
              )}
            </div>

            <div className="mobile-drawer-footer">
              <div className="engine-status-pill">
                <span className="status-dot"></span>
                <span>Engine Online</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
