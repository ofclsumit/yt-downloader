import React from 'react';
import { Link } from '../router/Router';

export function LegalPage({ pageType }) {
  if (pageType === 'privacy') {
    return (
      <div className="legal-page-container">
        <div className="legal-breadcrumb">
          <Link href="/">Home</Link> &rsaquo; <span>Privacy Policy</span>
        </div>
        <h1 className="legal-page-h1">Privacy Policy</h1>
        <p className="legal-page-meta">Last Updated: September 2026</p>

        <div className="legal-content-card">
          <h2>1. Overview</h2>
          <p>
            TrimPoint (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the service&rdquo;) is engineered with a strict privacy-first architecture. We provide media slicing utilities that operate ephemerally without tracking users across the internet or selling personal data.
          </p>

          <h2>2. Ephemeral Media Retention</h2>
          <p>
            We do not maintain permanent video archives. When a video segment or clip is processed on our servers:
          </p>
          <ul>
            <li>Temporary raw streams are deleted immediately after multiplexing.</li>
            <li>Finished clipped files are scheduled for deletion 60 seconds after download delivery.</li>
            <li>Any uncollected temporary media is automatically purged within 20 minutes by an automated background garbage collector daemon.</li>
          </ul>

          <h2>3. Data Collection &amp; Cookies</h2>
          <p>
            We do not require user accounts, passwords, or personal identity information. We do not use third-party behavioral advertising trackers. Basic aggregated diagnostic metrics (e.g. total completed jobs, average extraction latency) are collected solely to maintain service stability and server health.
          </p>

          <h2>4. Content Security</h2>
          <p>
            All communications with TrimPoint are encrypted via HTTPS with TLS 1.3 encryption. Your processing links and generated media tokens are private and not indexed in public directories.
          </p>
        </div>
      </div>
    );
  }

  if (pageType === 'terms') {
    return (
      <div className="legal-page-container">
        <div className="legal-breadcrumb">
          <Link href="/">Home</Link> &rsaquo; <span>Terms of Service</span>
        </div>
        <h1 className="legal-page-h1">Terms of Service</h1>
        <p className="legal-page-meta">Last Updated: September 2026</p>

        <div className="legal-content-card">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and utilizing TrimPoint, you agree to comply with and be bound by these Terms of Service. If you do not agree with these terms, you must discontinue use of the service.
          </p>

          <h2>2. Permitted Use &amp; Intellectual Property</h2>
          <p>
            TrimPoint is provided as a technical utility for precision media clipping. Users are strictly and solely responsible for ensuring they have lawful rights, licenses, or fair use permissions to process and download any content submitted to the service.
          </p>
          <ul>
            <li>You agree not to use TrimPoint to infringe upon any third party&rsquo;s copyright, trademark, or intellectual property rights.</li>
            <li>You agree not to attempt to circumvent technological protection measures or digital rights management (DRM) mechanisms.</li>
            <li>You agree not to use automated bots to flood the server or perform denial-of-service attacks.</li>
          </ul>

          <h2>3. Disclaimer of Warranties</h2>
          <p>
            TrimPoint is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of any kind. We do not guarantee that third-party video platforms will remain perpetually accessible or that stream availability will never be interrupted.
          </p>

          <h2>4. Limitation of Liability</h2>
          <p>
            In no event shall TrimPoint or its operators be liable for any direct, indirect, incidental, or consequential damages arising out of the use or inability to use the service.
          </p>
        </div>
      </div>
    );
  }

  if (pageType === 'about') {
    return (
      <div className="legal-page-container">
        <div className="legal-breadcrumb">
          <Link href="/">Home</Link> &rsaquo; <span>About Us</span>
        </div>
        <h1 className="legal-page-h1">About TrimPoint</h1>
        <p className="legal-page-meta">Precision video clipping engineered for the modern web</p>

        <div className="legal-content-card">
          <h2>Our Mission</h2>
          <p>
            Every day, millions of creators, students, teachers, and researchers need just a 15-second snippet or a 2-minute explanation from a multi-hour online video. Previously, your only options were downloading an entire 4GB file, loading heavy desktop video editors, or using clunky, ad-saturated downloader sites.
          </p>
          <p>
            We built <strong>TrimPoint</strong> to be different: a clean, high-precision SaaS platform that extracts the exact segment you need directly on the cloud in under 10 seconds.
          </p>

          <h2>Core Engineering Principles</h2>
          <ul>
            <li><strong>Sub-Second Stream Copy:</strong> Where possible, we copy raw bitstreams directly rather than re-encoding, preserving 100% of original visual fidelity with zero generational loss.</li>
            <li><strong>No Fake Resolutions:</strong> We inspect real video manifests and present authentic resolutions (up to 4K) without upscaling or marketing tricks.</li>
            <li><strong>Privacy by Default:</strong> Ephemeral servers delete all generated files within minutes.</li>
          </ul>
        </div>
      </div>
    );
  }

  if (pageType === 'contact') {
    return (
      <div className="legal-page-container">
        <div className="legal-breadcrumb">
          <Link href="/">Home</Link> &rsaquo; <span>Contact Support</span>
        </div>
        <h1 className="legal-page-h1">Contact TrimPoint Support</h1>
        <p className="legal-page-meta">Have a question, feedback, or need technical assistance?</p>

        <div className="legal-content-card">
          <p>
            We appreciate your feedback and bug reports as we continually optimize TrimPoint for speed and precision.
          </p>

          <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-input)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>General Support &amp; Feedback</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                Email our support team directly at: <a href="mailto:support@trimpoint.app" style={{ color: '#818cf8', fontWeight: 600 }}>support@trimpoint.app</a>
              </p>
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>Copyright &amp; DMCA Inquiries</h3>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                For intellectual property inquiries or notice of claimed infringement, please contact: <a href="mailto:legal@trimpoint.app" style={{ color: '#818cf8', fontWeight: 600 }}>legal@trimpoint.app</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
