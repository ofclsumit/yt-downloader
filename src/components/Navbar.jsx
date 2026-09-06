import React, { useState, useEffect, useRef } from 'react';
import { Link, useRouter } from '../router/Router';

export function Navbar({ onResetTool }) {
  const { path, navigate } = useRouter();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [useCasesOpen, setUseCasesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toolsRef = useRef(null);
  const useCasesRef = useRef(null);

  // Close dropdowns on outside click or Esc
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setToolsOpen(false);
        setUseCasesOpen(false);
        setMobileMenuOpen(false);
      }
    };
    const handleClickOutside = (e) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) {
        setToolsOpen(false);
      }
      if (useCasesRef.current && !useCasesRef.current.contains(e.target)) {
        setUseCasesOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleStartClip = () => {
    setMobileMenuOpen(false);
    if (path !== '/') {
      navigate('/');
    } else if (onResetTool) {
      onResetTool();
    }
  };

  return (
    <header className="brand-navbar">
      <div className="navbar-container">
        {/* Brand Logo & Wordmark */}
        <Link href="/" className="brand-logo-link" title="TrimPoint Homepage">
          <div className="brand-logo-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
              <path d="M7 9h3v2H9v10h1v2H7V9z" fill="url(#nav-grad)" />
              <path d="M25 9h-3v2h1v10h-1v2h3V9z" fill="url(#nav-grad)" />
              <path d="M14 11.5l6 4.5-6 4.5v-9z" fill="#ffffff" />
              <defs>
                <linearGradient id="nav-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className="brand-wordmark">TrimPoint</span>
          <span className="brand-tag-badge">PRECISION</span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="navbar-desktop-links" aria-label="Main Navigation">
          {/* Tools Dropdown */}
          <div className="nav-dropdown-wrapper" ref={toolsRef}>
            <button
              type="button"
              className={`nav-link-btn ${toolsOpen ? 'active' : ''}`}
              onClick={() => {
                setToolsOpen(!toolsOpen);
                setUseCasesOpen(false);
              }}
              aria-expanded={toolsOpen}
              aria-haspopup="true"
            >
              <span>Tools</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {toolsOpen && (
              <div className="nav-dropdown-menu" role="menu">
                <Link href="/video-clipper" className="dropdown-menu-item" onClick={() => setToolsOpen(false)}>
                  <span className="dropdown-item-title">Video Clipper</span>
                  <span className="dropdown-item-desc">Create custom clips with exact timestamps</span>
                </Link>
                <Link href="/video-cutter" className="dropdown-menu-item" onClick={() => setToolsOpen(false)}>
                  <span className="dropdown-item-title">Video Cutter</span>
                  <span className="dropdown-item-desc">Cut online videos by time without re-encoding</span>
                </Link>
                <Link href="/video-trimmer" className="dropdown-menu-item" onClick={() => setToolsOpen(false)}>
                  <span className="dropdown-item-title">Video Trimmer</span>
                  <span className="dropdown-item-desc">Trim intros, outros, and sponsor segments</span>
                </Link>
                <Link href="/timestamp-video-cutter" className="dropdown-menu-item" onClick={() => setToolsOpen(false)}>
                  <span className="dropdown-item-title">Timestamp Video Cutter</span>
                  <span className="dropdown-item-desc">Input precise HH:MM:SS timecodes</span>
                </Link>
                <Link href="/youtube-video-clipper" className="dropdown-menu-item" onClick={() => setToolsOpen(false)}>
                  <span className="dropdown-item-title">YouTube Clipper</span>
                  <span className="dropdown-item-desc">High-speed clipping from YouTube links</span>
                </Link>
              </div>
            )}
          </div>

          {/* Use Cases Dropdown */}
          <div className="nav-dropdown-wrapper" ref={useCasesRef}>
            <button
              type="button"
              className={`nav-link-btn ${useCasesOpen ? 'active' : ''}`}
              onClick={() => {
                setUseCasesOpen(!useCasesOpen);
                setToolsOpen(false);
              }}
              aria-expanded={useCasesOpen}
              aria-haspopup="true"
            >
              <span>Use Cases</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {useCasesOpen && (
              <div className="nav-dropdown-menu" role="menu">
                <Link href="/for-creators" className="dropdown-menu-item" onClick={() => setUseCasesOpen(false)}>
                  <span className="dropdown-item-title">For Content Creators</span>
                  <span className="dropdown-item-desc">Extract B-roll &amp; reaction soundbites</span>
                </Link>
                <Link href="/for-social-media" className="dropdown-menu-item" onClick={() => setUseCasesOpen(false)}>
                  <span className="dropdown-item-title">For Social Media</span>
                  <span className="dropdown-item-desc">Bite-sized clips for Reels, TikTok &amp; X</span>
                </Link>
                <Link href="/for-students" className="dropdown-menu-item" onClick={() => setUseCasesOpen(false)}>
                  <span className="dropdown-item-title">For Students</span>
                  <span className="dropdown-item-desc">Clip lecture highlights &amp; tutorials</span>
                </Link>
                <Link href="/for-teachers" className="dropdown-menu-item" onClick={() => setUseCasesOpen(false)}>
                  <span className="dropdown-item-title">For Teachers</span>
                  <span className="dropdown-item-desc">Embed clean video snippets into classroom slides</span>
                </Link>
              </div>
            )}
          </div>

          <Link href="/how-it-works" className="nav-text-link">
            How It Works
          </Link>

          <Link href="/about" className="nav-text-link">
            About
          </Link>
        </nav>

        {/* Action Button */}
        <div className="navbar-action-area">
          <button type="button" className="btn-primary btn-navbar-cta" onClick={handleStartClip}>
            <span>Create Clip</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="navbar-mobile-drawer">
          <div className="mobile-drawer-group">
            <div className="mobile-group-title">Clipping Tools</div>
            <Link href="/video-clipper" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Video Clipper
            </Link>
            <Link href="/video-cutter" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Video Cutter
            </Link>
            <Link href="/video-trimmer" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Video Trimmer
            </Link>
            <Link href="/timestamp-video-cutter" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Timestamp Video Cutter
            </Link>
            <Link href="/youtube-video-clipper" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              YouTube Clipper
            </Link>
          </div>

          <div className="mobile-drawer-group">
            <div className="mobile-group-title">Use Cases</div>
            <Link href="/for-creators" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              For Content Creators
            </Link>
            <Link href="/for-social-media" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              For Social Media
            </Link>
            <Link href="/for-students" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              For Students &amp; Study
            </Link>
            <Link href="/for-teachers" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              For Classrooms &amp; Teachers
            </Link>
          </div>

          <div className="mobile-drawer-group">
            <div className="mobile-group-title">Company</div>
            <Link href="/how-it-works" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              How It Works
            </Link>
            <Link href="/about" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              About TrimPoint
            </Link>
            <Link href="/privacy" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Privacy Policy
            </Link>
            <Link href="/terms" className="mobile-drawer-link" onClick={() => setMobileMenuOpen(false)}>
              Terms of Service
            </Link>
          </div>

          <div style={{ paddingTop: '1rem' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleStartClip}
            >
              Start Clipping Now
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
