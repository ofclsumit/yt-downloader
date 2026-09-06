import React from 'react';

export default function HeroSection({ customTitle, customSubtitle }) {
  return (
    <section className="hero-section" aria-label="Product Introduction">
      <div className="hero-pill">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>Precision Timestamp Video Clipper</span>
      </div>
      <h1 className="hero-title">
        {customTitle || 'Create the exact video clip you need.'}
      </h1>
      <p className="hero-subtitle">
        {customSubtitle ||
          'Choose a video, set the exact start and end time, select your preferred quality, and create a clip in seconds.'}
      </p>
      <div className="hero-workflow-hints">
        <span>Choose timestamps</span>
        <span className="hint-sep">&bull;</span>
        <span>Preview selection</span>
        <span className="hint-sep">&bull;</span>
        <span>Create your clip</span>
      </div>
    </section>
  );
}
