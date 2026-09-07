# Production Deployment Guide: Distributed YouTube Timestamp Clipper

Follow this guide to deploy each component of the distributed architecture across Vercel, Render, Neon, Upstash, and Cloudflare.

---

## 1. Neon PostgreSQL Database Setup

1. Log in to [Neon Console](https://console.neon.tech/) and create a project (e.g. `yt-clip-engine`).
2. Copy the Connection String (URI format):
   ```
   postgres://username:password@ep-sample-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Run the migration to create the table and indexes:
   ```bash
   DATABASE_URL="your-neon-connection-string" python scripts/init_db.py
   ```
   Or run the SQL directly in Neon SQL Editor: [migrations/001_initial_schema.sql](file:///c:/Users/Offic.SUMIT/Desktop/Code/YouTube-Video-Downloader/migrations/001_initial_schema.sql).

---

## 2. Upstash Redis Queue Setup

1. Log in to [Upstash Console](https://console.upstash.com/) and create a Redis database.
2. Under the **Details** tab:
   - Copy the **REST URL** (`UPSTASH_REDIS_REST_URL`)
   - Copy the **REST Token** (`UPSTASH_REDIS_REST_TOKEN`)
   - Copy the **Redis URL** (`UPSTASH_REDIS_URL`, format: `rediss://default:...@...upstash.io:6379`)

---

## 3. Cloudflare R2 Object Storage Setup

1. In Cloudflare Dashboard, go to **R2** > **Create bucket** (e.g., `yt-clips`).
2. Go to **R2** > **Manage R2 API Tokens** > **Create API Token**:
   - Permissions: **Object Read & Write**
   - Bucket: Apply to `yt-clips`
3. Save:
   - `R2_ACCOUNT_ID` (Found on R2 Overview page)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`: `yt-clips`

---

## 4. Render Background Worker Deployment

1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com/), click **New** > **Background Worker**.
3. Select your repository.
4. Set:
   - **Name**: `yt-clip-media-worker`
   - **Runtime**: **Docker**
   - **Dockerfile Path**: `worker/Dockerfile`
   - **Instance Type**: **Standard** (1 GB RAM / 1 CPU recommended for FFmpeg)
5. Add the following Environment Variables in Render:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string
   - `UPSTASH_REDIS_URL`: Your Upstash Redis connection string
   - `UPSTASH_REDIS_REST_URL`: (Optional) Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN`: (Optional) Upstash REST Token
   - `REDIS_QUEUE_KEY`: `yt_clip_jobs`
   - `R2_ACCOUNT_ID`: Your Cloudflare Account ID
   - `R2_ACCESS_KEY_ID`: Your R2 Access Key
   - `R2_SECRET_ACCESS_KEY`: Your R2 Secret Access Key
   - `R2_BUCKET_NAME`: `yt-clips`
   - `WORKER_CONCURRENCY`: `2`
   - `MAX_CLIP_DURATION_SECONDS`: `300`
   - `CLIP_EXPIRATION_HOURS`: `1`
6. Click **Deploy**. The worker will pull jobs from Redis and process media asynchronously!

---

## 5. Vercel Frontend & API Deployment

1. In [Vercel Dashboard](https://vercel.com/), click **Add New Project** and import your repository.
2. Framework Preset: **Next.js**.
3. Add Environment Variables:
   - `NEXT_PUBLIC_APP_URL`: `https://your-domain.vercel.app`
   - `DATABASE_URL`: Your Neon PostgreSQL connection string
   - `UPSTASH_REDIS_REST_URL`: Your Upstash REST URL
   - `UPSTASH_REDIS_REST_TOKEN`: Your Upstash REST Token
   - `REDIS_QUEUE_KEY`: `yt_clip_jobs`
   - `R2_ACCOUNT_ID`: Your Cloudflare Account ID
   - `R2_ACCESS_KEY_ID`: Your R2 Access Key
   - `R2_SECRET_ACCESS_KEY`: Your R2 Secret Access Key
   - `R2_BUCKET_NAME`: `yt-clips`
   - `MAX_CLIP_DURATION_SECONDS`: `300`
4. Click **Deploy**.

---

## 6. Verification Checklist

- [ ] Check `/api/health` on your deployed Vercel domain; all services should return `connected`/`configured`.
- [ ] Paste a YouTube link in the web app and click **Analyze**.
- [ ] Select a 15-second range and click **Generate Clip**.
- [ ] Observe the Render Worker logs: verify section-aware download, FFmpeg trimming, and R2 upload.
- [ ] Click **Download MP4 Clip** in the browser: verify the download initiates directly from Cloudflare R2 without routing through Vercel.
