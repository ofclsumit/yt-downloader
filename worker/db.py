"""
PostgreSQL Database client for Render Background Worker.
Implements atomic job claiming, progress updates, completion, and expiration queries.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager

from worker import config

logger = logging.getLogger("worker.db")

_pool: Optional[ThreadedConnectionPool] = None

def init_db_pool():
    global _pool
    if not config.DATABASE_URL:
        logger.warning("DATABASE_URL is not set. Database operations will fail.")
        return
    if _pool is None:
        try:
            _pool = ThreadedConnectionPool(
                minconn=1,
                maxconn=max(5, config.WORKER_CONCURRENCY * 2 + 2),
                dsn=config.DATABASE_URL
            )
            logger.info("PostgreSQL connection pool initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise

@contextmanager
def get_db_cursor():
    """Context manager yielding a cursor from the connection pool with auto-commit."""
    if _pool is None:
        init_db_pool()
    if _pool is None:
        raise RuntimeError("Database pool not available. Ensure DATABASE_URL is configured.")
    
    conn = _pool.getconn()
    try:
        conn.autocommit = True
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            yield cur
    finally:
        _pool.putconn(conn)

def claim_job(job_id: str) -> Optional[Dict[str, Any]]:
    """
    Atomically claims a QUEUED job.
    Returns the job row if successfully claimed, or None if already claimed/cancelled.
    """
    query = """
    UPDATE clip_jobs
    SET status = 'PROCESSING',
        started_at = NOW(),
        progress = 10
    WHERE id = %s AND status = 'QUEUED'
    RETURNING *;
    """
    with get_db_cursor() as cur:
        cur.execute(query, (job_id,))
        row = cur.fetchone()
        return dict(row) if row else None

def update_job_progress(job_id: str, progress: int):
    """Updates progress (0-100) for an active job."""
    query = """
    UPDATE clip_jobs
    SET progress = %s
    WHERE id = %s AND status = 'PROCESSING';
    """
    with get_db_cursor() as cur:
        cur.execute(query, (progress, job_id))

def mark_job_completed(
    job_id: str,
    r2_object_key: str,
    file_size_bytes: int,
    expires_at: datetime,
    title: Optional[str] = None
):
    """Marks a job as COMPLETED and stores its R2 metadata and expiration."""
    query = """
    UPDATE clip_jobs
    SET status = 'COMPLETED',
        progress = 100,
        r2_object_key = %s,
        r2_bucket = %s,
        file_size_bytes = %s,
        completed_at = NOW(),
        expires_at = %s,
        title = COALESCE(%s, title)
    WHERE id = %s;
    """
    with get_db_cursor() as cur:
        cur.execute(query, (
            r2_object_key,
            config.R2_BUCKET_NAME,
            file_size_bytes,
            expires_at,
            title,
            job_id
        ))

def mark_job_failed(job_id: str, error_code: str, error_message: str):
    """Marks a job as FAILED with friendly error code and message."""
    query = """
    UPDATE clip_jobs
    SET status = 'FAILED',
        error_code = %s,
        error_message = %s
    WHERE id = %s;
    """
    with get_db_cursor() as cur:
        cur.execute(query, (error_code, error_message, job_id))

def get_expired_jobs(limit: int = 50) -> List[Dict[str, Any]]:
    """Finds completed jobs whose expires_at timestamp is in the past."""
    query = """
    SELECT id, r2_object_key, r2_bucket
    FROM clip_jobs
    WHERE status = 'COMPLETED'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    LIMIT %s;
    """
    with get_db_cursor() as cur:
        cur.execute(query, (limit,))
        rows = cur.fetchall()
        return [dict(r) for r in rows]

def mark_job_expired(job_id: str):
    """Marks a completed job as EXPIRED."""
    query = """
    UPDATE clip_jobs
    SET status = 'EXPIRED'
    WHERE id = %s;
    """
    with get_db_cursor() as cur:
        cur.execute(query, (job_id,))
