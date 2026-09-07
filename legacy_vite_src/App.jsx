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
import QualityDownloadStep from './components/QualityDownloadStep';
import ShareModal from './components/ShareModal';
import ProcessingModal from './components/ProcessingModal';
import LegalModal from './components/LegalModal';
import AdminMetricsModal from './components/AdminMetricsModal';
import ChannelScraperModal from './components/ChannelScraperModal';
import DownloadsLibraryModal from './components/DownloadsLibraryModal';
import LoadingSkeleton from './components/LoadingSkeleton';
import ErrorMessage from './components/ErrorMessage';
import { validateTimeRange } from './utils/time';
import { buildShareUrl } from './utils/share';
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

  // Stepped Workflow State: 2 = Choose Timestamps, 3 = Quality & Download Options
  const [workspaceStep, setWorkspaceStep] = useState(2);

  // Ephemeral Session Fixed Expiration State (5 Minutes = 300 Seconds from creation)
  const [sessionId, setSessionId] = useState(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState(null);
  const [idleRemaining, setIdleRemaining] = useState(300);
  const lastActivitySentRef = React.useRef(0);
  const analysisAbortRef = React.useRef(null);
  const analysisReqIdRef = React.useRef(0);
  const fetchVideoAnalysisRef = React.useRef(null);

  // Local Host Health & FFmpeg Availability
  const [localHealth, setLocalHealth] = useState({
    checked: false,
    serviceOnline: true,
    ffmpegAvailable: true,
    ffmpegError: null,
  });

  const checkLocalHealth = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/health'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLocalHealth({
        checked: true,
        serviceOnline: true,
        ffmpegAvailable: data?.ffmpeg?.available !== false,
        ffmpegError: data?.ffmpeg?.error || null,
      });
    } catch {
      setLocalHealth({
        checked: true,
        serviceOnline: false,
        ffmpegAvailable: false,
        ffmpegError: null,
      });
    }
  }, []);

  useEffect(() => {
    checkLocalHealth();
  }, [checkLocalHealth]);

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

  // Keep ref in sync so useEffect can call latest version without dependency loop
  fetchVideoAnalysisRef.current = fetchVideoAnalysis;

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

        let expiresAtMs = sess.expiresAt ? sess.expiresAt * 1000 : null;
        if (!expiresAtMs) {
          const stored = window.sessionStorage.getItem('tp_sess_expires_' + activeSessionId);
          expiresAtMs = stored ? Number(stored) : (Date.now() + (sess.remainingSeconds || 300) * 1000);
        }
        setSessionExpiresAt(expiresAtMs);
        setIdleRemaining(Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000)));

        setWorkspaceStep(2);
        setSessionState('active');

        if (sess.jobId) {
          setActiveJobId(sess.jobId);
          if (sess.job && (sess.job.status === 'processing' || sess.job.status === 'queued')) {
            setIsProcessingModalOpen(true);
          }
        }

        if (sess.videoUrl && sess.videoId) {
          if (fetchVideoAnalysisRef.current) {
            Promise.resolve(fetchVideoAnalysisRef.current(sess.videoUrl)).catch(() => {});
          }
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
  }, [activeSessionId, path]);

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

    // Set fixed absolute expiration (5 minutes from creation)
    const expiresAtMs = res.session?.expiresAt ? res.session.expiresAt * 1000 : Date.now() + 300000;
    setSessionExpiresAt(expiresAtMs);
    try {
      window.sessionStorage.setItem('tp_sess_expires_' + res.session.sessionId, String(expiresAtMs));
    } catch (e) {}

    setWorkspaceStep(2);
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

    const expiresAtMs = res.session?.expiresAt ? res.session.expiresAt * 1000 : Date.now() + 300000;
    setSessionExpiresAt(expiresAtMs);
    try {
      window.sessionStorage.setItem('tp_sess_expires_' + res.session.sessionId, String(expiresAtMs));
    } catch (e) {}

    setWorkspaceStep(2);
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

  const recordUserActivity = useCallback((action = 'interaction') => {
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
      try {
        window.sessionStorage.removeItem('tp_sess_expires_' + sessionId);
        window.sessionStorage.removeItem('tp_sess_token_' + sessionId);
      } catch (e) {}
    }
    setSessionState('idle');
    setSessionId(null);
    setSessionExpiresAt(null);
    setWorkspaceStep(2);
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
      try {
        window.sessionStorage.removeItem('tp_sess_expires_' + sessionId);
        window.sessionStorage.removeItem('tp_sess_token_' + sessionId);
      } catch (e) {}
    }
    setSessionState('expired');
    setIsProcessingModalOpen(false);
    toast.info('Session timer expired. The temporary link has been destroyed.');
  }, [sessionState, sessionId, activeJobId, toast]);

  // Strict Countdown Timer: counts down from link creation and permanently destroys session
  useEffect(() => {
    if (sessionState !== 'active' || !sessionId || !sessionExpiresAt) return;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000));
      setIdleRemaining(remaining);
      if (remaining <= 0) {
        handleSessionExpired();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sessionState, sessionId, sessionExpiresAt, handleSessionExpired]);

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
        {/* Local Host Diagnostics & Service Status Banner */}
        {localHealth.checked && !localHealth.serviceOnline && (
          <div
            className="local-health-alert local-health-offline"
            role="alert"
            style={{
              margin: '0 auto 1.5rem auto',
              maxWidth: '1100px',
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <strong style={{ color: '#fff', fontSize: '0.95rem' }}>Local processing service is unavailable.</strong>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#fca5a5' }}>
                  The local backend service is not running on 127.0.0.1:3001. Please run <code>npm start</code> or <code>start.bat</code> in your project directory.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={checkLocalHealth}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', flexShrink: 0 }}
            >
              Retry Connection
            </button>
          </div>
        )}

        {localHealth.checked && localHealth.serviceOnline && !localHealth.ffmpegAvailable && (
          <div
            className="local-health-alert local-health-ffmpeg-warning"
            role="alert"
            style={{
              margin: '0 auto 1.5rem auto',
              maxWidth: '1100px',
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: '#fde68a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <strong style={{ color: '#fff', fontSize: '0.95rem' }}>FFmpeg is not installed or cannot be found.</strong>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#fde68a' }}>
                  FFmpeg must be installed and available in your system PATH to cut and export video clips locally. Please install FFmpeg (e.g. <code>winget install Gyan.FFmpeg</code>) and restart the application.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={checkLocalHealth}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', flexShrink: 0 }}
            >
              Re-check FFmpeg
            </button>
          </div>
        )}

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

              {/* 3-Step Workflow Stepper Bar */}
              <div
                className="workspace-stepper-bar"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1.25rem',
                  background: 'rgba(255, 255, 255, 0.025)',
                  borderBottom: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Step 1 badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#34d399', fontSize: '0.82rem', fontWeight: 600 }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(52, 211, 153, 0.2)', border: '1px solid #34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>✓</span>
                    <span>1. Enter Video Link</span>
                  </div>

                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>&rarr;</span>

                  {/* Step 2 button/badge */}
                  <button
                    type="button"
                    onClick={() => setWorkspaceStep(2)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      color: workspaceStep === 2 ? '#ffffff' : (workspaceStep === 3 ? '#34d399' : 'var(--text-muted)'),
                      fontSize: '0.84rem',
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: workspaceStep === 2 ? 'var(--accent-primary)' : (workspaceStep === 3 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(255, 255, 255, 0.1)'),
                        color: workspaceStep === 2 ? '#ffffff' : (workspaceStep === 3 ? '#34d399' : 'var(--text-muted)'),
                        border: workspaceStep === 3 ? '1px solid #34d399' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                      }}
                    >
                      {workspaceStep === 3 ? '✓' : '2'}
                    </span>
                    <span>2. Choose Desired Timestamps {workspaceStep === 2 ? '(Active)' : ''}</span>
                  </button>

                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>&rarr;</span>

                  {/* Step 3 button/badge */}
                  <button
                    type="button"
                    onClick={() => {
                      if (validation.valid) setWorkspaceStep(3);
                    }}
                    disabled={!validation.valid}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: validation.valid ? 'pointer' : 'not-allowed',
                      padding: '0.2rem 0.4rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      color: workspaceStep === 3 ? '#ffffff' : (validation.valid ? 'var(--text-secondary)' : 'var(--text-muted)'),
                      fontSize: '0.84rem',
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: workspaceStep === 3 ? 'var(--accent-emerald)' : 'rgba(255, 255, 255, 0.08)',
                        color: workspaceStep === 3 ? '#ffffff' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                      }}
                    >
                      3
                    </span>
                    <span>3. Quality &amp; Download {workspaceStep === 3 ? '(Active)' : ''}</span>
                  </button>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {workspaceStep === 2 ? 'Select timestamps & click Next' : 'Choose resolution to download clip'}
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

                {/* Controls Column: Stepped Workflow (Step 2 vs Step 3) */}
                <div className="editor-controls-column">
                  {workspaceStep === 2 ? (
                    /* STEP 2: USER ONLY CHOOSES DESIRED TIMESTAMPS (NO DOWNLOAD BUTTON HERE) */
                    <>
                      <div style={{ marginBottom: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Step 2: Choose Timestamp Range
                        </span>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                          Select clip start &amp; end
                        </span>
                      </div>

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
                        currentTime={currentTime}
                        isPlaying={isPlaying}
                        isPreviewingClip={isPreviewingClip}
                        isClipFinished={isClipFinished}
                        onPreviewClip={handlePreviewClip}
                        onPauseClip={handlePauseClip}
                        onReplayClip={handleReplayClip}
                        onProceedToQuality={() => setWorkspaceStep(3)}
                        onShareClick={() => setIsShareOpen(true)}
                        onReset={handleReset}
                        isValidRange={validation.valid}
                      />
                    </>
                  ) : (
                    /* STEP 3: QUALITY OPTIONS & DOWNLOAD OF SELECTED TIMESTAMP ONLY */
                    <QualityDownloadStep
                      startTime={startTime}
                      endTime={endTime}
                      duration={videoDuration}
                      selectedQuality={selectedQuality}
                      availableQualities={availableQualities}
                      onChangeQuality={setSelectedQuality}
                      isLoadingQualities={isLoadingQualities}
                      qualityError={qualityError}
                      onRetryQualities={handleRetryQualities}
                      onDownloadClip={handleCreateClip}
                      onDownloadAudio={() => {
                        setSelectedQuality('mp3');
                        setTimeout(() => handleCreateClip(), 50);
                      }}
                      onBackToTimestamps={() => setWorkspaceStep(2)}
                      onShareClick={() => setIsShareOpen(true)}
                      onReset={handleReset}
                    />
                  )}
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
            {workspaceStep === 2 ? (
              <>
                <button
                  type="button"
                  className="btn-primary sticky-btn-main"
                  onClick={() => setWorkspaceStep(3)}
                  disabled={!validation.valid}
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
                >
                  <span>Next: Choose Quality &rarr;</span>
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
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary sticky-btn-main"
                  onClick={handleCreateClip}
                  disabled={!validation.valid}
                  style={{
                    background: selectedQuality === 'mp3'
                      ? 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>
                    Download Clip ({selectedQuality === 'mp3' ? 'MP3' : (selectedQuality === 'best' ? 'Best' : `${selectedQuality}p`)})
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-secondary sticky-btn-preview"
                  onClick={() => setWorkspaceStep(2)}
                  title="Return to Step 2 to adjust timestamps"
                  style={{ padding: '0 0.85rem', fontSize: '0.8rem' }}
                >
                  <span>&larr; Times</span>
                </button>
              </>
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
