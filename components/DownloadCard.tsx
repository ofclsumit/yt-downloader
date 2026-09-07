'use client';

import React, { useState } from 'react';
import { Download, CheckCircle2, Clock, HardDrive, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { formatTimestamp, formatDurationDisplay } from '@/lib/time';

interface Props {
  jobId: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  fileSizeBytes?: number | null;
  expiresAt?: string | Date | null;
  onReset: () => void;
}

export function DownloadCard({
  jobId,
  title,
  startSeconds,
  endSeconds,
  fileSizeBytes,
  expiresAt,
  onReset,
}: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const duration = Math.max(0, endSeconds - startSeconds);

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return 'Ready';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);

    try {
      // Request signed R2 URL from Vercel API
      const res = await fetch(`/api/jobs/${jobId}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Could not generate download link.');
      }

      const { downloadUrl, fileName } = await res.json();

      // Trigger direct download from Cloudflare R2 CDN (Zero Vercel Bandwidth)
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName || 'clip.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full glass-panel rounded-3xl p-6 sm:p-8 border border-emerald-500/20 shadow-glow flex flex-col gap-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white text-lg">Clip Ready for Download!</h3>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100% COMPLETE
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Render worker successfully trimmed and uploaded your clip to Cloudflare R2.
            </p>
          </div>
        </div>
      </div>

      {/* Clip Metadata Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-1">
          <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
            Timestamp Range
          </span>
          <span className="font-mono text-white text-sm">
            {formatTimestamp(startSeconds)} &rarr; {formatTimestamp(endSeconds)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-1">
          <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
            Clip Duration
          </span>
          <span className="font-mono text-cyan-300 text-sm">
            {formatDurationDisplay(duration)}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col gap-1">
          <span className="text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
            File Size
          </span>
          <span className="font-mono text-emerald-400 text-sm">
            {formatFileSize(fileSizeBytes)}
          </span>
        </div>
      </div>

      {/* Direct Cloudflare R2 Download Notice */}
      <div className="p-3 rounded-xl bg-slate-800/40 border border-white/5 flex items-center gap-2 text-xs text-slate-400">
        <Clock className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Signed download URL generated directly via Cloudflare R2. For privacy, clips expire 1 hour after generation.
        </span>
      </div>

      {downloadError && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
          {downloadError}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full sm:flex-1 py-4 rounded-xl font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2.5 active:scale-[0.99]"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Generating Secure R2 Link...</span>
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              <span>Download MP4 Clip</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-4 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-white/5 transition-colors flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Clip Another Video</span>
        </button>
      </div>
    </div>
  );
}
