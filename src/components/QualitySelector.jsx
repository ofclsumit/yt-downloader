import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SkeletonQualityOption } from './common/Skeleton';
import CircularLoader from './common/CircularLoader';

/**
 * Format numeric megabytes into human-readable size string
 */
function formatFileSize(mb) {
  if (mb === null || mb === undefined || mb <= 0) return null;
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

export default function QualitySelector({
  availableQualities = [],
  selectedQuality = '1080',
  onChangeQuality,
  isLoading = false,
  error = null,
  onRetry,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const listboxRef = useRef(null);

  // Detect mobile viewport (under 640px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Find currently selected quality object
  const currentOption = availableQualities.find((q) => q.id === selectedQuality) ||
    availableQualities[0] || {
      id: selectedQuality,
      label: selectedQuality === 'mp3' ? 'MP3 Audio' : (selectedQuality === 'best' ? 'Best Available' : `${selectedQuality}p`),
      badge: selectedQuality === 'best' ? 'Auto' : (selectedQuality === 'mp3' ? 'Audio' : 'Video'),
      desc: selectedQuality === 'mp3' ? '192 kbps' : 'Standard',
      ext: selectedQuality === 'mp3' ? 'mp3' : 'mp4',
    };

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Lock body scroll when mobile bottom sheet is open
  useEffect(() => {
    if (isOpen && isMobile) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMobile]);

  // Handle keyboard navigation inside the listbox
  const handleTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(true);
      const selIdx = availableQualities.findIndex((q) => q.id === selectedQuality);
      setFocusedIndex(selIdx >= 0 ? selIdx : 0);
    }
  };

  const handleListKeyDown = (e) => {
    if (!availableQualities.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % availableQualities.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + availableQualities.length) % availableQualities.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < availableQualities.length) {
        handleSelectQuality(availableQualities[focusedIndex].id);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const handleSelectQuality = (qualityId) => {
    onChangeQuality(qualityId);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  // 1. Loading Skeleton State (Requirement 8)
  if (isLoading) {
    return (
      <div
        className="quality-selector-container"
        aria-busy="true"
        aria-live="polite"
        style={{ animation: 'fadeIn var(--duration-fast) var(--ease-spring)' }}
      >
        <div className="quality-header-row">
          <label className="quality-field-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>Quality &amp; Format:</span>
          </label>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            <CircularLoader size="sm" color="var(--accent-primary)" />
            <span>Loading qualities...</span>
          </div>
        </div>
        <SkeletonQualityOption />
      </div>
    );
  }

  // 2. Error State
  if (error) {
    return (
      <div className="quality-selector-container" role="alert">
        <div className="quality-header-row">
          <label className="quality-field-label">Quality &amp; Format:</label>
        </div>
        <div className="quality-error-box">
          <div className="quality-error-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>Unable to load available qualities.</span>
          </div>
          {onRetry && (
            <button type="button" className="quality-retry-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  // 3. Normal State with Real Dynamic Backend Options
  return (
    <div className="quality-selector-container">
      <div className="quality-header-row">
        <label id="quality-selector-label" className="quality-field-label">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <span>Select Video Quality:</span>
        </label>
        <span className="quality-status-badge">
          {availableQualities.length} {availableQualities.length === 1 ? 'format' : 'real formats'} available
        </span>
      </div>

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        className={`quality-selector-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="quality-selector-label"
        id="quality-dropdown-trigger"
      >
        <div className="quality-trigger-info">
          <div className="quality-trigger-primary">
            <span className="quality-trigger-res">{currentOption.label}</span>
            {currentOption.badge && (
              <span className={`quality-badge quality-badge-${currentOption.badge.toLowerCase()}`}>
                {currentOption.badge}
              </span>
            )}
            <span className="quality-trigger-format">
              {currentOption.isAudio ? 'MP3' : (currentOption.ext || 'MP4').toUpperCase()}
            </span>
          </div>

          <div className="quality-trigger-secondary">
            {currentOption.desc && <span>{currentOption.desc}</span>}
            {currentOption.codec && (
              <>
                <span className="quality-bullet">&bull;</span>
                <span>{currentOption.codec}</span>
              </>
            )}
            {formatFileSize(currentOption.fileSizeMb) && (
              <>
                <span className="quality-bullet">&bull;</span>
                <span className="quality-filesize">{formatFileSize(currentOption.fileSizeMb)}</span>
              </>
            )}
          </div>
        </div>

        <div className="quality-trigger-chevron">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {/* Mobile Bottom Sheet Overlay & Drawer */}
      {isMobile && isOpen && (
        <div className="quality-sheet-backdrop" onClick={() => setIsOpen(false)}>
          <div
            className="quality-sheet-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Select Video Quality"
          >
            <div className="quality-sheet-handle-bar">
              <div className="quality-sheet-handle" />
            </div>

            <div className="quality-sheet-header">
              <div className="quality-sheet-title-row">
                <span className="quality-sheet-title">Quality &amp; Format</span>
                <span className="quality-sheet-subtitle">Based on real backend streams</span>
              </div>
              <button
                type="button"
                className="quality-sheet-close-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close quality picker"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div
              className="quality-sheet-list"
              role="listbox"
              aria-label="Video qualities"
              tabIndex={-1}
            >
              {availableQualities.map((q) => {
                const isSelected = selectedQuality === q.id;
                const sizeStr = formatFileSize(q.fileSizeMb);

                return (
                  <button
                    key={q.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`quality-option-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectQuality(q.id)}
                  >
                    <div className="quality-option-left">
                      <div className="quality-option-main">
                        <span className="quality-option-res">{q.label}</span>
                        {q.badge && (
                          <span className={`quality-badge quality-badge-${q.badge.toLowerCase()}`}>
                            {q.badge}
                          </span>
                        )}
                        <span className="quality-option-format">
                          {q.isAudio ? 'MP3' : (q.ext || 'MP4').toUpperCase()}
                        </span>
                      </div>

                      <div className="quality-option-details">
                        {q.desc && <span>{q.desc}</span>}
                        {q.codec && (
                          <>
                            <span className="quality-bullet">&bull;</span>
                            <span>{q.codec}</span>
                          </>
                        )}
                        {sizeStr && (
                          <>
                            <span className="quality-bullet">&bull;</span>
                            <span className="quality-filesize">{sizeStr}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="quality-option-check">
                      {isSelected && (
                        <div className="quality-check-circle">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Desktop Popover Dropdown */}
      {!isMobile && isOpen && (
        <div
          ref={dropdownRef}
          className="quality-dropdown-popover"
          style={{ position: 'absolute', zIndex: 100 }}
        >
          <div className="quality-dropdown-header">
            <span>Available Streams</span>
            <span className="quality-dropdown-source">yt-dlp engine</span>
          </div>

          <div
            ref={listboxRef}
            className="quality-dropdown-list"
            role="listbox"
            aria-label="Video qualities"
            tabIndex={0}
            onKeyDown={handleListKeyDown}
          >
            {availableQualities.map((q, idx) => {
              const isSelected = selectedQuality === q.id;
              const isFocused = focusedIndex === idx;
              const sizeStr = formatFileSize(q.fileSizeMb);

              return (
                <div
                  key={q.id}
                  role="option"
                  id={`quality-opt-${q.id}`}
                  aria-selected={isSelected}
                  className={`quality-option-item ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
                  onClick={() => handleSelectQuality(q.id)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  <div className="quality-option-left">
                    <div className="quality-option-main">
                      <span className="quality-option-res">{q.label}</span>
                      {q.badge && (
                        <span className={`quality-badge quality-badge-${q.badge.toLowerCase()}`}>
                          {q.badge}
                        </span>
                      )}
                      <span className="quality-option-format">
                        {q.isAudio ? 'MP3' : (q.ext || 'MP4').toUpperCase()}
                      </span>
                    </div>

                    <div className="quality-option-details">
                      {q.desc && <span>{q.desc}</span>}
                      {q.codec && (
                        <>
                          <span className="quality-bullet">&bull;</span>
                          <span>{q.codec}</span>
                        </>
                      )}
                      {sizeStr && (
                        <>
                          <span className="quality-bullet">&bull;</span>
                          <span className="quality-filesize">{sizeStr}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="quality-option-check">
                    {isSelected && (
                      <div className="quality-check-circle">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
