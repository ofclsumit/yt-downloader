import React, { useState } from 'react';

export default function LegalModal({ isOpen, onClose }) {
  const [tab, setTab] = useState('terms');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="legal-title">
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 id="legal-title" className="modal-title">
            {tab === 'terms' ? 'Terms of Service' : 'Privacy & Retention Policy'}
          </h3>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close legal modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={`btn-ghost ${tab === 'terms' ? 'active' : ''}`}
            onClick={() => setTab('terms')}
            style={{ fontWeight: tab === 'terms' ? 700 : 500, color: tab === 'terms' ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            Terms of Service
          </button>
          <button
            type="button"
            className={`btn-ghost ${tab === 'privacy' ? 'active' : ''}`}
            onClick={() => setTab('privacy')}
            style={{ fontWeight: tab === 'privacy' ? 700 : 500, color: tab === 'privacy' ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            Privacy &amp; Data Retention
          </button>
        </div>

        {tab === 'terms' ? (
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>1. Authorized Source Media Responsibility</h4>
            <p style={{ marginBottom: '1rem' }}>
              Users are solely responsible for ensuring they have the legal authorization, license, or ownership rights to process, cut, and download media files through this application.
            </p>

            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>2. YouTube Terms &amp; Anti-Circumvention</h4>
            <p style={{ marginBottom: '1rem' }}>
              In compliance with YouTube’s Terms of Service and international intellectual property laws, this application strictly refuses to circumvent digital rights management (DRM), signed media URL protections, rate limits, access controls, or private video restrictions. YouTube videos are embedded solely via the official YouTube IFrame API for timestamp visualization.
            </p>

            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>3. Permitted Usage</h4>
            <p>
              The downloadable media clipping pipeline is provided exclusively for user-authorized content, Creative Commons media, and public domain materials.
            </p>
          </div>
        ) : (
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>1. Ephemeral Temporary Processing</h4>
            <p style={{ marginBottom: '1rem' }}>
              We do not permanently store your media files, clips, or browsing history. All clips are generated on an ephemeral worker pipeline and saved to temporary storage with a strict retention window.
            </p>

            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>2. Automatic 15-Minute Purge</h4>
            <p style={{ marginBottom: '1rem' }}>
              Every processed video clip has a hardcoded expiration time (15 minutes). An automated cleanup daemon permanently purges all output files, intermediate artifacts, and expired tokens from disk every 60 seconds.
            </p>

            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>3. Cryptographic Signed URLs</h4>
            <p>
              Download links are generated using cryptographic HMAC-SHA256 signatures that expire after 15 minutes. Once expired, links are invalid and cannot be used to retrieve data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
