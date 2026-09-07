'use client';

import React, { useState } from 'react';
import { Search, Clipboard, X, Loader2, PlayCircle, Sparkles } from 'lucide-react';
import { extractYouTubeVideoId } from '@/lib/youtube';

interface Props {
  url: string;
  setUrl: (url: string) => void;
  onAnalyze: (validUrl: string) => void;
  isLoading: boolean;
  error: string | null;
}

const SAMPLE_VIDEOS = [
  { label: 'Me at the zoo (Short 19s)', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { label: 'Big Buck Bunny (Animation)', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
  { label: 'Rick Astley (Music Video)', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
];

export function YouTubeUrlInput({ url, setUrl, onAnalyze, isLoading, error }: Props) {
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLocalError(null);

    const trimmed = url.trim();
    if (!trimmed) {
      setLocalError('Please enter a YouTube video URL.');
      return;
    }

    const check = extractYouTubeVideoId(trimmed);
    if (!check.valid || !check.videoId) {
      setLocalError(check.error || 'Please enter a valid YouTube video URL.');
      return;
    }

    onAnalyze(trimmed);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text.trim());
        setLocalError(null);
      }
    } catch {
      // Clipboard permissions denied
    }
  };

  const handleSampleClick = (sampleUrl: string) => {
    setUrl(sampleUrl);
    setLocalError(null);
    onAnalyze(sampleUrl);
  };

  const displayError = localError || error;

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="relative flex flex-col gap-2">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400 pointer-events-none">
            <Search className="w-5 h-5" />
          </div>

          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setLocalError(null);
            }}
            placeholder="Paste public YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
            className="w-full pl-12 pr-32 py-4 rounded-2xl bg-slate-900/80 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm sm:text-base shadow-inner"
            disabled={isLoading}
          />

          <div className="absolute right-2 flex items-center gap-1.5">
            {url && (
              <button
                type="button"
                onClick={() => {
                  setUrl('');
                  setLocalError(null);
                }}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handlePaste}
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-white/10 transition-colors"
              title="Paste from clipboard"
            >
              <Clipboard className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>

            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze</span>
                </>
              )}
            </button>
          </div>
        </div>

        {displayError && (
          <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span>{displayError}</span>
          </div>
        )}
      </form>

      {/* Quick Sample Links */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="flex items-center gap-1 text-slate-500">
          <PlayCircle className="w-3.5 h-3.5" />
          <span>Quick Samples:</span>
        </span>
        {SAMPLE_VIDEOS.map((sample) => (
          <button
            key={sample.url}
            type="button"
            onClick={() => handleSampleClick(sample.url)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-indigo-300 border border-white/5 hover:border-indigo-500/30 transition-all text-[11px]"
          >
            {sample.label}
          </button>
        ))}
      </div>
    </div>
  );
}
