-- Migration: 001_initial_schema.sql
-- Description: Create initial schema for distributed YouTube clip jobs

CREATE TABLE IF NOT EXISTS clip_jobs (
    id VARCHAR(64) PRIMARY KEY,
    youtube_url TEXT NOT NULL,
    youtube_video_id VARCHAR(32) NOT NULL,
    title TEXT,
    start_seconds DOUBLE PRECISION NOT NULL,
    end_seconds DOUBLE PRECISION NOT NULL,
    requested_duration DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    progress INTEGER NOT NULL DEFAULT 0,
    error_code VARCHAR(64),
    error_message TEXT,
    r2_object_key TEXT,
    r2_bucket TEXT,
    file_size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    client_ip VARCHAR(64),
    retry_count INTEGER NOT NULL DEFAULT 0
);

-- Indexes for performance and job polling/claiming
CREATE INDEX IF NOT EXISTS idx_clip_jobs_status ON clip_jobs(status);
CREATE INDEX IF NOT EXISTS idx_clip_jobs_created_at ON clip_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_jobs_expires_at ON clip_jobs(expires_at) WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_clip_jobs_video_id ON clip_jobs(youtube_video_id);
