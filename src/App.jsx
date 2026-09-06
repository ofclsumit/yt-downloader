import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RouterProvider, useRouter, Link } from './router/Router';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SeoContentSection } from './components/SeoContentSection';
import { LegalPage } from './pages/LegalPage';
import { SEO_PAGES } from './data/seoPages';
import HeroSection from './components/HeroSection';
import YouTubeUrlInput from './components/YouTubeUrlInput';
import VideoPlayer from './components/VideoPlayer';
import LocalVideoPlayer from './components/LocalVideoPlayer';
import VideoMetadata from './components/VideoMetadata';
import TimestampEditor from './components/TimestampEditor';
import Timeline from './components/Timeline';
import ClipPreviewControls from './components/ClipPreviewControls';
import ShareModal from './components/ShareModal';
import ProcessingModal from './components/ProcessingModal';
import LegalModal from './components/LegalModal';
import AdminMetricsModal from './components/AdminMetricsModal';
import ChannelScraperModal from './components/ChannelScraperModal';
import DownloadsLibraryModal from './components/DownloadsLibraryModal';
import LoadingSkeleton from './components/LoadingSkeleton';
import ErrorMessage from './components/ErrorMessage';
import { validateTimeRange } from './utils/time';
import { buildShareUrl, parseShareParams } from './utils/share';
import { extractYouTubeVideoId } from './utils/youtube';
import { ToastProvider, useToast } from './components/common/Toast';
import {
  createVideoSession,
  fetchSessionDetails,
  sendSessionActivity,
  closeSession,
  getSessionToken,
  sendSessionCleanupBeacon,
} from './utils/session';
import {
  SessionExpiredScreen,
  SessionNotFoundScreen,
  SessionPreparingScreen,
} from './components/SessionStatusScreens';
import { apiUrl } from './config/api';

function AppContent() {
  const { path, params, navigate } = useRouter();
  const toast = useToast();

  const activeSessionId = params?.sessionId || null;
  const isClipRoute = Boolean(activeSessionId) || path.startsWith('/clip/');

  // Session lifecycle state: 'idle' | 'preparing' | 'active' | 'expired' | 'not_found'
  const [sessionState, setSessionState] = useState(isClipRoute ? 'preparing' : 'idle');

  // Source State: 'none' | 'youtube' | 'local'
  const [sourceType, setSourceType] = useState('none');

  // YouTube Specific State
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [videoCategory, setVideoCategory] = useState('others');
  const [selectedQuality, setSelectedQuality] = useState('1080');
  const [availableQualities, setAvailableQualities] = useState([]);
  const [isLoadingQualities, setIsLoadingQualities] = useState(false);
  const [qualityError, setQualityError] = useState(null);

  // Local/Authorized Media Specific State
  const [localMedia, setLocalMedia] = useState(null);

  // Shared Video Duration & Timestamps (in seconds)
  const [videoDuration, setVideoDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);

  // Ephemeral Session & Inactivity State (5 Minutes = 300 Seconds)
  const [sessionId, setSessionId] = useState(null);
  const [idleRemaining, setIdleRemaining] = useState(300);
  const lastActivityRef = React.useRef(Date.now());
  const analysisAbortRef = React.useRef(null);
  const analysisReqIdRef = React.useRef(0);

  // Playback & UI States
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewingClip, setIsPreviewingClip] = useState(false);
  const [isClipFinished, setIsClipFinished] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Modals
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLegalOpen, setIsLegalOpen] = useState(false);
  const [isAdminMetricsOpen, setIsAdminMetricsOpen] = useState(false);
  const [isChannelScraperOpen, setIsChannelScraperOpen] = useState(false);
  const [channelScraperUrl, setChannelScraperUrl] = useState('');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Processing Job State
  const [activeJobId, setActiveJobId] = useState(null);
  const [isProcessingModalOpen, setIsProcessingModalOpen] = useState(false);
  const [isFullVideoJob, setIsFullVideoJob] = useState(false);

  // Signals for Video Players
  const [previewSignal, setPreviewSignal] = useState(0);
  const [pauseSignal, setPauseSignal] = useState(0);
  const [seekSignal, setSeekSignal] = useState(null);

  // Look up SEO page config based on current path
  const pageData = SEO_PAGES[path] || ((path === '/' || path === '/clip') ? {
    h1: 'Create the exact video clip you need.',
    tagline: 'Choose a video, set the exact start and end time, select your preferred quality, and create a clip in seconds.',
    badge: 'Precision Slicing',
    intro: 'TrimPoint gives you frame-level control over online video highlights. Set your timestamps, choose your resolution up to 4K, and extract the exact clip directly from the cloud.',
    workflowTitle: 'Supported 4-Step Clipping Workflow',
    features: [
      { title: 'Sub-Second Precision', desc: 'Set start and end times down to the exact second or millisecond using steppers or dual timeline scrubbers.' },
      { title: 'Lossless Stream Copying', desc: 'Preserves the original video clarity, frame rate, and audio without generational re-compression loss.' },
      { title: 'Dynamic Resolution Selector', desc: 'Export your clip in 4K, 1440p, 1080p, 720p, or convert the segment directly into a high-bitrate MP3 audio track.' },
      { title: 'No Watermarks or Sign-Up', desc: 'Create clean, watermark-free clips directly in your browser without mandatory accounts or hidden paywalls.' }
    ],
    faqs: [
      { q: 'What is TrimPoint?', a: 'TrimPoint is a precision online video clipping platform that extracts exact clips from online videos using start and end timestamps.' },
      { q: 'Do I have to download the whole video first?', a: 'No. TrimPoint requests only the HTTP byte ranges matching your selected timestamps directly from the CDN, creating your clip in seconds.' },
      { q: 'Is there a limit on clip duration?', a: 'You can create clips from 1 second up to several minutes long depending on the source video length.' }
    ],
    relatedTools: ['/video-clipper', '/video-cutter', '/video-trimmer', '/timestamp-video-cutter', '/youtube-video-clipper']
  } : null);

  // Update Page Title and Meta Description dynamically on route change
  useEffect(() => {
    if (pageData) {
      document.title = pageData.title || `${pageData.h1} — TrimPoint`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && pageData.metaDescription) {
        metaDesc.setAttribute('content', pageData.metaDescription);
      }
    } else if (path === '/privacy') {
      document.title = 'Privacy Policy — TrimPoint';
    } else if (path === '/terms') {
      document.title = 'Terms of Service — TrimPoint';
    } else if (path === '/about') {
      document.title = 'About Us — TrimPoint';
    } else if (path === '/contact') {
      document.title = 'Contact Support — TrimPoint';
    } else {
      document.title = 'TrimPoint — Precision Online Video Clipper';
    }
  }, [path, pageData]);

  // Analyze metadata and category using backend (Robust with cancellation, race-condition immunity, and zero fake qualities)
  const fetchVideoAnalysis = useCallback(async (urlToAnalyze) => {
    if (!urlToAnalyze) return;

    // Cancel any previous in-flight analysis request (Requirement 17)
    if (analysisAbortRef.current) {
      analysisAbortRef.current.abort();
    }
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    const currentReqId = ++analysisReqIdRef.current;

    setIsLoadingQualities(true);
    setQualityError(null);

    try {
      const res = await fetch(apiUrl('/api/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToAnalyze, sessionId }),
        signal: controller.signal,
      });

      // Ignore stale responses if a newer request was dispatched (Requirement 18)
      if (currentReqId !== analysisReqIdRef.current) return;

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 410) {
          setSessionState('expired');
          throw new Error('This video session has expired.');
        }
        throw new Error(err.detail || 'Could not inspect video stream qualities.');
      }

      const data = await res.json();
      if (currentReqId !== analysisReqIdRef.current) return;

      if (data.category) {
        setVideoCategory(data.category);
      }
      if (data.title && !videoMetadata) {
        setVideoMetadata({
          title: data.title,
          author: data.author,
          thumbnail: data.thumbnail,
        });
      }
      if (data.duration && videoDuration === 0) {
        setVideoDuration(data.duration);
        setEndTime(Math.min(data.duration, 60));
      }

      // Populate ONLY real extraction results (Requirement 29: NEVER use fake quality options)
      if (data.qualities && Array.isArray(data.qualities) && data.qualities.length > 0) {
        setAvailableQualities(data.qualities);
        setSelectedQuality(data.defaultQuality || data.qualities[0].id);
        setQualityError(null);
      } else {
        setAvailableQualities([]);
        setQualityError('No compatible video qualities were found.');
      }
    } catch (err) {
      // Ignore deliberate user cancellations
      if (err.name === 'AbortError') return;
      if (currentReqId !== analysisReqIdRef.current) return;

      console.warn('Format analysis warning:', err.message);
      setQualityError(err.message || 'Unable to analyze this video. Please try again.');
      setAvailableQualities([]); // Never hardcode fake fallback qualities!
    } finally {
      if (currentReqId === analysisReqIdRef.current) {
        setIsLoadingQualities(false);
      }
    }
  }, [sessionId, videoMetadata, videoDuration]);

  // Safe retry handler: prevents duplicate simultaneous requests while active (Requirement 16)
  const handleRetryQualities = useCallback(() => {
    if (isLoadingQualities) return;
    if (videoUrl) {
      fetchVideoAnalysis(videoUrl);
    }
  }, [videoUrl, isLoadingQualities, fetchVideoAnalysis]);

  // Revalidate or restore session whenever activeSessionId changes
  useEffect(() => {
    if (!activeSessionId) {
      if (path === '/' || !path.startsWith('/clip/')) {
        setSessionState('idle');
      }
      return;
    }

    let isMounted = true;
    setSessionState('preparing');

    fetchSessionDetails(activeSessionId).then((res) => {
      if (!isMounted) return;

      if (res.ok && res.session) {
        const sess = res.session;
        setSessionId(sess.sessionId);
        setVideoUrl(sess.videoUrl);
        setVideoId(sess.videoId);
        setSourceType(sess.videoId ? 'youtube' : 'local');
        setStartTime(sess.timestamps?.start || 0);
        setEndTime(sess.timestamps?.end || 60);
        setSelectedQuality(sess.quality || '1080');
        setIdleRemaining(sess.remainingSeconds || 300);
        lastActivityRef.current = Date.now();
        setSessionState('active');

        if (sess.jobId) {
          setActiveJobId(sess.jobId);
          if (sess.job && (sess.job.status === 'processing' || sess.job.status === 'queued')) {
            setIsProcessingModalOpen(true);
          }
        }

        if (sess.videoUrl && sess.videoId) {
          fetchVideoAnalysis(sess.videoUrl);
        }
      } else if (res.status === 'expired') {
        setSessionState('expired');
      } else if (res.status === 'not_found') {
        setSessionState('not_found');
      } else {
        setErrorMessage('Could not connect to session. Check network.');
        setSessionState('not_found');
      }
    });

    return () => {
      isMounted = false;
    };
  }, [activeSessionId, path, fetchVideoAnalysis]);

  const validation = useMemo(() => {
    return validateTimeRange(startTime, endTime, videoDuration);
  }, [startTime, endTime, videoDuration]);

  const shareUrl = useMemo(() => {
    if (sourceType === 'youtube' && videoId) {
      return buildShareUrl(videoId, startTime, endTime);
    }
    return '';
  }, [sourceType, videoId, startTime, endTime]);

  const handleLoadYouTube = useCallback(async (arg1, arg2) => {
    setErrorMessage(null);

    // Bulletproof extraction: correctly determine which argument is the 11-char ID vs full URL
    let resolvedId = null;
    let resolvedUrl = null;

    if (arg1 && typeof arg1 === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(arg1.trim())) {
      resolvedId = arg1.trim();
      resolvedUrl = (arg2 && typeof arg2 === 'string' && arg2.startsWith('http'))
        ? arg2.trim()
        : `https://www.youtube.com/watch?v=${resolvedId}`;
    } else if (arg2 && typeof arg2 === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(arg2.trim())) {
      resolvedId = arg2.trim();
      resolvedUrl = (arg1 && typeof arg1 === 'string' && arg1.startsWith('http'))
        ? arg1.trim()
        : `https://www.youtube.com/watch?v=${resolvedId}`;
    } else {
      const candidate = (arg1 && typeof arg1 === 'string' && arg1.includes('http'))
        ? arg1
        : (arg2 || arg1 || '');
      const extracted = extractYouTubeVideoId(candidate);
      if (extracted.valid && extracted.videoId) {
        resolvedId = extracted.videoId;
        resolvedUrl = candidate.startsWith('http') ? candidate : `https://www.youtube.com/watch?v=${resolvedId}`;
      }
    }

    if (!resolvedUrl && !resolvedId) {
      setErrorMessage('Invalid YouTube video ID. Please check the URL and try again.');
      return;
    }

    const finalUrl = resolvedUrl || `https://www.youtube.com/watch?v=${resolvedId}`;

    setIsLoading(true);
    setSessionState('preparing');

    const res = await createVideoSession(finalUrl);
    setIsLoading(false);

    if (!res.ok) {
      setSessionState('idle');
      const msg = res.status === 429
        ? 'Processing is currently busy. Please try again shortly.'
        : (res.error || 'Failed to initialize video session.');
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    toast.success('Workspace ready!');
    navigate(`/clip/${res.session.sessionId}`);
  }, [navigate, toast]);

  const handleLoadChannel = useCallback((url) => {
    setChannelScraperUrl(url);
    setIsChannelScraperOpen(true);
  }, []);

  const handleLoadLocalMedia = useCallback(async (mediaObj) => {
    setErrorMessage(null);
    setIsLoading(true);
    setSessionState('preparing');

    const res = await createVideoSession(mediaObj.mediaUrl || mediaObj.sourceRef || 'sample:authorized');
    setIsLoading(false);

    if (!res.ok) {
      setSessionState('idle');
      setErrorMessage(res.error || 'Failed to initialize session.');
      return;
    }

    setLocalMedia(mediaObj);
    navigate(`/clip/${res.session.sessionId}`);
  }, [navigate]);

  const handlePlayerReady = useCallback((dur) => {
    setIsPlayerReady(true);
    setIsLoading(false);
    if (dur > 0) {
      setVideoDuration(dur);
      if (endTime > dur) {
        setEndTime(dur);
      }
    }
  }, [endTime]);

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const handleStateChange = useCallback((playing) => {
    setIsPlaying(playing);
    if (!playing && isPreviewingClip) {
      setIsPreviewingClip(false);
    }
  }, [isPreviewingClip]);

  const handleClipFinished = useCallback(() => {
    setIsClipFinished(true);
    setIsPreviewingClip(false);
    setIsPlaying(false);
  }, []);

  const handlePlayerError = useCallback((err) => {
    setErrorMessage(err);
    setIsLoading(false);
  }, []);

  const lastActivitySentRef = React.useRef(0);

  const recordUserActivity = useCallback((action = 'interaction') => {
    lastActivityRef.current = Date.now();
    setIdleRemaining(300);

    if (!sessionId) return;
    const now = Date.now();
    if (now - lastActivitySentRef.current > 15000 || action === 'timestamp_change' || action === 'create_clip') {
      lastActivitySentRef.current = now;
      const token = getSessionToken(sessionId);
      sendSessionActivity(sessionId, token, {
        timestamps: { start: startTime, end: endTime },
        quality: selectedQuality,
        action,
      });
    }
  }, [sessionId, startTime, endTime, selectedQuality]);

  const handleStartTimeChange = useCallback((newStart) => {
    setStartTime(newStart);
    setIsClipFinished(false);
    if (endTime < newStart) {
      setEndTime(Math.min(videoDuration || newStart + 60, newStart + 1));
    }
    recordUserActivity('timestamp_change');
  }, [endTime, videoDuration, recordUserActivity]);

  const handleEndTimeChange = useCallback((newEnd) => {
    setEndTime(newEnd);
    setIsClipFinished(false);
    if (startTime > newEnd) {
      setStartTime(Math.max(0, newEnd - 1));
    }
    recordUserActivity('timestamp_change');
  }, [startTime, recordUserActivity]);

  const handleSeek = useCallback((time) => {
    setSeekSignal(time);
    setCurrentTime(time);
    setIsClipFinished(false);
    recordUserActivity('seek');
  }, [recordUserActivity]);

  const handlePreviewClip = useCallback(() => {
    if (!validation.valid) return;
    setIsClipFinished(false);
    setIsPreviewingClip(true);
    setPreviewSignal((prev) => prev + 1);
    recordUserActivity('preview');
  }, [validation.valid, recordUserActivity]);

  const handlePauseClip = useCallback(() => {
    setIsPreviewingClip(false);
    setPauseSignal((prev) => prev + 1);
  }, []);

  const handleReplayClip = useCallback(() => {
    if (!validation.valid) return;
    setIsClipFinished(false);
    setIsPreviewingClip(true);
    setPreviewSignal((prev) => prev + 1);
    recordUserActivity('replay');
  }, [validation.valid, recordUserActivity]);

  const handleReset = useCallback(() => {
    if (sessionId) {
      const token = getSessionToken(sessionId);
      closeSession(sessionId, token, activeJobId);
      sendSessionCleanupBeacon(sessionId, activeJobId);
    }
    setSessionState('idle');
    setSessionId(null);
    setSourceType('none');
    setVideoUrl('');
    setVideoId(null);
    setVideoMetadata(null);
    setLocalMedia(null);
    setVideoDuration(0);
    setStartTime(0);
    setEndTime(60);
    setCurrentTime(0);
    setIsPlayerReady(false);
    setIsPlaying(false);
    setIsPreviewingClip(false);
    setIsClipFinished(false);
    setIsLoading(false);
    setErrorMessage(null);
    setAvailableQualities([]);
    setActiveJobId(null);
    setIsProcessingModalOpen(false);
    setIdleRemaining(300);
    navigate('/', true);
  }, [sessionId, activeJobId, navigate]);

  const handleSessionExpired = useCallback(() => {
    if (sessionState !== 'active') return;
    if (sessionId) {
      const token = getSessionToken(sessionId);
      closeSession(sessionId, token, activeJobId);
      sendSessionCleanupBeacon(sessionId, activeJobId);
    }
    setSessionState('expired');
    setIsProcessingModalOpen(false);
    toast.info('Session expired after 5 minutes of inactivity.');
  }, [sessionState, sessionId, activeJobId, toast]);

  // Inactivity & Tab Visibility Tracker (Auto-closes after 5 minutes idle)
  useEffect(() => {
    if (sessionState !== 'active' || !sessionId) return;

    const onUserInteraction = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });
    window.addEventListener('mousedown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchSessionDetails(sessionId).then((res) => {
          if (res.ok) {
            setSessionState('active');
            setIdleRemaining(res.session.remainingSeconds || 300);
            lastActivityRef.current = Date.now();
          } else if (res.status === 'expired') {
            handleSessionExpired();
          } else if (res.status === 'not_found') {
            setSessionState('not_found');
          }
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const timer = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, 300 - elapsed);
      setIdleRemaining(remaining);
      if (remaining <= 0) {
        handleSessionExpired();
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('mousedown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, [sessionState, sessionId, handleSessionExpired]);

  // Page Refresh / Tab Close Protection
  const sessionRef = React.useRef({ sessionId, activeJobId });
  sessionRef.current = { sessionId, activeJobId };

  useEffect(() => {
    const handleBeforeUnload = () => {
      const { sessionId: sId, activeJobId: jId } = sessionRef.current;
      if (sId || jId) {
        sendSessionCleanupBeacon(sId, jId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Trigger Clip Job
  const handleCreateClip = useCallback(async () => {
    if (!validation.valid || !videoUrl || !sessionId) return;
    try {
      setIsFullVideoJob(false);
      setIsProcessingModalOpen(true);
      setActiveJobId(null);

      const token = getSessionToken(sessionId);

      const res = await fetch(apiUrl('/api/clips'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Session-Token': token } : {}),
        },
        body: JSON.stringify({
          url: videoUrl,
          isClip: true,
          start: startTime,
          end: endTime,
          category: videoCategory,
          quality: selectedQuality,
          sessionId: sessionId,
          sessionToken: token,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 429) {
          throw new Error(err.detail || 'Processing is currently busy. Please try again shortly.');
        }
        if (res.status === 409) {
          throw new Error(err.detail || 'A clip is already being created for this session.');
        }
        if (res.status === 410) {
          setSessionState('expired');
          setIsProcessingModalOpen(false);
          return;
        }
        throw new Error(err.detail || 'Failed to initiate clipping job on backend.');
      }
      const data = await res.json();
      setActiveJobId(data.jobId);
    } catch (err) {
      toast.error(err.message || 'Failed to start clipping job.');
      setIsProcessingModalOpen(false);
    }
  }, [validation.valid, videoUrl, sessionId, startTime, endTime, videoCategory, selectedQuality, toast]);

  // Trigger Full Video Job
  const handleDownloadFullVideo = useCallback(async () => {
    if (!videoUrl) return;
    try {
      setIsFullVideoJob(true);
      setIsProcessingModalOpen(true);
      setActiveJobId(null);

      const res = await fetch(apiUrl('/api/clips'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl,
          isClip: false,
          category: videoCategory,
          quality: selectedQuality,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to initiate download job on backend.');
      }
      const data = await res.json();
      setActiveJobId(data.jobId);
    } catch (err) {
      toast.error(err.message || 'Failed to start download job.');
      setIsProcessingModalOpen(false);
    }
  }, [videoUrl, videoCategory, selectedQuality, toast]);

  const handleCancelJob = useCallback(async (jobId) => {
    try {
      await fetch(apiUrl(`/api/clips/${jobId}`), { method: 'DELETE' });
    } catch (err) {
      console.warn('Cancellation request error:', err);
    }
    setIsProcessingModalOpen(false);
    setActiveJobId(null);
  }, []);

  const isDedicatedClipRoute = isClipRoute;
  const isWorkspaceActive = isDedicatedClipRoute && sessionState === 'active';
  const isSessionPreparing = sessionState === 'preparing';
  const isSessionExpired = isDedicatedClipRoute && sessionState === 'expired';
  const isSessionNotFound = isDedicatedClipRoute && sessionState === 'not_found';
  const isLegalRoute = path === '/privacy' || path === '/terms' || path === '/about' || path === '/contact';

  return (
    <div className="app-layout">
      {/* Top Navbar */}
      <Navbar onResetTool={handleReset} />

      <main className="main-content">
        <div key={path} className="page-transition-wrapper">
          {isLegalRoute ? (
            <LegalPage pageType={path.replace('/', '')} />
          ) : isSessionPreparing ? (
            <SessionPreparingScreen message="Preparing your workspace..." />
          ) : isSessionExpired ? (
            <SessionExpiredScreen onStartAgain={handleReset} />
          ) : isSessionNotFound ? (
            <SessionNotFoundScreen onStartAgain={handleReset} />
          ) : isWorkspaceActive ? (
            /* Dedicated Video Editor Workspace */
            <div
              className="card editor-card"
              style={{ display: isLoading && !isPlayerReady ? 'none' : 'block' }}
            >
              <div className="editor-header-bar">
                <div className="current-url-display">
                  <span>Loaded Video:</span>
                  <span className="current-url-code">
                    {sourceType === 'youtube'
                      ? `YouTube: ${videoId}`
                      : localMedia?.sourceRef || 'Authorized Media'}
                  </span>
                  {sessionId && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#a5b4fc',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                      title="Temporary per-video session active"
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                      <span>Session: {sessionId}</span>
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background: idleRemaining <= 60 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                      color: idleRemaining <= 60 ? '#fca5a5' : 'var(--text-muted)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Session expires after 5 minutes of inactivity to protect server resources"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>
                      Auto-close in {Math.floor(idleRemaining / 60)}:{(idleRemaining % 60).toString().padStart(2, '0')}
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {sessionId && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        if (navigator.clipboard) {
                          navigator.clipboard.writeText(window.location.href);
                          toast.success('Temporary session URL copied');
                        }
                      }}
                      style={{ fontSize: '0.78rem', height: '32px', padding: '0 0.6rem' }}
                      title="Copy temporary session URL"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy URL</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={handleReset}
                    style={{ fontSize: '0.82rem', height: '32px' }}
                    title="End session and return to homepage"
                  >
                    End Session
                  </button>
                </div>
              </div>

              <div className="editor-responsive-layout">
                {/* Primary Column: Video Player & Metadata */}
                <div className="editor-primary-column">
                  {sourceType === 'youtube' && videoId ? (
                    <VideoPlayer
                      videoId={videoId}
                      startTime={startTime}
                      endTime={endTime}
                      isPreviewingClip={isPreviewingClip}
                      previewSignal={previewSignal}
                      pauseSignal={pauseSignal}
                      seekSignal={seekSignal}
                      onPlayerReady={handlePlayerReady}
                      onTimeUpdate={handleTimeUpdate}
                      onStateChange={handleStateChange}
                      onClipFinished={handleClipFinished}
                      onError={handlePlayerError}
                    />
                  ) : (
                    <LocalVideoPlayer
                      mediaSrc={localMedia?.mediaUrl}
                      startTime={startTime}
                      endTime={endTime}
                      isPreviewingClip={isPreviewingClip}
                      previewSignal={previewSignal}
                      pauseSignal={pauseSignal}
                      seekSignal={seekSignal}
                      onLoadedMetadata={(dur) => {
                        if (dur > 0) {
                          setVideoDuration(dur);
                          setEndTime(Math.min(dur, 20));
                        }
                      }}
                      onTimeUpdate={handleTimeUpdate}
                      onStateChange={handleStateChange}
                      onClipFinished={handleClipFinished}
                    />
                  )}

                  <VideoMetadata
                    metadata={videoMetadata}
                    duration={videoDuration}
                    videoId={videoId}
                    category={videoCategory}
                    onCategoryChange={setVideoCategory}
                  />
                </div>

                {/* Controls Column: Timestamps, Timeline, Quality, & Actions */}
                <div className="editor-controls-column">
                  <TimestampEditor
                    startTime={startTime}
                    endTime={endTime}
                    duration={videoDuration}
                    currentTime={currentTime}
                    onStartTimeChange={handleStartTimeChange}
                    onEndTimeChange={handleEndTimeChange}
                  />

                  <Timeline
                    startTime={startTime}
                    endTime={endTime}
                    duration={videoDuration}
                    currentTime={currentTime}
                    onStartTimeChange={handleStartTimeChange}
                    onEndTimeChange={handleEndTimeChange}
                    onSeek={handleSeek}
                  />

                  <ClipPreviewControls
                    startTime={startTime}
                    endTime={endTime}
                    duration={videoDuration}
                    currentTime={currentTime}
                    isPlaying={isPlaying}
                    isPreviewingClip={isPreviewingClip}
                    isClipFinished={isClipFinished}
                    onPreviewClip={handlePreviewClip}
                    onPauseClip={handlePauseClip}
                    onReplayClip={handleReplayClip}
                    onCreateClip={handleCreateClip}
                    onDownloadFullVideo={handleDownloadFullVideo}
                    onShareClick={() => setIsShareOpen(true)}
                    onReset={handleReset}
                    isValidRange={validation.valid}
                    selectedQuality={selectedQuality}
                    availableQualities={availableQualities}
                    onChangeQuality={setSelectedQuality}
                    isLoadingQualities={isLoadingQualities}
                    qualityError={qualityError}
                    onRetryQualities={handleRetryQualities}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Independent, Lightweight Homepage & Landing Page View */
            <>
              {/* Breadcrumbs on tool/use-case pages */}
              {path !== '/' && pageData && (
                <div className="tool-breadcrumb-bar">
                  <Link href="/" className="crumb-home">Home</Link>
                  <span className="crumb-sep">&rsaquo;</span>
                  <span className="crumb-current">{pageData.h1}</span>
                </div>
              )}

              {/* SaaS Hero Section */}
              <HeroSection
                customTitle={pageData?.h1}
                customSubtitle={pageData?.tagline}
              />

              {/* Interactive URL Input / File Uploader */}
              <YouTubeUrlInput
                initialUrl={videoUrl}
                onLoadYouTube={handleLoadYouTube}
                onLoadChannel={handleLoadChannel}
                onLoadLocalMedia={handleLoadLocalMedia}
                isLoading={isLoading || sessionState === 'preparing'}
              />

              {/* Error Banner */}
              {errorMessage && (
                <ErrorMessage
                  message={errorMessage}
                  onDismiss={() => setErrorMessage(null)}
                />
              )}

              {/* Rich SEO Content Section (Features, How it Works, FAQs, Related Tools) */}
              {pageData && (
                <SeoContentSection pageData={pageData} />
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile Sticky Bottom Action Bar */}
      {isWorkspaceActive && isPlayerReady && (
        <aside className="mobile-sticky-action-bar" aria-label="Mobile Quick Action Bar">
          <div className="sticky-action-inner">
            <button
              type="button"
              className="btn-primary sticky-btn-main"
              onClick={handleCreateClip}
              disabled={!validation.valid}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
              <span>
                Download Clip ({selectedQuality === 'mp3' ? 'MP3' : (selectedQuality === 'best' ? 'Best' : `${selectedQuality}p`)})
              </span>
            </button>

            {isPlaying && isPreviewingClip ? (
              <button
                type="button"
                className="btn-secondary sticky-btn-preview"
                onClick={handlePauseClip}
                aria-label="Pause clip preview"
                title="Pause clip"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary sticky-btn-preview"
                onClick={handlePreviewClip}
                disabled={!validation.valid}
                aria-label="Preview selected clip"
                title="Preview clip"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* Share Modal Dialog */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        videoId={videoId}
        startTime={startTime}
        endTime={endTime}
        shareUrl={shareUrl}
      />

      {/* Processing & Download Modal */}
      <ProcessingModal
        isOpen={isProcessingModalOpen}
        jobId={activeJobId}
        onClose={() => setIsProcessingModalOpen(false)}
        onCancel={handleCancelJob}
        start={startTime}
        end={endTime}
        isFullVideo={isFullVideoJob}
        quality={selectedQuality}
        availableQualities={availableQualities}
        onReset={handleReset}
      />

      {/* Channel Batch Scraper Modal */}
      <ChannelScraperModal
        isOpen={isChannelScraperOpen}
        onClose={() => setIsChannelScraperOpen(false)}
        initialChannelUrl={channelScraperUrl}
      />

      {/* Downloads Library Modal */}
      <DownloadsLibraryModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
      />

      {/* Legal & Privacy Policy Modal */}
      <LegalModal
        isOpen={isLegalOpen}
        onClose={() => setIsLegalOpen(false)}
      />

      {/* System Observability Modal */}
      <AdminMetricsModal
        isOpen={isAdminMetricsOpen}
        onClose={() => setIsAdminMetricsOpen(false)}
      />

      {/* SaaS Footer */}
      <Footer
        onOpenLibrary={() => setIsLibraryOpen(true)}
        onOpenMetrics={() => setIsAdminMetricsOpen(true)}
        onOpenChannelScraper={() => setIsChannelScraperOpen(true)}
      />
    </div>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </RouterProvider>
  );
}
