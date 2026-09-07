"""
Render Background Worker Entrypoint.
Continuously reads job IDs from Upstash Redis queue, claims them atomically in PostgreSQL,
and processes them through yt-dlp and FFmpeg with configurable concurrency.
"""
import os
import sys
import time
import signal
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
from http.server import HTTPServer, BaseHTTPRequestHandler

# Setup standard structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("worker")

# Ensure worker package is in sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

try:
    from worker import config, db, storage, cleaner
    from worker.media_processor import process_job
except (ImportError, ModuleNotFoundError):
    import config, db, storage, cleaner
    from media_processor import process_job

# Optional Sentry initialization
if config.SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=config.SENTRY_DSN,
            traces_sample_rate=1.0,
            profiles_sample_rate=1.0,
        )
        logger.info("Sentry monitoring initialized.")
    except ImportError:
        logger.warning("sentry-sdk not installed; skipping Sentry initialization.")

class RedisQueueClient:
    """Queue client supporting both native Redis (TCP) and Upstash REST API."""
    def __init__(self):
        self.client_type = None
        self.redis_client = None
        self.rest_url = None
        self.rest_token = None

        if config.REDIS_URL:
            try:
                import redis
                self.redis_client = redis.from_url(config.REDIS_URL, decode_responses=True)
                self.redis_client.ping()
                self.client_type = "tcp"
                logger.info(f"Connected to Redis via TCP ({config.REDIS_URL.split('@')[-1]})")
            except Exception as e:
                logger.warning(f"Could not connect via REDIS_URL: {e}")

        if not self.client_type and config.UPSTASH_REST_URL and config.UPSTASH_REST_TOKEN:
            self.client_type = "rest"
            self.rest_url = config.UPSTASH_REST_URL.rstrip('/')
            self.rest_token = config.UPSTASH_REST_TOKEN
            logger.info("Connected to Upstash Redis via REST API.")

        if not self.client_type:
            logger.warning("No Redis configuration provided. Worker running in idle poll mode.")

    def pop_job_id(self, timeout_seconds: int = 5) -> Optional[str]:
        """Pops a single job ID from the Redis queue (BLPOP/LPOP)."""
        if self.client_type == "tcp":
            try:
                res = self.redis_client.blpop([config.REDIS_QUEUE_KEY], timeout=timeout_seconds)
                if res:
                    _, job_id = res
                    return job_id.strip() if job_id else None
            except Exception as e:
                logger.error(f"Redis TCP pop error: {e}")
                time.sleep(2)
            return None

        elif self.client_type == "rest":
            try:
                import requests
                headers = {"Authorization": f"Bearer {self.rest_token}"}
                r = requests.post(f"{self.rest_url}/lpop/{config.REDIS_QUEUE_KEY}", headers=headers, timeout=10)
                if r.status_code == 200:
                    data = r.json()
                    val = data.get("result")
                    return str(val).strip() if val else None
            except Exception as e:
                logger.error(f"Redis REST pop error: {e}")
                time.sleep(2)
            return None

        return None

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"status":"healthy","service":"yt_clip_worker"}')

    def do_HEAD(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress access logs to keep console clean

def start_health_server(port: int):
    try:
        server = HTTPServer(('0.0.0.0', port), HealthHandler)
        logger.info(f"Health check HTTP server listening on port {port}")
        server.serve_forever()
    except Exception as e:
        logger.error(f"Failed to start health server: {e}")

def main():
    from worker import diagnostics
    diagnostics.verify_startup_diagnostics(fail_on_missing_runtime=(os.name != "nt"))

    logger.info("=" * 60)
    logger.info(f"Worker Concurrency Limit: {config.WORKER_CONCURRENCY}")
    logger.info(f"Max Clip Duration: {config.MAX_CLIP_DURATION_SECONDS}s")
    logger.info(f"Clip Expiration: {config.CLIP_EXPIRATION_HOURS} hour(s)")
    logger.info(f"FFmpeg Binary: {config.FFMPEG_EXE}")
    logger.info(f"FFprobe Binary: {config.FFPROBE_EXE}")
    logger.info(f"Database Configured: {'YES' if config.DATABASE_URL else 'NO (DATABASE_URL missing)'}")
    logger.info(f"Redis TCP Configured: {'YES' if config.REDIS_URL else 'NO (REDIS_URL missing)'}")
    logger.info(f"Upstash REST Configured: {'YES' if (config.UPSTASH_REST_URL and config.UPSTASH_REST_TOKEN) else 'NO'}")
    logger.info(f"R2 Storage Configured: {'YES' if (config.R2_ACCOUNT_ID and config.R2_ACCESS_KEY_ID) else 'NO (R2 credentials missing)'}")
    logger.info(f"YouTube Cookies Configured: {'YES (Source: ' + config.get_cookie_source() + ')' if config.has_cookies() else 'NO (Unauthenticated)'}")
    if config.YTDLP_PROXY:
        logger.info("YouTube Proxy Configured: YES")
    logger.info("=" * 60)

    # If running as a Render Web Service, start HTTP health check listener
    port_env = os.environ.get("PORT")
    if port_env:
        try:
            port = int(port_env)
            health_thread = threading.Thread(
                target=start_health_server,
                args=(port,),
                daemon=True,
                name="http-health"
            )
            health_thread.start()
        except ValueError:
            logger.warning(f"Invalid PORT env variable: {port_env}")

    # Initialize Database pool
    if config.DATABASE_URL:
        try:
            db.init_db_pool()
        except Exception as e:
            logger.error(f"Database initialization failed: {e}")
            logger.warning("Worker will continue attempting to reconnect during runtime.")

    # Start Expiration Cleaner in a separate background daemon thread
    cleaner_thread = threading.Thread(
        target=cleaner.cleanup_daemon,
        args=(config.CLEANUP_INTERVAL_SECONDS,),
        daemon=True,
        name="expiration-cleaner"
    )
    cleaner_thread.start()

    # Initialize Queue Client
    queue = RedisQueueClient()
    executor = ThreadPoolExecutor(max_workers=config.WORKER_CONCURRENCY, thread_name_prefix="media-worker")
    active_futures = set()

    running = True

    def handle_shutdown(signum, frame):
        nonlocal running
        logger.info(f"Received signal {signum}. Initiating graceful shutdown...")
        running = False

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    logger.info("Worker event loop active. Waiting for jobs...")

    while running:
        # Clean finished futures
        done = {f for f in active_futures if f.done()}
        for f in done:
            exc = f.exception()
            if exc:
                logger.error(f"Worker task error: {exc}")
        active_futures -= done

        # Backpressure: Do not pop new jobs if concurrency limit is reached
        if len(active_futures) >= config.WORKER_CONCURRENCY:
            time.sleep(0.5)
            continue

        job_id = queue.pop_job_id(timeout_seconds=3)
        if not job_id:
            time.sleep(1)
            continue

        logger.info(f"Popped job ID from queue: {job_id}")

        # Atomically claim the job in PostgreSQL
        try:
            job_row = db.claim_job(job_id)
            if not job_row:
                logger.info(f"Job {job_id} already claimed or no longer queued. Skipping.")
                continue

            # Submit to ThreadPoolExecutor
            logger.info(f"Claimed job {job_id}. Submitting to worker pool...")
            future = executor.submit(process_job, job_row)
            active_futures.add(future)

        except Exception as e:
            logger.error(f"Failed to claim/dispatch job {job_id}: {e}", exc_info=True)

    logger.info("Waiting for active media processing jobs to finish...")
    executor.shutdown(wait=True)
    logger.info("Render Background Worker stopped cleanly.")

if __name__ == "__main__":
    main()
