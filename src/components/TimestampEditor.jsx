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
    <section className="timestamp-editor-wrap" aria-label="Timestamp Editor">
      <div className="timestamp-controls-section">
        {/* Start Time Field */}
        <TimestampInput
          id="timestamp-start"
          label="Start Time"
          valueSeconds={startTime}
          onChange={onStartTimeChange}
          currentTime={currentTime}
          maxDuration={duration}
          error={startTime < 0 || (duration > 0 && startTime >= duration)}
        />

        {/* End Time Field */}
        <TimestampInput
          id="timestamp-end"
          label="End Time"
          valueSeconds={endTime}
          onChange={onEndTimeChange}
          currentTime={currentTime}
          maxDuration={duration}
          error={endTime <= startTime || (duration > 0 && endTime > duration)}
        />

        {/* Clip Duration Card */}
        <div className="timestamp-field" style={{ justifyContent: 'space-between' }}>
          <div className="field-label-group">
            <span className="field-label">Clip Duration</span>
          </div>
          <div className="field-value-display">
            {formatTimestamp(diffSeconds, diffSeconds >= 3600)}
          </div>
          <span className="field-inline-msg">{diffSeconds}s total</span>
        </div>
      </div>

      {!validation.valid && (
        <div className="alert-box alert-warning" style={{ marginTop: '0.25rem' }}>
          <svg className="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontWeight: 500 }}>{validation.error}</span>
        </div>
      )}
    </section>
  );
}
