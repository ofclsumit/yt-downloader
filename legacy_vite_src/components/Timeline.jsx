import React, { useRef, useState, useCallback, useEffect } from 'react';
import { formatTimestamp } from '../utils/time';

export default function Timeline({
  startTime,
  endTime,
  duration,
  currentTime,
  onStartTimeChange,
  onEndTimeChange,
  onSeek,
}) {
  const trackRef = useRef(null);
  const [activeDrag, setActiveDrag] = useState(null); // 'start' | 'end' | null

  const safeDuration = duration > 0 ? duration : Math.max(endTime, 100);
  const startPercent = Math.min(100, Math.max(0, (startTime / safeDuration) * 100));
  const endPercent = Math.min(100, Math.max(0, (endTime / safeDuration) * 100));
  const playheadPercent =
    currentTime !== null && currentTime !== undefined
      ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100))
      : null;

  // Converts a clientX position into seconds along the track
  const getSecondsFromPointer = useCallback(
    (clientX) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * safeDuration);
    },
    [safeDuration]
  );

  const handlePointerDown = (type, e) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveDrag(type);
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (err) {
      // Ignore if pointer capture fails
    }
  };

  const handlePointerMove = (e) => {
    if (!activeDrag) return;
    const sec = getSecondsFromPointer(e.clientX);

    if (activeDrag === 'start') {
      const newStart = Math.max(0, Math.min(sec, endTime - 1));
      onStartTimeChange(newStart);
    } else if (activeDrag === 'end') {
      const newEnd = Math.min(safeDuration, Math.max(sec, startTime + 1));
      onEndTimeChange(newEnd);
    }
  };

  const handlePointerUp = (e) => {
    if (activeDrag) {
      setActiveDrag(null);
      try {
        e.target.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore
      }
    }
  };

  // Click on track itself to seek or adjust closest handle
  const handleTrackClick = (e) => {
    // If clicked handle, let handle take it
    if (e.target.closest('.timeline-handle')) return;
    const sec = getSecondsFromPointer(e.clientX);
    if (onSeek) {
      onSeek(sec);
    }
  };

  const handleKeyDown = (type, e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (type === 'start') {
        onStartTimeChange(Math.max(0, startTime - step));
      } else {
        onEndTimeChange(Math.max(startTime + 1, endTime - step));
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (type === 'start') {
        onStartTimeChange(Math.min(endTime - 1, startTime + step));
      } else {
        onEndTimeChange(Math.min(safeDuration, endTime + step));
      }
    }
  };

  const isTagsTooClose = (endPercent - startPercent) < 16;
  const clipLengthSec = Math.max(0, endTime - startTime);

  return (
    <div className="yt-timeline-container" aria-label="YouTube Video Progress Scrubber">
      <div className="yt-timeline-info">
        <span className="yt-time-text">00:00</span>
        <div className="yt-clip-range-display">
          <span>Clip: </span>
          <strong className="yt-clip-times">{formatTimestamp(startTime)} – {formatTimestamp(endTime)}</strong>
          <span className="yt-clip-sec">({clipLengthSec}s)</span>
        </div>
        <span className="yt-time-text">{formatTimestamp(safeDuration, safeDuration >= 3600)}</span>
      </div>

      <div
        className="yt-scrubber-wrap"
        ref={trackRef}
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* YouTube Progress Bar Background Rail */}
        <div className="yt-rail-base" />

        {/* Selected Clip Highlight Range (YouTube Red) */}
        <div
          className="yt-clip-highlight"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`,
          }}
        />

        {/* Playhead Indicator */}
        {playheadPercent !== null && (
          <div
            className="yt-playhead-line"
            style={{ left: `${playheadPercent}%` }}
            title={`Playhead: ${formatTimestamp(currentTime)}`}
          />
        )}

        {/* Unified YouTube Tooltip when handles are close together */}
        {isTagsTooClose && (
          <div
            className="yt-time-tooltip yt-tooltip-unified"
            style={{
              left: `${Math.max(10, Math.min(90, (startPercent + endPercent) / 2))}%`,
            }}
          >
            {formatTimestamp(startTime)} – {formatTimestamp(endTime)}
          </div>
        )}

        {/* YouTube Circular Start Scrubber Knob */}
        <div
          role="slider"
          aria-label="Start clip handle"
          aria-valuemin={0}
          aria-valuemax={endTime - 1}
          aria-valuenow={startTime}
          aria-valuetext={formatTimestamp(startTime)}
          tabIndex={0}
          className={`yt-scrubber-knob knob-start ${activeDrag === 'start' ? 'active' : ''}`}
          style={{ left: `${startPercent}%`, touchAction: 'none' }}
          onPointerDown={(e) => handlePointerDown('start', e)}
          onKeyDown={(e) => handleKeyDown('start', e)}
        >
          <div className="yt-knob-circle" />
          {!isTagsTooClose && (
            <div
              className="yt-time-tooltip"
              style={
                startPercent < 8
                  ? { left: '0', transform: 'none' }
                  : startPercent > 92
                  ? { right: '0', left: 'auto', transform: 'none' }
                  : { left: '50%', transform: 'translateX(-50%)' }
              }
            >
              {formatTimestamp(startTime)}
            </div>
          )}
        </div>

        {/* YouTube Circular End Scrubber Knob */}
        <div
          role="slider"
          aria-label="End clip handle"
          aria-valuemin={startTime + 1}
          aria-valuemax={safeDuration}
          aria-valuenow={endTime}
          aria-valuetext={formatTimestamp(endTime)}
          tabIndex={0}
          className={`yt-scrubber-knob knob-end ${activeDrag === 'end' ? 'active' : ''}`}
          style={{ left: `${endPercent}%`, touchAction: 'none' }}
          onPointerDown={(e) => handlePointerDown('end', e)}
          onKeyDown={(e) => handleKeyDown('end', e)}
        >
          <div className="yt-knob-circle" />
          {!isTagsTooClose && (
            <div
              className="yt-time-tooltip"
              style={
                endPercent > 92
                  ? { right: '0', left: 'auto', transform: 'none' }
                  : endPercent < 8
                  ? { left: '0', transform: 'none' }
                  : { left: '50%', transform: 'translateX(-50%)' }
              }
            >
              {formatTimestamp(endTime)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
