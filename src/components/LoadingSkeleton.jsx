import React from 'react';
import {
  Skeleton,
  SkeletonVideo,
  SkeletonTitle,
  SkeletonText,
  SkeletonTimeline,
  SkeletonQualityOption,
  SkeletonButton,
} from './common/Skeleton';

export default function LoadingSkeleton() {
  return (
    <div
      className="card editor-card"
      aria-busy="true"
      aria-label="Analyzing and preparing video clip workspace"
      style={{ animation: 'fadeSlideUp var(--duration-normal) var(--ease-spring)' }}
    >
      {/* Workspace Header Skeleton */}
      <div className="editor-header-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Skeleton width="130px" height="18px" borderRadius="4px" />
          <Skeleton width="90px" height="18px" borderRadius="4px" />
        </div>
        <Skeleton width="100px" height="28px" borderRadius="var(--radius-sm)" />
      </div>

      <div className="editor-responsive-layout">
        {/* Primary Column: Video Player (Rigid 16:9 Aspect Ratio) & Title */}
        <div className="editor-primary-column">
          <SkeletonVideo />

          <div className="metadata-section" style={{ padding: '1rem 0' }}>
            <SkeletonTitle width="80%" height="24px" style={{ marginBottom: '0.6rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <Skeleton width="120px" height="16px" borderRadius="4px" />
              <Skeleton width="60px" height="16px" borderRadius="4px" />
              <Skeleton width="80px" height="20px" borderRadius="9999px" />
            </div>
          </div>
        </div>

        {/* Controls Column: Timestamp Fields, Timeline, Quality, & Actions */}
        <div className="editor-controls-column">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <Skeleton height="76px" borderRadius="var(--radius-md)" />
            <Skeleton height="76px" borderRadius="var(--radius-md)" />
          </div>

          <SkeletonTimeline />

          {/* Quality Selector Skeleton */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <Skeleton width="130px" height="16px" />
              <Skeleton width="90px" height="16px" />
            </div>
            <SkeletonQualityOption />
          </div>

          {/* Buttons Skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <SkeletonButton width="100%" height="48px" />
            <SkeletonButton width="100%" height="44px" />
          </div>
        </div>
      </div>
    </div>
  );
}
