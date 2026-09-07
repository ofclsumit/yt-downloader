'use client';

import React, { useState } from 'react';
import { Clock, AlertCircle, CheckCircle2, Scissors, Flame, Plus, Minus } from 'lucide-react';
import { parseTimestamp, formatTimestamp, formatDurationDisplay, validateTimeRange } from '@/lib/time';

interface Props {
  startSeconds: number;
  endSeconds: number;
  onChangeStart: (seconds: number) => void;
  onChangeEnd: (seconds: number) => void;
  onGenerateClip: () => void;
  isSubmitting: boolean;
  maxClipDuration?: number;
}

export function TimelineEditor({
  startSeconds,
  endSeconds,
  onChangeStart,
  onChangeEnd,
  onGenerateClip,
  isSubmitting,
  maxClipDuration = 300,
}: Props) {
  const [startInput, setStartInput] = useState(formatTimestamp(startSeconds));
  const [endInput, setEndInput] = useState(formatTimestamp(endSeconds));
  const [inputError, setInputError] = useState<string | null>(null);

  const duration = Math.max(0, endSeconds - startSeconds);
  const validation = validateTimeRange(startSeconds, endSeconds, 0, maxClipDuration);

  const handleStartBlur = () => {
    const parsed = parseTimestamp(startInput);
    if (!parsed.valid) {
      setInputError(`Start time error: ${parsed.error}`);
    } else {
      setInputError(null);
      onChangeStart(parsed.seconds);
      setStartInput(formatTimestamp(parsed.seconds));
    }
  };

  const handleEndBlur = () => {
    const parsed = parseTimestamp(endInput);
    if (!parsed.valid) {
      setInputError(`End time error: ${parsed.error}`);
    } else {
      setInputError(null);
      onChangeEnd(parsed.seconds);
      setEndInput(formatTimestamp(parsed.seconds));
    }
  };

  const adjustTime = (target: 'start' | 'end', delta: number) => {
    if (target === 'start') {
      const newVal = Math.max(0, startSeconds + delta);
      onChangeStart(newVal);
      setStartInput(formatTimestamp(newVal));
    } else {
      const newVal = Math.max(startSeconds + 1, endSeconds + delta);
      onChangeEnd(newVal);
      setEndInput(formatTimestamp(newVal));
    }
    setInputError(null);
  };

  const isTooLong = duration > maxClipDuration;

  return (
    <div className="w-full glass-card rounded-2xl p-5 sm:p-6 border border-white/10 shadow-glass flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Clip Range &amp; Timing</h3>
        </div>

        {/* Live Duration Badge */}
        <div
          className={`px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-1.5 border transition-colors ${
            isTooLong
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
              : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
          }`}
        >
          {isTooLong ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span>Requested clip: {formatDurationDisplay(duration)}</span>
        </div>
      </div>

      {/* Timestamp Inputs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Start Time */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Start Timestamp (MM:SS or HH:MM:SS)</span>
            <span className="text-[11px] font-mono text-slate-500">{startSeconds}s</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              onBlur={handleStartBlur}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
              placeholder="00:00"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => adjustTime('start', 1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="+1 second"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => adjustTime('start', -1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="-1 second"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* End Time */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>End Timestamp (MM:SS or HH:MM:SS)</span>
            <span className="text-[11px] font-mono text-slate-500">{endSeconds}s</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              onBlur={handleEndBlur}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-white font-mono text-center focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 text-sm"
              placeholder="01:00"
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => adjustTime('end', 1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="+1 second"
              >
                <Plus className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => adjustTime('end', -1)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="-1 second"
              >
                <Minus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Validation / Format Error Alert */}
      {(inputError || !validation.valid) && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{inputError || validation.error}</span>
        </div>
      )}

      {/* Quick Length Presets */}
      <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
        <span className="text-slate-500 text-[11px]">Quick duration:</span>
        {[15, 30, 60, 120].map((dur) => (
          <button
            key={dur}
            type="button"
            onClick={() => {
              const newEnd = startSeconds + dur;
              onChangeEnd(newEnd);
              setEndInput(formatTimestamp(newEnd));
              setInputError(null);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-white/5 transition-colors text-[11px]"
          >
            +{dur}s
          </button>
        ))}
      </div>

      {/* Generate Clip Action Button */}
      <button
        type="button"
        disabled={isSubmitting || !validation.valid || Boolean(inputError)}
        onClick={onGenerateClip}
        className="mt-2 w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2.5 active:scale-[0.99]"
      >
        <Scissors className="w-5 h-5" />
        <span>Generate Clip ({formatTimestamp(duration)})</span>
      </button>
    </div>
  );
}
