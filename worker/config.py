"""
Configuration module for Render Background Worker.
Loads and validates environment variables.
"""
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional

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

# Optional Proxy Support
YTDLP_PROXY = clean_env("YTDLP_PROXY") or clean_env("HTTP_PROXY") or clean_env("HTTPS_PROXY")

# YouTube Bot Bypass & Cookies (Secure In-Memory Handling)
def _parse_cookie_content(raw_val: str) -> Optional[str]:
    """
    Safely parses cookie content from environment variable.
    Supports:
    1. Base64-encoded Netscape cookie file (Recommended format)
    2. Raw multiline Netscape / Mozilla cookie format
    3. Literal-escaped newlines (\\n, \\t)
    Returns decoded cookie string or None if empty/invalid.
    """
    if not raw_val:
        return None
    val = raw_val.strip().strip('"').strip("'")
    if not val:
        return None

    # Check for Base64 encoding
    if not val.startswith("#") and "youtube.com" not in val:
        try:
            import base64
            decoded = base64.b64decode(val).decode("utf-8", errors="ignore")
            if "youtube.com" in decoded or "Netscape" in decoded or "\t" in decoded:
                return decoded
        except Exception:
            pass

    # Unescape literal backslash-n / backslash-t if passed from single-line env variable
    if "\\n" in val:
        val = val.replace("\\n", "\n").replace("\\t", "\t")

    return val if val else None

_RAW_COOKIES = clean_env("YTDLP_COOKIES") or clean_env("YTDLP_COOKIES_B64")
_PARSED_COOKIES = _parse_cookie_content(_RAW_COOKIES)
_COOKIES_PATH = clean_env("YTDLP_COOKIES_PATH")

DEFAULT_SECRET_PATHS = [
    Path("/etc/secrets/cookies.txt"),
    Path("/etc/secrets/youtube_cookies.txt"),
    Path("/etc/secrets/YTDLP_COOKIES"),
    BASE_DIR / "cookies.txt",
]

def get_cookie_content() -> Optional[str]:
    """
    Returns the in-memory cookie content.
    Checks:
    1. YTDLP_COOKIES / YTDLP_COOKIES_B64 environment variables
    2. YTDLP_COOKIES_PATH custom file path
    3. Render Secret Files mounted at /etc/secrets/cookies.txt
    """
    if _PARSED_COOKIES:
        return _PARSED_COOKIES

    # Check custom path if configured
    if _COOKIES_PATH and os.path.exists(_COOKIES_PATH):
        try:
            with open(_COOKIES_PATH, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if content:
                    return _parse_cookie_content(content) or content
        except Exception:
            pass

    # Check Render Secret Files paths
    for p in DEFAULT_SECRET_PATHS:
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read().strip()
                    if content:
                        return _parse_cookie_content(content) or content
            except Exception:
                pass

    return None

def has_cookies() -> bool:
    """Returns True if valid cookie credentials are configured."""
    return get_cookie_content() is not None

def get_cookie_source() -> str:
    """Returns a description of where cookies were loaded from (without revealing content)."""
    if _PARSED_COOKIES:
        return "Environment Variable"
    if _COOKIES_PATH and os.path.exists(_COOKIES_PATH):
        return "Custom Path (YTDLP_COOKIES_PATH)"
    for p in DEFAULT_SECRET_PATHS:
        if p.exists() and p.is_file():
            return f"Secret File ({p})"
    return "None"

# Backward compatibility alias - DO NOT use for writing global files
YTDLP_COOKIES_FILE = None


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

