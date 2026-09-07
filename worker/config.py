"""
Configuration module for Render Background Worker.
Loads and validates environment variables.
"""
import os
import shutil
import tempfile
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
LOCAL_TEMP_DIR = Path(tempfile.gettempdir()) / "yt_clips"

# Load local environment files if present
try:
    from dotenv import load_dotenv
    if (BASE_DIR / ".env.local").exists():
        load_dotenv(BASE_DIR / ".env.local")
    elif (BASE_DIR / ".env").exists():
        load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

def clean_env(key: str, default: str = "") -> str:
    val = os.environ.get(key)
    if val is None:
        for k, v in os.environ.items():
            if k.strip().upper() == key.strip().upper():
                val = v
                break
    if val is None:
        val = default
    return str(val).strip().strip('"').strip("'")

# Database (with fallback aliases)
DATABASE_URL = (
    clean_env("DATABASE_URL")
    or clean_env("POSTGRES_URL")
    or clean_env("POSTGRESQL_URL")
    or clean_env("NEON_DATABASE_URL")
    or clean_env("POSTGRES_PRISMA_URL")
)

# Redis Queue
REDIS_URL = clean_env("UPSTASH_REDIS_URL") or clean_env("REDIS_URL")
UPSTASH_REST_URL = clean_env("UPSTASH_REDIS_REST_URL")
UPSTASH_REST_TOKEN = clean_env("UPSTASH_REDIS_REST_TOKEN")
REDIS_QUEUE_KEY = clean_env("REDIS_QUEUE_KEY", "yt_clip_jobs")

# Cloudflare R2
R2_ACCOUNT_ID = clean_env("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = clean_env("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = clean_env("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = clean_env("R2_BUCKET_NAME", "yt-downloader")
R2_ENDPOINT_URL = clean_env("R2_ENDPOINT_URL") or (
    f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ""
)

# YouTube Bot Bypass & Cookies
YTDLP_COOKIES_TEXT = clean_env("YTDLP_COOKIES")
YTDLP_COOKIES_FILE = None
if YTDLP_COOKIES_TEXT:
    try:
        LOCAL_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        cookie_p = LOCAL_TEMP_DIR / "cookies.txt"
        cookie_p.write_text(YTDLP_COOKIES_TEXT, encoding="utf-8")
        YTDLP_COOKIES_FILE = str(cookie_p)
    except Exception:
        pass
elif clean_env("YTDLP_COOKIES_PATH") and os.path.exists(clean_env("YTDLP_COOKIES_PATH")):
    YTDLP_COOKIES_FILE = clean_env("YTDLP_COOKIES_PATH")


# Limits & Operational Parameters
MAX_CLIP_DURATION_SECONDS = int(os.environ.get("MAX_CLIP_DURATION_SECONDS", "300"))  # 5 minutes
WORKER_CONCURRENCY = int(os.environ.get("WORKER_CONCURRENCY", "2"))
CLIP_EXPIRATION_HOURS = int(os.environ.get("CLIP_EXPIRATION_HOURS", "1"))
CLEANUP_INTERVAL_SECONDS = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", "300"))

# Sentry
SENTRY_DSN = os.environ.get("SENTRY_DSN", "")

# FFmpeg Executable Location
def find_ffmpeg() -> str:
    env_ffmpeg = os.environ.get("FFMPEG_PATH")
    if env_ffmpeg and os.path.exists(env_ffmpeg):
        return env_ffmpeg
    
    which_ffmpeg = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if which_ffmpeg:
        return which_ffmpeg
    
    # Check node_modules static binary (common in local repo)
    bundled = BASE_DIR / "node_modules" / "ffmpeg-static" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if bundled.exists():
        return str(bundled)
    
    return "ffmpeg"

FFMPEG_EXE = find_ffmpeg()
FFMPEG_DIR = os.path.dirname(FFMPEG_EXE) if os.path.isabs(FFMPEG_EXE) else ""

# Ensure FFmpeg directory is in PATH for yt-dlp
if FFMPEG_DIR and FFMPEG_DIR not in os.environ.get("PATH", ""):
    os.environ["PATH"] = FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")

