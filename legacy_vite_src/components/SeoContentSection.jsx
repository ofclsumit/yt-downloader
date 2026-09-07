import React, { useState } from 'react';
import { Link } from '../router/Router';

export function SeoContentSection({ pageData }) {
  const [openFaq, setOpenFaq] = useState(null);

  if (!pageData) return null;

  const {
    h1,
    tagline,
    badge,
    intro,
    workflowTitle = 'Supported 4-Step Clipping Workflow',
    features = [],
    faqs = [],
    relatedTools = [],
  } = pageData;

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx);
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const input = document.getElementById('youtube-url-input');
    if (input) input.focus();
  };

  // Generate Schema.org FAQPage structured data JSON
  const faqSchema = faqs && faqs.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faqs.map((f) => ({
      '@type': 'Question',
      'name': f.q,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': f.a,
      },
    })),
  } : null;

  return (
    <section className="seo-content-wrapper" aria-label="Tool Information and Guide">
      {/* Schema.org FAQPage structured data injection */}
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Intro Header */}
      <div className="seo-intro-header">
        {badge && <span className="seo-badge">{badge}</span>}
        <h2 className="seo-main-h2">{h1}</h2>
        {tagline && <p className="seo-tagline">{tagline}</p>}
        {intro && <p className="seo-intro-text">{intro}</p>}
      </div>

      {/* 4-Step Workflow Walkthrough */}
      <div className="seo-workflow-card">
        <h3 className="seo-section-title">{workflowTitle}</h3>
        <div className="workflow-steps-grid">
          <div className="workflow-step-item">
            <div className="step-number-pill">01</div>
            <h4 className="step-title">Paste Video URL</h4>
            <p className="step-desc">Paste your online video link or upload a file. TrimPoint instantly extracts real stream formats.</p>
          </div>

          <div className="workflow-step-item">
            <div className="step-number-pill">02</div>
            <h4 className="step-title">Set Timestamps</h4>
            <p className="step-desc">Specify exact start and end timecodes using precise numerical steppers or dual timeline scrubbers.</p>
          </div>

          <div className="workflow-step-item">
            <div className="step-number-pill">03</div>
            <h4 className="step-title">Select Quality</h4>
            <p className="step-desc">Choose real resolutions (4K, 1080p, 720p, etc.) or export pure MP3 audio from the selected range.</p>
          </div>

          <div className="workflow-step-item">
            <div className="step-number-pill">04</div>
            <h4 className="step-title">Instant Export</h4>
            <p className="step-desc">Sub-second stream copy cuts the exact segment directly without lossy re-encoding delays.</p>
          </div>
        </div>
      </div>

      {/* Key Architectural Features Grid */}
      {features.length > 0 && (
        <div className="seo-features-section">
          <h3 className="seo-section-title">Why Choose TrimPoint</h3>
          <div className="seo-features-grid">
            {features.map((feat, idx) => (
              <div key={idx} className="seo-feature-card">
                <div className="feature-icon-bullet">&bull;</div>
                <h4 className="feature-card-title">{feat.title}</h4>
                <p className="feature-card-desc">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive FAQs */}
      {faqs.length > 0 && (
        <div className="seo-faq-section">
          <h3 className="seo-section-title">Frequently Asked Questions</h3>
          <div className="faq-accordion-list">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className={`faq-accordion-item ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="faq-question-btn"
                    onClick={() => toggleFaq(idx)}
                    aria-expanded={isOpen}
                  >
                    <span>{faq.q}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="faq-answer-body">
                      <p>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Related Tools Navigation */}
      {relatedTools.length > 0 && (
        <div className="seo-related-tools-row">
          <span className="related-label">Related Tools:</span>
          <div className="related-chips-list">
            {relatedTools.map((toolPath) => {
              const label = toolPath.replace('/', '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <Link key={toolPath} href={toolPath} className="related-tool-chip">
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom Sticky Action CTA */}
      <div className="seo-bottom-cta-banner">
        <div className="cta-banner-text">
          <h3>Create the exact video clip you need</h3>
          <p>Zero software installation. Frame-accurate timestamps. Fast cloud processing.</p>
        </div>
        <button type="button" className="btn-primary" onClick={handleScrollToTop}>
          <span>Start Clipping Now</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        </button>
      </div>
    </section>
  );
}
