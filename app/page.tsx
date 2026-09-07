'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/Navbar';
import { YouTubeUrlInput } from '@/components/YouTubeUrlInput';
import { VideoPreview } from '@/components/VideoPreview';
import { TimelineEditor } from '@/components/TimelineEditor';
import { ProcessingModal } from '@/components/ProcessingModal';
import { DownloadCard } from '@/components/DownloadCard';
import { Sparkles, Server, Cpu, Database, Cloud, ShieldCheck, Zap } from 'lucide-react';

interface VideoMetadata {
  videoId: string;
  title: string;
  author: string;
  thumbnail: string;
}

interface CompletedJobData {
  jobId: string;
  title: string;
  startSeconds: number;
  endSeconds: number;
  fileSizeBytes?: number | null;
  expiresAt?: string | Date | null;
}

function MainClipperContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL & Video State
  const [url, setUrl] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);

  // Timing State (default to 0 -> 30s)
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(30);

  // Job & Processing State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isSubmittingJob, setIsSubmittingJob] = useState(false);
  const [completedJob, setCompletedJob] = useState<CompletedJobData | null>(null);

  // Restore job from URL query parameter (?jobId=...) if present
  useEffect(() => {
    const queryJobId = searchParams.get('jobId');
    if (queryJobId && !activeJobId && !completedJob) {
      setActiveJobId(queryJobId);
    }
  }, [searchParams, activeJobId, completedJob]);

  // Video Analysis Handler
  const handleAnalyze = async (validUrl: string) => {
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setCompletedJob(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validUrl }),
      });

      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.message || 'Could not analyze video.');
      }

      setVideoMeta({
        videoId: data.videoId,
        title: data.title,
        author: data.author,
        thumbnail: data.thumbnail,
      });

      // Default to first 30 seconds
      setStartSeconds(0);
      setEndSeconds(30);
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Failed to analyze video');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Create Job Handler (Vercel API -> Postgres -> Redis)
  const handleGenerateClip = async () => {
    if (!url || !videoMeta) return;

    setIsSubmittingJob(true);
    setAnalyzeError(null);

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          startSeconds,
          endSeconds,
          quality: '1080',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to schedule clip generation.');
      }

      const newJobId = data.jobId;
      setActiveJobId(newJobId);
      router.push(`?jobId=${newJobId}`, { scroll: false });
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Failed to generate clip');
    } finally {
      setIsSubmittingJob(false);
    }
  };

  const handleJobCompleted = (jobData: any) => {
    setCompletedJob({
      jobId: jobData.jobId,
      title: jobData.title,
      startSeconds: jobData.startSeconds,
      endSeconds: jobData.endSeconds,
      fileSizeBytes: jobData.fileSizeBytes,
      expiresAt: jobData.expiresAt,
    });
    setActiveJobId(null);
  };

  const handleReset = () => {
    setCompletedJob(null);
    setActiveJobId(null);
    setUrl('');
    setVideoMeta(null);
    setStartSeconds(0);
    setEndSeconds(30);
    router.push('/', { scroll: false });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start w-full px-4 sm:px-6 py-8 max-w-5xl mx-auto gap-8">
      {/* Hero Header */}
      <div className="text-center flex flex-col items-center gap-3 pt-4 sm:pt-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 via-cyan-500/10 to-indigo-500/10 border border-white/10 text-xs font-medium text-slate-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Distributed Asynchronous Media Processing Pipeline</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
          Clip YouTube Videos with{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-indigo-300 to-indigo-500">
            Frame Precision
          </span>
        </h1>

        <p className="text-sm sm:text-base text-slate-400 max-w-xl">
          Enter any public YouTube URL, choose exact start and end timestamps, and generate a downloadable MP4.
        </p>

        {/* Distributed Architecture Tech Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-[11px] text-slate-400">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/5 flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-cyan-400" /> Vercel API
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/5 flex items-center gap-1.5">
            <Server className="w-3 h-3 text-indigo-400" /> Render Worker
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/5 flex items-center gap-1.5">
            <Cpu className="w-3 h-3 text-emerald-400" /> yt-dlp &amp; FFmpeg
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/5 flex items-center gap-1.5">
            <Database className="w-3 h-3 text-amber-400" /> Upstash &amp; Postgres
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-white/5 flex items-center gap-1.5">
            <Cloud className="w-3 h-3 text-rose-400" /> Cloudflare R2
          </span>
        </div>
      </div>

      {/* URL Input Box */}
      <div className="w-full max-w-3xl glass-panel rounded-3xl p-6 sm:p-8 shadow-glass border border-white/10">
        <YouTubeUrlInput
          url={url}
          setUrl={setUrl}
          onAnalyze={handleAnalyze}
          isLoading={isAnalyzing}
          error={analyzeError}
        />
      </div>

      {/* Completed Clip Download Card */}
      {completedJob && (
        <div className="w-full max-w-3xl">
          <DownloadCard
            jobId={completedJob.jobId}
            title={completedJob.title}
            startSeconds={completedJob.startSeconds}
            endSeconds={completedJob.endSeconds}
            fileSizeBytes={completedJob.fileSizeBytes}
            expiresAt={completedJob.expiresAt}
            onReset={handleReset}
          />
        </div>
      )}

      {/* Video Preview & Timeline Editor Workspace */}
      {videoMeta && !completedJob && (
        <div className="w-full max-w-3xl flex flex-col gap-6 animate-fadeIn">
          <VideoPreview
            videoId={videoMeta.videoId}
            title={videoMeta.title}
            author={videoMeta.author}
            startSeconds={startSeconds}
            endSeconds={endSeconds}
          />

          <TimelineEditor
            startSeconds={startSeconds}
            endSeconds={endSeconds}
            onChangeStart={setStartSeconds}
            onChangeEnd={setEndSeconds}
            onGenerateClip={handleGenerateClip}
            isSubmitting={isSubmittingJob}
            maxClipDuration={300}
          />
        </div>
      )}

      {/* Processing Modal for Active Jobs */}
      {activeJobId && (
        <ProcessingModal
          jobId={activeJobId}
          onClose={() => setActiveJobId(null)}
          onCompleted={handleJobCompleted}
        />
      )}

      {/* Architecture Highlights Footer Info */}
      <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400 pt-6 border-t border-white/5">
        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
            <Zap className="w-4 h-4" />
            <span>Section-Aware Extraction</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            yt-dlp downloads only the target section rather than the entire video file, saving bandwidth and execution time.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Cpu className="w-4 h-4" />
            <span>Accurate FFmpeg Cut</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Stream-copying with automatic H.264 fallback ensures frame-precise boundaries and universally playable MP4 files.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/40 border border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Direct Signed Storage</span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Generated clips are stored in Cloudflare R2. Vercel generates short-lived presigned URLs and never proxies heavy media.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<div className="text-center py-20 text-slate-500">Loading ClipEngine...</div>}>
        <MainClipperContent />
      </Suspense>
    </>
  );
}
