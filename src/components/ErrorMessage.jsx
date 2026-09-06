import React from 'react';

export default function ErrorMessage({ message, type = 'danger', onDismiss }) {
  if (!message) return null;

  return (
    <div
      className={`alert-box alert-${type}`}
      role="alert"
      aria-live="assertive"
      style={{ animation: 'fadeSlideDown var(--duration-normal) var(--ease-spring)' }}
    >
      <svg className="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {type === 'danger' && (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </>
        )}
        {type === 'warning' && (
          <>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </>
        )}
        {type === 'success' && (
          <>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </>
        )}
      </svg>
      <div style={{ flex: 1 }}>{message}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="btn-ghost"
          style={{ height: 'auto', padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
          aria-label="Dismiss error"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
