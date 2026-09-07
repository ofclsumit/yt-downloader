# Distributed YouTube Timestamp Clipper - System Architecture

## 1. Architectural Philosophy

This system is engineered as an asynchronous, decoupled, distributed media processing pipeline designed to eliminate single points of failure, avoid timeout ceilings, and scale efficiently.

### The Golden Rule
> **Under no circumstance does Vercel download video files, run FFmpeg, or proxy generated MP4 files.**

Serverless platforms like Vercel have execution timeouts (10–60s) and bandwidth/egress cost models that are completely ill-suited for media rendering. In contrast, Render Background Workers offer dedicated CPU, persistent container execution, full FFmpeg support, and unlimited processing time.

---

## 2. Distributed Architecture Diagram

```
                             [ User Browser ]
                               /         \
                              /           \
     1. Submit Job & Poll Status           4. Download MP4 directly via Signed URL
                            /               \
                           v                 v
                 +-------------------+     +-------------------------+
                 |   Vercel Edge     |     |   Cloudflare R2         |
                 | Next.js App Router|     |   Object Storage        |
                 +-------------------+     +-------------------------+
                    |             |                    ^
    2a. Save Record |             | 2b. Push Job ID    | 3c. Upload Final MP4
                    v             v                    |
       +------------------+    +------------------+    |
       | Neon PostgreSQL  |    |  Upstash Redis   |    |
       | Relational DB    |    |  Job Queue       |    |
       +------------------+    +------------------+    |
                    ^                     |            |
                    |                     |            |
                    |  3a. Atomic Claim   | 3a. BLPOP  |
                    |  3d. Mark Completed |            |
                    |                     v            |
                 +---------------------------------------+
                 |        Render Background Worker       |
                 |      Python + yt-dlp + FFmpeg         |
                 +---------------------------------------+
                                   |
                                   | 3b. Section-Aware Fetch
                                   v
                             [ YouTube CDN ]
```

---

## 3. Subsystem Breakdown

### 3.1. Frontend & Ingestion API (Next.js on Vercel)
- **Framework**: Next.js 15 App Router, TypeScript, Tailwind CSS.
- **Responsibilities**:
  - Validates YouTube URL validity and duration bounds using Zod.
  - Enforces IP rate limiting via Upstash Redis.
  - Creates a job record in PostgreSQL with status `QUEUED`.
  - Pushes the `jobId` onto the Upstash Redis queue (`RPUSH yt_clip_jobs`).
  - Returns `jobId` immediately to the client in < 150ms.
  - Generates Cloudflare R2 short-lived signed URLs for completed clips.

### 3.2. Job Queue (Upstash Redis)
- **Key**: `yt_clip_jobs`
- **Pattern**: FIFO Queue using `RPUSH` (producer) and `BLPOP` / `LPOP` (consumer).
- Supports both Redis TCP protocol and Upstash REST API.

### 3.3. Background Worker (Python on Render)
- **Environment**: Docker container based on `python:3.11-slim` with system FFmpeg.
- **Responsibilities**:
  - Listens to `yt_clip_jobs` queue.
  - Uses `threading.Semaphore` / `ThreadPoolExecutor` to govern worker concurrency.
  - Atomically claims jobs in PostgreSQL:
    ```sql
    UPDATE clip_jobs
    SET status = 'PROCESSING', started_at = NOW(), progress = 10
    WHERE id = %s AND status = 'QUEUED'
    RETURNING *;
    ```
  - Isolates execution to dedicated directories: `/tmp/jobs/<job_id>/`.
  - Downloads **only the requested section** using yt-dlp's `download_ranges`.
  - Trims and remuxes with FFmpeg using `-c:v libx264 -c:a aac -movflags +faststart`.
  - Uploads the final clip directly to Cloudflare R2.
  - Updates PostgreSQL status to `COMPLETED` and sets `expires_at`.
  - Cleans up `/tmp/jobs/<job_id>/` in a guaranteed `finally:` block.

### 3.4. Database (PostgreSQL / Neon)
- Stores clip jobs, processing metadata, error taxonomy, and retention expirations.
- Status state machine:
  ```
  QUEUED  -->  PROCESSING  -->  COMPLETED  -->  EXPIRED
                   |
                   +--------->  FAILED
  ```

### 3.5. Storage & CDN (Cloudflare R2)
- Zero egress fees.
- S3-compatible API.
- All downloads occur directly between the client browser and Cloudflare R2 via signed URLs.

### 3.6. Expiration & Retention Cleaner
- Dedicated daemon thread running inside the worker container every 5 minutes.
- Queries jobs where `expires_at < NOW() AND status = 'COMPLETED'`.
- Deletes the object from R2 and transitions status to `EXPIRED`.
