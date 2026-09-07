import React, { useRef, useEffect } from 'react';

export default function LocalVideoPlayer({
  mediaSrc,
  startTime,
  endTime,
  isPreviewingClip,
  previewSignal,
  pauseSignal,
  seekSignal,
  onLoadedMetadata,
  onTimeUpdate,
  onStateChange,
  onClipFinished,
}) {
  const videoRef = useRef(null);

  // Handle preview signal
  useEffect(() => {
    if (!previewSignal || !videoRef.current) return;
    const video = videoRef.current;
    video.currentTime = startTime;
    video.play().catch((err) => console.warn('Local video play failed:', err));
  }, [previewSignal, startTime]);

  // Handle pause signal
  useEffect(() => {
    if (!pauseSignal || !videoRef.current) return;
    videoRef.current.pause();
  }, [pauseSignal]);

  // Handle explicit seek
  useEffect(() => {
    if (!seekSignal || !videoRef.current) return;
    videoRef.current.currentTime = seekSignal.time;
  }, [seekSignal]);

  const handleTimeUpdateInternal = () => {
    const video = videoRef.current;
    if (!video) return;

    const current = video.currentTime;
    if (onTimeUpdate) onTimeUpdate(current);

    // Boundary check during preview
    if (isPreviewingClip && current >= endTime) {
      video.pause();
      video.currentTime = startTime;
      if (onClipFinished) onClipFinished();
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const duration = Math.floor(video.duration || 0);
    if (onLoadedMetadata) {
      onLoadedMetadata(duration);
    }
  };

  return (
    <div className="player-stage" aria-label="Authorized Video Player">
      <video
        ref={videoRef}
        src={mediaSrc}
        controls
        playsInline
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdateInternal}
        onPlay={() => onStateChange && onStateChange(1)}
        onPause={() => onStateChange && onStateChange(2)}
        onEnded={() => onClipFinished && onClipFinished()}
        style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000000' }}
      />
    </div>
  );
}
