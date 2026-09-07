import React from 'react';
import CircularLoader from './common/CircularLoader';

/**
 * Screen displayed when a session has expired due to 5+ minutes of inactivity.
 */
export function SessionExpiredScreen({ onStartAgain }) {
  return (
    <div
      className="card"
      style={{
        maxWidth: '560px',
        margin: '3rem auto',
        padding: '3rem 2rem',
        textAlign: 'center',
        background: 'rgba(23, 23, 23, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(239, 68, 68, 0.25)',
        borderRadius: 'var(--radius-lg, 16px)',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 30px rgba(239, 68, 68, 0.08)',
        animation: 'fadeSlideUp 0.35s ease-out',
      }}
      role="alert"
      aria-live="polite"
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.12)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f87171',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          color: 'var(--text-primary, #ffffff)',
          marginBottom: '0.75rem',
          letterSpacing: '-0.02em',
        }}
      >
        Session expired
      </h2>

      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary, #a3a3a3)',
          marginBottom: '2rem',
          lineHeight: 1.6,
        }}
      >
        This video session is no longer active.
      </p>

      <button
        type="button"
        className="btn-primary"
        onClick={onStartAgain}
        style={{
          width: '100%',
          maxWidth: '240px',
          margin: '0 auto',
          height: '48px',
          fontSize: '1rem',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        <span>Start Again</span>
      </button>
    </div>
  );
}

/**
 * Screen displayed when someone enters an invalid or non-existent session URL.
 */
export function SessionNotFoundScreen({ onStartAgain }) {
  return (
    <div
      className="card"
      style={{
        maxWidth: '560px',
        margin: '3rem auto',
        padding: '3rem 2rem',
        textAlign: 'center',
        background: 'rgba(23, 23, 23, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: 'var(--radius-lg, 16px)',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5)',
        animation: 'fadeSlideUp 0.35s ease-out',
      }}
      role="alert"
      aria-live="polite"
    >
      <div
        style={{
          width: '64px',
          height: '64px',
          margin: '0 auto 1.5rem',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted, #737373)',
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          color: 'var(--text-primary, #ffffff)',
          marginBottom: '0.75rem',
          letterSpacing: '-0.02em',
        }}
      >
        Session not found
      </h2>

      <p
        style={{
          fontSize: '1rem',
          color: 'var(--text-secondary, #a3a3a3)',
          marginBottom: '2rem',
          lineHeight: 1.6,
        }}
      >
        This video session does not exist or may have been removed.
      </p>

      <button
        type="button"
        className="btn-primary"
        onClick={onStartAgain}
        style={{
          width: '100%',
          maxWidth: '240px',
          margin: '0 auto',
          height: '48px',
          fontSize: '1rem',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.6rem',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>Start Again</span>
      </button>
    </div>
  );
}

/**
 * Screen displayed during transition while workspace is being created or reconnected.
 */
export function SessionPreparingScreen({ message = 'Preparing your workspace...' }) {
  return (
    <div
      className="card"
      style={{
        maxWidth: '520px',
        margin: '4rem auto',
        padding: '3rem 2rem',
        textAlign: 'center',
        background: 'rgba(23, 23, 23, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 'var(--radius-lg, 16px)',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.08)',
        animation: 'fadeSlideUp 0.3s ease-out',
      }}
      aria-busy="true"
    >
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <CircularLoader size="lg" color="var(--primary-color, #6366f1)" />
      </div>

      <h3
        style={{
          fontSize: '1.35rem',
          fontWeight: 600,
          color: 'var(--text-primary, #ffffff)',
          marginBottom: '0.5rem',
          letterSpacing: '-0.01em',
        }}
      >
        {message}
      </h3>

      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted, #737373)' }}>
        Allocating dedicated video session...
      </p>
    </div>
  );
}
