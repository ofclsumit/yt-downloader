"""
Automatic Expiration & Cleanup Routine for Render Background Worker.
Identifies expired jobs, deletes their objects from Cloudflare R2, and marks them EXPIRED.
"""
import time
import logging
from worker import db
from worker import storage

logger = logging.getLogger("worker.cleaner")

def run_cleanup_cycle() -> int:
    """
    Executes a single cleanup cycle.
    Returns the number of expired jobs cleaned up.
    """
    try:
        expired_jobs = db.get_expired_jobs(limit=50)
        if not expired_jobs:
            return 0

        logger.info(f"Found {len(expired_jobs)} expired jobs to purge.")
        cleaned_count = 0

        for job in expired_jobs:
            job_id = job["id"]
            r2_key = job.get("r2_object_key")

            if r2_key:
                storage.delete_clip(r2_key)

            db.mark_job_expired(job_id)
            cleaned_count += 1
            logger.info(f"[EXPIRED] Purged job {job_id} and storage key {r2_key}")

        return cleaned_count
    except Exception as e:
        logger.error(f"Error during cleanup cycle: {e}", exc_info=True)
        return 0

def cleanup_daemon(interval_seconds: int = 300):
    """Continuous daemon thread running periodic cleanup cycles."""
    logger.info(f"Starting automatic expiration cleaner daemon (interval: {interval_seconds}s)")
    while True:
        try:
            run_cleanup_cycle()
        except Exception as e:
            logger.error(f"Unexpected cleaner exception: {e}")
        time.sleep(interval_seconds)
