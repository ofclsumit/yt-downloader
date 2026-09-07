'use client';

import React, { useRef } from 'react';
import { Play, User, ExternalLink, FastForward, Rewind } from 'lucide-react';
import { formatTimestamp } from '@/lib/time';

interface Props {
  videoId: string;
  title: string;
  author: string;
  startSeconds: number;
  endSeconds: number;
}

export function VideoPreview({
  videoId,
  title,
  author,
  startSeconds,
  endSeconds,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1&start=${Math.floor(startSeconds)}`;

  return (
    <div className="w-full glass-card rounded-2xl overflow-hidden border border-white/10 shadow-glass">
      {/* Video Header info */}
      <div className="p-4 border-b border-white/5 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white text-sm sm:text-base line-clamp-1">
            {title || 'YouTube Video'}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>{author || 'Creator'}</span>
            </span>
            <span>&bull;</span>
            <span className="text-slate-500 font-mono text-[11px]">ID: {videoId}</span>
          </div>
        </div>

        <a
          href={`https://www.youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors shrink-0"
          title="Open in YouTube"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Embedded Video Player */}
      <div className="relative w-full aspect-video bg-black/60">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>

      {/* Fast Seek Controls */}
      <div className="p-3 bg-slate-900/40 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            Clip Range:
          </span>
          <span className="font-mono text-indigo-300 font-semibold">
            {formatTimestamp(startSeconds)} &rarr; {formatTimestamp(endSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (iframeRef.current) {
                iframeRef.current.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=1&start=${Math.floor(startSeconds)}`;
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
          >
            <Rewind className="w-3 h-3 text-cyan-400" />
            <span>Play from Start</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (iframeRef.current) {
                iframeRef.current.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&autoplay=1&start=${Math.max(0, Math.floor(endSeconds - 3))}`;
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-[11px]"
          >
            <FastForward className="w-3 h-3 text-indigo-400" />
            <span>Preview End</span>
          </button>
        </div>
      </div>
    </div>
  );
}
