import React, { useState } from 'react';
import { formatTimestamp } from '../utils/time';

const CATEGORY_BADGES = {
  anime: { label: 'Anime', icon: '⚔️', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
  tv_series: { label: 'TV Series', icon: '📺', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
  gaming: { label: 'Gaming', icon: '🎮', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  music: { label: 'Music', icon: '🎵', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
  movies: { label: 'Movie', icon: '🎬', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  educational: { label: 'Educational', icon: '📚', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  others: { label: 'General / Other', icon: '📁', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' },
};

export default function VideoMetadata({ metadata, duration, videoId, category, onCategoryChange }) {
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);
  const title = metadata?.title || 'YouTube Video';
  const author = metadata?.author || metadata?.author_name || 'YouTube Creator';
  const catKey = (category || metadata?.category || 'others').toLowerCase();
  const catInfo = CATEGORY_BADGES[catKey] || CATEGORY_BADGES.others;
  const isLongTitle = title.length > 60;

  return (
    <div className="metadata-section">
      <div className="meta-main">
        <h2
          className={`video-title ${isTitleExpanded ? 'expanded' : 'clamped'}`}
          onClick={() => isLongTitle && setIsTitleExpanded(!isTitleExpanded)}
          style={{ cursor: isLongTitle ? 'pointer' : 'default' }}
          title={isLongTitle ? (isTitleExpanded ? 'Click to collapse' : 'Click to read full title') : undefined}
        >
          {title}
          {isLongTitle && (
            <span className="title-expand-hint">
              {isTitleExpanded ? ' (less)' : ' ...more'}
            </span>
          )}
        </h2>
        <div className="meta-sub-row" style={{ flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          <span className="channel-name">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>{author}</span>
          </span>

          <span className="duration-badge" title="Full video length">
            Total Duration: {formatTimestamp(duration, duration >= 3600)}
          </span>

          {/* youtube.py Auto-Detected Category Badge */}
          <div
            className="category-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '20px',
              fontSize: '0.78rem',
              fontWeight: '600',
              color: catInfo.color,
              background: catInfo.bg,
              border: `1px solid ${catInfo.color}40`,
            }}
          >
            <span>{catInfo.icon}</span>
            <span>Category: {catInfo.label}</span>
          </div>

          {videoId && (
            <span className="duration-badge" style={{ color: 'var(--text-muted)' }}>
              ID: {videoId}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
