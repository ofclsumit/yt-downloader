import React from 'react';
import TimestampInput from './TimestampInput';
import { formatTimestamp, validateTimeRange } from '../utils/time';

export default function TimestampEditor({
  startTime,
  endTime,
  duration,
  currentTime,
  onStartTimeChange,
  onEndTimeChange,
}) {
  const diffSeconds = Math.max(0, endTime - startTime);
  const validation = validateTimeRange(startTime, endTime, duration);

  return (
    <div className="yt-control-center">
      <div className="yt-deck-grid">
        <TimestampInput
          id="timestamp-start"
          label="Start Time"
          valueSeconds={startTime}
          onChange={onStartTimeChange}
          currentTime={currentTime}
          maxDuration={duration}
          error={startTime < 0 || (duration > 0 && startTime >= duration)}
        />

        <div className="yt-deck-connector" title="Selected clip duration">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
          <span className="yt-duration-pill">
            {formatTimestamp(diffSeconds, diffSeconds >= 3600)} ({diffSeconds}s)
          </span>
        </div>

        <TimestampInput
          id="timestamp-end"
          label="End Time"
          valueSeconds={endTime}
          onChange={onEndTimeChange}
          currentTime={currentTime}
          maxDuration={duration}
          error={endTime <= startTime || (duration > 0 && endTime > duration)}
        />
      </div>

      {!validation.valid && (
        <div className="alert-box alert-warning" style={{ marginTop: '0.5rem', padding: '0.5rem 0.8rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{validation.error}</span>
        </div>
      )}
    </div>
  );
}
