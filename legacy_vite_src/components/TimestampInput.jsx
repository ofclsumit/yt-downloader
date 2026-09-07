import React, { useState, useEffect } from 'react';
import { parseTimestamp, formatTimestamp } from '../utils/time';

export default function TimestampInput({
  id,
  label,
  valueSeconds,
  onChange,
  onCommit,
  currentTime,
  maxDuration,
  error,
}) {
  const [textValue, setTextValue] = useState(formatTimestamp(valueSeconds, maxDuration >= 3600));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setTextValue(formatTimestamp(valueSeconds, maxDuration >= 3600));
    }
  }, [valueSeconds, maxDuration, isFocused]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setTextValue(raw);
    const parsed = parseTimestamp(raw);
    if (parsed.valid) {
      onChange(parsed.seconds);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseTimestamp(textValue);
    if (parsed.valid) {
      const finalSec = Math.max(0, parsed.seconds);
      onChange(finalSec);
      if (onCommit) onCommit(finalSec);
      setTextValue(formatTimestamp(finalSec, maxDuration >= 3600));
    } else {
      setTextValue(formatTimestamp(valueSeconds, maxDuration >= 3600));
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleNudge(e.shiftKey ? 5 : 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleNudge(e.shiftKey ? -5 : -1);
    }
  };

  const handleNudge = (delta) => {
    const next = Math.max(0, valueSeconds + delta);
    onChange(next);
    if (onCommit) onCommit(next);
    setTextValue(formatTimestamp(next, maxDuration >= 3600));
  };

  const handleSetCurrent = () => {
    if (currentTime !== null && currentTime !== undefined) {
      const sec = Math.floor(currentTime);
      onChange(sec);
      if (onCommit) onCommit(sec);
      setTextValue(formatTimestamp(sec, maxDuration >= 3600));
    }
  };

  return (
    <div className={`yt-time-card ${error ? 'has-error' : ''} ${isFocused ? 'is-focused' : ''}`}>
      <div className="yt-time-card-top">
        <label htmlFor={id} className="yt-time-label">{label}</label>
        <span className="yt-time-raw">{valueSeconds}s</span>
      </div>

      <div className="yt-time-input-wrap">
        <input
          id={id}
          type="text"
          inputMode="text"
          className="yt-time-input"
          value={textValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="00:00"
          autoComplete="off"
          spellCheck="false"
          aria-label={`${label} timestamp`}
        />
      </div>

      <div className="yt-time-controls">
        <div className="yt-nudge-pair">
          <button
            type="button"
            className="yt-nudge-btn"
            onClick={() => handleNudge(-1)}
            title="Step back 1 second"
            aria-label={`Decrease ${label} by 1 second`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>1s</span>
          </button>

          <button
            type="button"
            className="yt-nudge-btn"
            onClick={() => handleNudge(1)}
            title="Step forward 1 second"
            aria-label={`Increase ${label} by 1 second`}
          >
            <span>1s</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {currentTime !== undefined && (
          <button
            type="button"
            className="yt-current-btn"
            onClick={handleSetCurrent}
            title="Sync with current video player time"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            <span>Current</span>
          </button>
        )}
      </div>
    </div>
  );
}
