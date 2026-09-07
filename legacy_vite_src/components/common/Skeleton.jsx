import React from 'react';

/**
 * Base Skeleton component with GPU-accelerated shimmer
 */
export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = 'var(--radius-sm)',
  className = '',
  style = {},
  ...props
}) {
  return (
    <div
      className={`skeleton-base ${className}`}
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}

/**
 * SkeletonText - for line-based paragraphs and text
 */
export function SkeletonText({ lines = 2, lastLineWidth = '70%', className = '', style = {} }) {
  return (
    <div className={`skeleton-text-group ${className}`} style={{ width: '100%', ...style }} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          width={index === lines - 1 ? lastLineWidth : '100%'}
          height="14px"
          style={{ marginBottom: index === lines - 1 ? 0 : '8px' }}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonTitle - for headline and card titles
 */
export function SkeletonTitle({ width = '60%', height = '22px', style = {} }) {
  return <Skeleton width={width} height={height} borderRadius="6px" style={style} />;
}

/**
 * SkeletonVideo - 16:9 Aspect-Ratio Preserving video placeholder
 */
export function SkeletonVideo({ className = '', style = {} }) {
  return (
    <div className={`skeleton-video-stage ${className}`} style={style} aria-label="Loading video player">
      <div
        style={{
          width: '52px',
          height: '38px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      </div>
      <div
        className="skeleton-base"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}

/**
 * SkeletonThumbnail - for square or custom aspect thumbnails
 */
export function SkeletonThumbnail({ width = '120px', aspectRatio = '16/9', style = {} }) {
  return (
    <div
      className="skeleton-base"
      style={{
        width,
        aspectRatio,
        borderRadius: 'var(--radius-sm)',
        ...style,
      }}
    />
  );
}

/**
 * SkeletonTimeline - placeholder for start/end timeline scrubbers
 */
export function SkeletonTimeline({ style = {} }) {
  return (
    <div
      className="skeleton-base"
      style={{
        height: '34px',
        width: '100%',
        borderRadius: '9999px',
        margin: '1.25rem 0',
        ...style,
      }}
    />
  );
}

/**
 * SkeletonQualityOption - placeholder for format cards in quality selector
 */
export function SkeletonQualityOption({ style = {} }) {
  return (
    <div
      className="skeleton-quality-card skeleton-base"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--border-subtle)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        <Skeleton width="60px" height="18px" borderRadius="4px" />
        <Skeleton width="40px" height="16px" borderRadius="4px" />
      </div>
      <Skeleton width="70px" height="16px" borderRadius="4px" />
    </div>
  );
}

/**
 * SkeletonButton - button shape placeholder
 */
export function SkeletonButton({ width = '140px', height = '46px', style = {} }) {
  return <Skeleton width={width} height={height} borderRadius="var(--radius-md)" style={style} />;
}

/**
 * SkeletonPage - full page placeholder for router navigation
 */
export function SkeletonPage() {
  return (
    <div className="card" style={{ padding: '2rem', margin: '2rem auto', maxWidth: '800px' }} aria-busy="true">
      <SkeletonTitle width="40%" height="28px" style={{ marginBottom: '1.5rem' }} />
      <SkeletonText lines={4} style={{ marginBottom: '2rem' }} />
      <SkeletonVideo style={{ marginBottom: '2rem' }} />
      <div style={{ display: 'flex', gap: '1rem' }}>
        <SkeletonButton width="160px" />
        <SkeletonButton width="120px" />
      </div>
    </div>
  );
}

export default Skeleton;
