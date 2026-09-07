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
   - `YTDLP_PROXY`: (Recommended) Proxy URL (e.g., `http://username-rotate:password@p.webshare.io:80`) to eliminate datacenter IP blocking and bypass YouTube bot checks with sticky session auto-rotation.
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

---

## 7. Configuring YTDLP_COOKIES for Datacenter IP Bot Bypass

### Why Cookies are Required on Cloud Providers
Cloud hosting providers (Render, AWS, GCP, DigitalOcean) use datacenter IP ranges. YouTube enforces automated scraping countermeasures against unauthenticated requests originating from datacenter subnets, returning:
`Sign in to confirm you're not a bot` (`BOT_DETECTION`).

Configuring `YTDLP_COOKIES` provides `yt-dlp` with authenticated session credentials, allowing downloads to process seamlessly without challenges.

> [!WARNING]
> **Security Notice**: YouTube cookies contain active authentication session material.
> - Never commit cookies or `cookies.txt` to Git.
> - Never paste cookies into public chat, logs, or repositories.
> - Always use a dedicated/secondary Google account rather than your primary personal account for automated extraction.

---

### How to Export YouTube Cookies (60 Seconds)

1. Open your browser (Chrome, Brave, Edge, or Firefox) signed in to your YouTube/Google account.
2. Install the open-source extension **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)** (or export via browser DevTools).
3. Navigate to `https://www.youtube.com`.
4. Click the extension icon and click **Export** to save `cookies.txt`.

---

### How to Format & Set `YTDLP_COOKIES` in Render

#### Option A: Base64 Format (Recommended — Avoids Newline Escaping Issues)
Encode the exported `cookies.txt` into a single Base64 string:

- **Linux / macOS**:
  ```bash
  base64 -w 0 cookies.txt
  ```
- **Windows (PowerShell)**:
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("cookies.txt")) | Set-Clipboard
  ```

#### Option B: Raw Multiline Format
Copy the entire text from `cookies.txt` (starting with `# Netscape HTTP Cookie File`).

---

### Setting `YTDLP_COOKIES` in Render Dashboard

1. Navigate to your Render Web Service / Worker:
   `https://dashboard.render.com/web/srv-daef9emq1p3s7393ofr0`
2. Click **Environment** in the left sidebar.
3. Click **Add Environment Variable**:
   - **Key**: `YTDLP_COOKIES`
   - **Value**: Paste your Base64 string or raw Netscape cookie content.
4. Click **Save Changes**. Render will automatically redeploy the worker.

---

### How to Verify the Worker Sees Cookies (Zero Secret Leakage)

Inspect the deployment logs in the Render console. Look for the startup diagnostic line:
```
[INFO] worker: YouTube Cookies Configured: YES (Loaded from YTDLP_COOKIES)
```
- **Zero Exposure Guarantee**: The worker **never** logs cookie contents, secret tokens, or file paths.
- If the variable is unset or removed, the log will display:
  ```
  [INFO] worker: YouTube Cookies Configured: NO (Unauthenticated)
  ```

---

### How to Update or Rotate Cookies

When your session cookies eventually expire (usually after 6–12 months of inactivity, or if you sign out):
1. Export fresh cookies from `https://www.youtube.com`.
2. Convert to Base64 (or copy text).
3. Go to Render **Environment** > Edit `YTDLP_COOKIES` > paste new value > **Save Changes**.

---

### How to Remove Cookies

To run the worker in unauthenticated mode:
1. Go to Render **Environment**.
2. Click the trash icon next to `YTDLP_COOKIES`.
3. Click **Save Changes**.

---

### How `BOT_DETECTION` is Reported

If YouTube flags a request and cookies are not configured (or have expired):
1. The worker immediately halts execution without wasteful retries and marks the job `FAILED` with `error_code = "BOT_DETECTION"`.
2. The user-facing UI displays the sanitized message:
   > *"YouTube is currently blocking automated requests from the processing server. The administrator needs to configure a valid yt-dlp cookie session."*
3. Internal server secrets, cookie formats, or token errors are never shown to end users.
