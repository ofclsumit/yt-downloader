'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertOctagon, X, Server, Cpu, CloudUpload, Film } from 'lucide-react';
import { formatTimestamp, formatDurationDisplay } from '@/lib/time';

interface JobStatusResponse {
  jobId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  progress: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  requestedDuration: number;
  downloadAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
}

interface Props {
  jobId: string | null;
  onClose: () => void;
  onCompleted: (jobData: JobStatusResponse) => void;
}

export function ProcessingModal({ jobId, onClose, onCompleted }: Props) {
  const [jobState, setJobState] = useState<JobStatusResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJobState(null);
      setPollError(null);
      return;
    }

    let isSubscribed = true;
    let timerId: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          throw new Error('Failed to retrieve job status.');
        }
        const data: JobStatusResponse = await res.json();
        if (!isSubscribed) return;

        setJobState(data);

        if (data.status === 'COMPLETED') {
          onCompleted(data);
          if (timerId) clearInterval(timerId);
        } else if (data.status === 'FAILED' || data.status === 'EXPIRED') {
          if (timerId) clearInterval(timerId);
        }
      } catch (err: unknown) {
        if (isSubscribed) {
          setPollError(err instanceof Error ? err.message : 'Connection error');
        }
      }
    };

    fetchStatus();
    timerId = setInterval(fetchStatus, 1500);

    return () => {
      isSubscribed = false;
      if (timerId) clearInterval(timerId);
    };
  }, [jobId, onCompleted]);

  if (!jobId) return null;

  const status = jobState?.status || 'QUEUED';
  const progress = jobState?.progress || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg glass-panel rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl relative flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Media Processing Engine</h3>
              <p className="text-xs font-mono text-slate-400">Job: {jobId.slice(0, 18)}...</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Graphic & Progress */}
        {status === 'FAILED' ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center">
              <AlertOctagon className="w-8 h-8" />
            </div>
            <div className="flex flex-col gap-1">
              <h4 className="font-bold text-lg text-white">Clip Generation Failed</h4>
              <p className="text-sm text-rose-300 max-w-md">
                {jobState?.errorMessage || 'An error occurred while processing the video clip.'}
              </p>
              {jobState?.errorCode && (
                <span className="text-xs font-mono text-slate-500 mt-1">
                  Code: {jobState.errorCode}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 py-2">
            {/* Steps Visualizer */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-2 transition-all ${
                  progress >= 20
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-slate-900/60 border-white/5 text-slate-500'
                }`}
              >
                <Server className="w-4 h-4" />
                <span className="font-medium text-[11px]">1. Render Worker</span>
              </div>

              <div
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-2 transition-all ${
                  progress >= 40
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-900/60 border-white/5 text-slate-500'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span className="font-medium text-[11px]">2. yt-dlp &amp; FFmpeg</span>
              </div>

              <div
                className={`p-3 rounded-xl border flex flex-col items-center text-center gap-2 transition-all ${
                  progress >= 90
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-white/5 text-slate-500'
                }`}
              >
                <CloudUpload className="w-4 h-4" />
                <span className="font-medium text-[11px]">3. Cloudflare R2</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>
                    {status === 'QUEUED'
                      ? 'Queued in Upstash Redis (awaiting worker claim)...'
                      : progress < 50
                      ? 'Section-aware downloading media...'
                      : progress < 85
                      ? 'Frame-accurate trimming & remuxing (FFmpeg)...'
                      : 'Uploading final clip to Cloudflare R2...'}
                  </span>
                </span>
                <span className="font-mono font-bold text-white">{progress}%</span>
              </div>

              <div className="w-full h-3 rounded-full bg-slate-900 border border-white/10 overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-400 transition-all duration-500"
                  style={{ width: `${Math.max(5, progress)}%` }}
                />
              </div>
            </div>

            {/* Clip Details summary */}
            {jobState && (
              <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400 flex flex-col gap-1.5">
                <div className="flex justify-between">
                  <span>Target Range:</span>
                  <span className="font-mono text-slate-200">
                    {formatTimestamp(jobState.startSeconds)} &rarr; {formatTimestamp(jobState.endSeconds)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Clip Duration:</span>
                  <span className="font-mono text-slate-200">
                    {formatDurationDisplay(jobState.requestedDuration)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Target Format:</span>
                  <span className="font-mono text-slate-200">MP4 (H.264 / AAC)</span>
                </div>
              </div>
            )}

            {pollError && (
              <p className="text-center text-xs text-amber-400">
                Reconnecting status poll: {pollError}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
