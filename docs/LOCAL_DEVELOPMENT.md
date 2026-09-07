# Local Development & Simulation Guide

This guide describes how to run and test the distributed YouTube Timestamp Clipper locally.

---

## 1. Quick Prerequisites

- **Node.js**: v18+ (tested on Node v24)
- **Python**: 3.10+ (tested on Python 3.13)
- **FFmpeg**: Automatically detected from `node_modules/ffmpeg-static/ffmpeg.exe` on Windows or your system PATH.

---

## 2. Environment Setup

Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

For rapid local testing of the UI without setting up Redis or Postgres right away:
- The UI will safely analyze videos via YouTube's public oEmbed API.
- The player will preview videos with start and end markers.

For full end-to-end local queue processing:
1. Provide your Neon PostgreSQL connection string in `DATABASE_URL`.
2. Provide your Upstash Redis credentials in `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_URL`.
3. Provide your Cloudflare R2 credentials in `R2_*`.

---

## 3. Database Migration

Run the migration script to apply the schema to your PostgreSQL database:
```bash
python scripts/init_db.py
```
This executes `migrations/001_initial_schema.sql` and sets up `clip_jobs` along with indexes for fast polling and expiration querying.

---

## 4. Running the Applications

### Terminal 1: Next.js Frontend & API (Vercel Simulation)
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Terminal 2: Render Background Worker
```bash
python worker/worker.py
```
Or with npm:
```bash
npm run worker
```

The worker connects to your Redis queue, claims jobs atomically in PostgreSQL, extracts the media section with `yt-dlp`, accurately cuts it with FFmpeg, uploads to Cloudflare R2, and sets an expiration timestamp.

---

## 5. Automated Pipeline Tests

Run the full automated test suite anytime:
```bash
python scripts/test_pipeline.py
```
This verifies:
- YouTube domain validation & 11-char ID extraction.
- Timestamp parsing (`HH:MM:SS`, `MM:SS`, seconds) and duration calculations.
- Error taxonomy classification.
- Frame-accurate FFmpeg cutting with synthetic media.
- Temporary directory cleanup.
