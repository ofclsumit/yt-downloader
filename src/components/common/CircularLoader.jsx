import React from 'react';

/**
 * CircularLoader
 * Sizing variants: 'sm' (16px), 'md' (24px), 'lg' (44px)
 * Modes:
 *   - Indeterminate: progress is null or undefined (continuous smooth spin)
 *   - Determinate: progress is a number 0-100 (smooth SVG dashoffset)
 * Styles: inline or overlay
 */
export default function CircularLoader({
  size = 'md',
  progress = null,
  color = 'currentColor',
  strokeWidth = null,
  isOverlay = false,
  label = 'Loading...',
  className = '',
  style = {},
}) {
  const sizeMap = {
    sm: { dimension: 16, defaultStroke: 2.2, r: 6 },
    md: { dimension: 24, defaultStroke: 2.6, r: 9 },
    lg: { dimension: 44, defaultStroke: 3.2, r: 18 },
  };

  const config = sizeMap[size] || sizeMap.md;
  const stroke = strokeWidth || config.defaultStroke;
  const radius = config.r;
  const circumference = 2 * Math.PI * radius;

  const isDeterminate = typeof progress === 'number' && progress >= 0 && progress <= 100;
  const strokeDashoffset = isDeterminate
    ? circumference - (progress / 100) * circumference
    : circumference * 0.3; // Segment for indeterminate spin

  const loaderContent = (
    <div
      className={`circular-loader-root circular-loader-${size} ${className}`}
      style={{ ...style, color }}
      role="status"
      aria-label={label}
    >
      <svg
        className={`circular-loader-svg ${isDeterminate ? 'determinate' : 'indeterminate'}`}
        viewBox={`0 0 ${config.dimension} ${config.dimension}`}
        width={config.dimension}
        height={config.dimension}
      >
        {/* Subtle background track */}
        <circle
          className="circular-loader-track"
          cx={config.dimension / 2}
          cy={config.dimension / 2}
          r={radius}
          strokeWidth={stroke}
        />
        {/* Active colored arc */}
        <circle
          className="circular-loader-circle"
          cx={config.dimension / 2}
          cy={config.dimension / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
        {label}
      </span>
    </div>
  );

  if (isOverlay) {
    return (
      <div className="circular-loader-overlay">
        {loaderContent}
        {label && (
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {label}
          </span>
        )}
      </div>
    );
  }

  return loaderContent;
}
