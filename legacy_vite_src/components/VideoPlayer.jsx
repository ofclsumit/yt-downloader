import React, { useEffect, useRef, useState, useCallback } from 'react';
import { extractYouTubeVideoId } from '../utils/youtube';

// Global promise to load YouTube Iframe API only once
let ytApiPromise = null;
function loadYouTubeIframeApi() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));

  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }

  if (!ytApiPromise) {
    ytApiPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API. Check network connection.'));
        document.head.appendChild(tag);
      }

      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        resolve(window.YT);
      };

      // Fallback check in case script was already loaded
      const checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve(window.YT);
        }
      }, 100);

      // Timeout after 12s
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.YT || !window.YT.Player) {
          reject(new Error('YouTube player initialization timed out.'));
        }
      }, 12000);
    });
  }

  return ytApiPromise;
}

export default function VideoPlayer({
  videoId,
  startTime,
  endTime,
  isPreviewingClip,
  previewSignal, // increments when user clicks "Preview" or "Replay"
  pauseSignal,   // increments when user clicks "Pause"
  seekSignal,    // object { time, id } when user explicitly seeks on timeline
  onPlayerReady,
  onTimeUpdate,
  onStateChange,
  onClipFinished,
  onError,
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const timerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);

  // Store latest props in refs to avoid stale closures inside player event handlers
  const stateRef = useRef({
    startTime,
    endTime,
    isPreviewingClip,
    isReady,
  });

  useEffect(() => {
    stateRef.current = {
      startTime,
      endTime,
      isPreviewingClip,
      isReady,
    };
  }, [startTime, endTime, isPreviewingClip, isReady]);

  // Clean up interval on unmount
  const stopMonitoring = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Time monitor loop
  const startMonitoring = useCallback(() => {
    stopMonitoring();
    timerRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;

      try {
        const currentTime = player.getCurrentTime();
        if (typeof currentTime === 'number' && !isNaN(currentTime)) {
          if (onTimeUpdate) onTimeUpdate(currentTime);

          // If in preview mode, enforce end boundary
          if (stateRef.current.isPreviewingClip) {
            const endBoundary = stateRef.current.endTime;
            const startBoundary = stateRef.current.startTime;

            if (currentTime >= endBoundary) {
              player.pauseVideo();
              player.seekTo(startBoundary, true);
              stopMonitoring();
              if (onClipFinished) onClipFinished();
            }
          }
        }
      } catch (err) {
        // Player might be destroying or buffering
      }
    }, 80);
  }, [stopMonitoring, onTimeUpdate, onClipFinished]);

  // Initialize YT.Player
  useEffect(() => {
    let isCancelled = false;
    let playerInstance = null;

    loadYouTubeIframeApi()
      .then((YT) => {
        if (isCancelled || !containerRef.current) return;

        // Clear any previous iframe children
        containerRef.current.innerHTML = '';
        const mountDiv = document.createElement('div');
        mountDiv.id = `yt-player-${Math.random().toString(36).substring(2, 9)}`;
        containerRef.current.appendChild(mountDiv);

        // Ensure clean 11-char video ID for YouTube Iframe API
        const cleanVideoId = (typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId.trim()))
          ? videoId.trim()
          : (extractYouTubeVideoId(videoId)?.videoId || videoId);

        playerInstance = new YT.Player(mountDiv.id, {
          videoId: cleanVideoId,
          playerVars: {
            start: Math.floor(Math.max(0, startTime)),
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
            enablejsapi: 1,
          },
          events: {
            onReady: (event) => {
              if (isCancelled) return;
              playerRef.current = event.target;
              setIsReady(true);

              let duration = 0;
              try {
                duration = Math.floor(event.target.getDuration() || 0);
              } catch (e) {}

              let videoData = null;
              try {
                videoData = event.target.getVideoData();
              } catch (e) {}

              if (onPlayerReady) {
                onPlayerReady(event.target, duration, videoData);
              }
            },
            onStateChange: (event) => {
              if (isCancelled) return;
              const state = event.data;
              if (onStateChange) onStateChange(state);

              // YT.PlayerState: 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
              if (state === 1) {
                startMonitoring();
              } else {
                stopMonitoring();
                if (state === 0 && stateRef.current.isPreviewingClip) {
                  // Video ended naturally before end timestamp
                  if (onClipFinished) onClipFinished();
                }
              }
            },
            onError: (event) => {
              if (isCancelled) return;
              let msg = 'Unable to load the video. Please check your connection and try again.';
              if (event.data === 2) {
                msg = 'Invalid YouTube video ID or parameter.';
              } else if (event.data === 5) {
                msg = 'HTML5 player error. The video cannot be played in this browser.';
              } else if (event.data === 100) {
                msg = 'This video is unavailable or has been removed.';
              } else if (event.data === 101 || event.data === 150) {
                msg = 'This video cannot be embedded by the owner. Please try another video.';
              }
              if (onError) onError(msg);
            },
          },
        });
      })
      .catch((err) => {
        if (!isCancelled && onError) {
          onError(err.message || 'Unable to connect to YouTube player.');
        }
      });

    return () => {
      isCancelled = true;
      stopMonitoring();
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch (e) {}
      }
      playerRef.current = null;
      setIsReady(false);
    };
  }, [videoId]); // Re-initialize player if videoId changes

  // Handle Preview trigger (play from start time)
  useEffect(() => {
    if (!previewSignal || !playerRef.current || !isReady) return;
    try {
      playerRef.current.seekTo(startTime, true);
      playerRef.current.playVideo();
      startMonitoring();
    } catch (err) {
      console.warn('Error starting clip preview:', err);
    }
  }, [previewSignal, startTime, isReady, startMonitoring]);

  // Handle Pause trigger
  useEffect(() => {
    if (!pauseSignal || !playerRef.current || !isReady) return;
    try {
      playerRef.current.pauseVideo();
      stopMonitoring();
    } catch (err) {
      console.warn('Error pausing player:', err);
    }
  }, [pauseSignal, isReady, stopMonitoring]);

  // Handle explicit Seek from timeline scrubber
  useEffect(() => {
    if (!seekSignal || !playerRef.current || !isReady) return;
    try {
      playerRef.current.seekTo(seekSignal.time, true);
    } catch (err) {
      console.warn('Error seeking player:', err);
    }
  }, [seekSignal, isReady]);

  return (
    <div className="player-stage" aria-label="YouTube Video Player">
      <div className="player-iframe-container" ref={containerRef} />
    </div>
  );
}
