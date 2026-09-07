import React from 'react';
import { Link } from '../router/Router';

export function Footer({ onOpenLibrary, onOpenMetrics, onOpenChannelScraper }) {
  return (
    <footer className="brand-footer">
      <div className="footer-container">
        <div className="footer-grid">
          {/* Brand Col */}
          <div className="footer-brand-col">
            <Link href="/" className="footer-brand-logo">
              <svg viewBox="0 0 32 32" width="24" height="24" fill="none">
                <path d="M7 9h3v2H9v10h1v2H7V9z" fill="url(#foot-grad)" />
                <path d="M25 9h-3v2h1v10h-1v2h3V9z" fill="url(#foot-grad)" />
                <path d="M14 11.5l6 4.5-6 4.5v-9z" fill="#ffffff" />
                <defs>
                  <linearGradient id="foot-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="footer-brand-name">TrimPoint</span>
            </Link>
            <p className="footer-brand-desc">
              Precision online video clipping platform. Select exact start and end timestamps, choose high-definition quality, and extract clips in seconds.
            </p>
            <div className="footer-trust-badge">
              <span className="trust-dot"></span>
              <span>Ephemeral Processing &bull; 0% Quality Loss</span>
            </div>
          </div>

          {/* Col 1: Tools */}
          <div className="footer-links-col">
            <div className="footer-col-title">Clipping Tools</div>
            <ul className="footer-links-list">
              <li><Link href="/video-clipper">Online Video Clipper</Link></li>
              <li><Link href="/video-cutter">Video Cutter Online</Link></li>
              <li><Link href="/video-trimmer">Video Trimmer</Link></li>
              <li><Link href="/timestamp-video-cutter">Timestamp Video Cutter</Link></li>
              <li><Link href="/youtube-video-clipper">YouTube Video Clipper</Link></li>
              <li><Link href="/youtube-timestamp-clip">YouTube Timestamp Clip</Link></li>
            </ul>
          </div>

          {/* Col 2: Use Cases */}
          <div className="footer-links-col">
            <div className="footer-col-title">Use Cases</div>
            <ul className="footer-links-list">
              <li><Link href="/for-creators">For Content Creators</Link></li>
              <li><Link href="/for-social-media">For Social Media</Link></li>
              <li><Link href="/for-students">For Students &amp; Study</Link></li>
              <li><Link href="/for-teachers">For Classrooms</Link></li>
              <li>
                <button
                  type="button"
                  onClick={onOpenChannelScraper}
                  className="footer-btn-link"
                >
                  Channel Batch Tool
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Resources & Telemetry */}
          <div className="footer-links-col">
            <div className="footer-col-title">Resources</div>
            <ul className="footer-links-list">
              <li><Link href="/how-it-works">How It Works</Link></li>
              <li><Link href="/about">About TrimPoint</Link></li>
              <li>
                <button
                  type="button"
                  onClick={onOpenLibrary}
                  className="footer-btn-link"
                >
                  Local Clip Library
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={onOpenMetrics}
                  className="footer-btn-link"
                >
                  Engine Telemetry
                </button>
              </li>
            </ul>
          </div>

          {/* Col 4: Legal */}
          <div className="footer-links-col">
            <div className="footer-col-title">Legal &amp; Trust</div>
            <ul className="footer-links-list">
              <li><Link href="/privacy">Privacy Policy</Link></li>
              <li><Link href="/terms">Terms of Service</Link></li>
              <li><Link href="/contact">Contact Support</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom-bar">
          <p className="footer-disclaimer-text">
            Notice: TrimPoint is an independent media clipping tool. Users are strictly responsible for ensuring they possess the necessary rights, authorization, or fair use permissions to process and download any online media streams in full compliance with relevant copyright laws.
          </p>
          <div className="footer-copyright-row">
            <span>&copy; {new Date().getFullYear()} TrimPoint. All rights reserved.</span>
            <span>Fast, precision timestamp clipping software.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
