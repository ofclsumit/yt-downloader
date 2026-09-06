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

  // Sync formatted text when external valueSeconds changes and user is not currently typing
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
      // Revert to known good seconds
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
    <div className={`timestamp-field ${error ? 'has-error' : ''}`}>
      <div className="field-label-group">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        <span className="field-inline-msg">
          {valueSeconds}s
        </span>
      </div>

      <div className="timestamp-input-row">
        <input
          id={id}
          type="text"
          inputMode="text"
          className="timestamp-input-styled"
          value={textValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="00:00"
          autoComplete="off"
          spellCheck="false"
          aria-label={`${label} timestamp (supports HH:MM:SS, MM:SS, or seconds)`}
        />

        <div className="field-nudge-actions">
          <button
            type="button"
            className="nudge-btn"
            onClick={() => handleNudge(-1)}
            title="Step back 1 second (or down arrow)"
            aria-label={`Decrease ${label} by 1 second`}
          >
            -1s
          </button>
          <button
            type="button"
            className="nudge-btn"
            onClick={() => handleNudge(1)}
            title="Step forward 1 second (or up arrow)"
            aria-label={`Increase ${label} by 1 second`}
          >
            +1s
          </button>
          {currentTime !== undefined && (
            <button
              type="button"
              className="nudge-btn nudge-btn-current"
              onClick={handleSetCurrent}
              title="Set to current player playback time"
            >
              Current
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
