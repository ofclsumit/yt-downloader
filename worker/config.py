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

def get_job_proxy(session_id: Optional[str] = None) -> Optional[str]:
    """
    Returns the configured proxy URL with sticky session support.
    For Webshare proxies, ensures that metadata extraction and FFmpeg stream slicing
    share the identical sticky IP session (e.g. username-sessionID).
    Eliminates YouTube CDN 403 Forbidden and bypasses datacenter IP blocking.
    """
    raw = YTDLP_PROXY
    if not raw:
        return None
    try:
        import urllib.parse
        import re
        parts = urllib.parse.urlsplit(raw)
        if "webshare.io" in (parts.hostname or ""):
            user = parts.username or ""
            base_user = re.sub(r'(-rotate|-\d+)$', '', user)
            new_user = f"{base_user}-{session_id}" if session_id else f"{base_user}-1"
            netloc = f"{new_user}:{parts.password}@{parts.hostname}"
            if parts.port:
                netloc += f":{parts.port}"
            return urllib.parse.urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
    except Exception:
        pass
    return raw

# YouTube Bot Bypass & Cookies (Secure In-Memory Handling)
def normalize_netscape_cookies(raw_text: str) -> Optional[str]:
    """
    Normalizes any cookie input (Netscape, space-separated, JSON, Base64) into
    a strictly valid, tab-separated Netscape HTTP Cookie file that Python's
    MozillaCookieJar and yt-dlp will parse without warnings or errors.
    """
    if not raw_text:
        return None
    val = raw_text.strip().strip('"').strip("'")
    if not val:
        return None

    # Handle JSON format (e.g. Cookie-Editor extension)
    if val.startswith("[") and val.endswith("]"):
        try:
            import json
            cookie_list = json.loads(val)
            if isinstance(cookie_list, list) and len(cookie_list) > 0 and isinstance(cookie_list[0], dict):
                lines = ["# Netscape HTTP Cookie File", "# Converted from JSON"]
                for c in cookie_list:
                    dom = c.get("domain", ".youtube.com")
                    sub = "TRUE" if dom.startswith(".") else "FALSE"
                    p = c.get("path", "/")
                    sec = "TRUE" if c.get("secure", True) else "FALSE"
                    exp = str(int(c.get("expirationDate") or c.get("expires") or 2147483647))
                    name = c.get("name", "")
                    v = c.get("value", "")
                    lines.append(f"{dom}\t{sub}\t{p}\t{sec}\t{exp}\t{name}\t{v}")
                return "\n".join(lines) + "\n"
        except Exception:
            pass

    # Handle Base64 encoding
    if not val.startswith("#") and "youtube.com" not in val and "\t" not in val and " " not in val:
        try:
            import base64
            decoded = base64.b64decode(val).decode("utf-8", errors="ignore")
            if "youtube.com" in decoded or "Netscape" in decoded or "\t" in decoded:
                val = decoded
        except Exception:
            pass

    # Unescape literal backslash-n / backslash-t
    if "\\n" in val:
        val = val.replace("\\n", "\n").replace("\\t", "\t")

    lines = [l.strip() for l in val.splitlines() if l.strip()]
    if not lines:
        return None

    import re
    valid_entries = ["# Netscape HTTP Cookie File", "# Normalized by yt-downloader worker"]
    found_cookie = False

    for line in lines:
        if line.startswith("#"):
            continue
        # Split by tab first, fallback to multiple spaces
        if "\t" in line:
            parts = line.split("\t")
        else:
            parts = re.split(r'\s{2,}|\t', line)

        if len(parts) >= 6:
            domain = parts[0]
            sub = parts[1].upper() if len(parts) > 1 and parts[1].upper() in ("TRUE", "FALSE") else ("TRUE" if domain.startswith(".") else "FALSE")
            path = parts[2] if len(parts) > 2 else "/"
            sec = parts[3].upper() if len(parts) > 3 and parts[3].upper() in ("TRUE", "FALSE") else "TRUE"
            exp = parts[4] if len(parts) > 4 and parts[4].isdigit() else "2147483647"
            name = parts[5] if len(parts) > 5 else ""
            value = parts[6] if len(parts) > 6 else ""
            valid_entries.append(f"{domain}\t{sub}\t{path}\t{sec}\t{exp}\t{name}\t{value}")
            found_cookie = True

    if found_cookie:
        return "\n".join(valid_entries) + "\n"

    # Fallback: ensure header is present even if line format is non-standard
    if not val.startswith("# Netscape HTTP Cookie File"):
        val = "# Netscape HTTP Cookie File\n" + val
    return val

_parse_cookie_content = normalize_netscape_cookies

_RAW_COOKIES = clean_env("YTDLP_COOKIES") or clean_env("YTDLP_COOKIES_B64")
_PARSED_COOKIES = _parse_cookie_content(_RAW_COOKIES)
_COOKIES_PATH = clean_env("YTDLP_COOKIES_PATH")
YTDLP_COOKIES_URL = clean_env("YTDLP_COOKIES_URL")
_CACHED_URL_COOKIES = None

DEFAULT_SECRET_PATHS = [
    Path("/etc/secrets/cookies.txt"),
    Path("/etc/secrets/youtube_cookies.txt"),
    Path("/etc/secrets/cookies"),
    Path("/etc/secrets/youtube"),
    Path("/etc/secrets/YTDLP_COOKIES"),
    Path("/etc/secrets/YTDLP_COOKIES.txt"),
    BASE_DIR / "cookies.txt",
    BASE_DIR / "youtube_cookies.txt",
]

def _discover_secret_files() -> list:
    """Discovers all candidate cookie files from /etc/secrets/ and default paths."""
    candidates = list(DEFAULT_SECRET_PATHS)
    render_secrets_dir = Path("/etc/secrets")
    if render_secrets_dir.exists() and render_secrets_dir.is_dir():
        try:
            for f in render_secrets_dir.iterdir():
                if f.is_file() and f not in candidates:
                    candidates.append(f)
        except Exception:
            pass
    return candidates

def get_cookie_content() -> Optional[str]:
    """
    Returns the in-memory cookie content.
    Checks:
    1. YTDLP_COOKIES / YTDLP_COOKIES_B64 environment variables
    2. YTDLP_COOKIES_URL remote HTTP(S) URL
    3. YTDLP_COOKIES_PATH custom file path
    4. Render Secret Files mounted at /etc/secrets/*
    5. Local project cookies.txt
    """
    global _CACHED_URL_COOKIES
    if _PARSED_COOKIES:
        return _PARSED_COOKIES

    # Check remote URL if configured
    if YTDLP_COOKIES_URL and YTDLP_COOKIES_URL.startswith("http"):
        if _CACHED_URL_COOKIES:
            return _CACHED_URL_COOKIES
        try:
            import urllib.request
            req = urllib.request.Request(
                YTDLP_COOKIES_URL,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    raw_remote = resp.read().decode("utf-8", errors="ignore").strip()
                    parsed = _parse_cookie_content(raw_remote) or raw_remote
                    _CACHED_URL_COOKIES = parsed
                    return _CACHED_URL_COOKIES
        except Exception:
            pass

    # Check custom path if configured
    if _COOKIES_PATH and os.path.exists(_COOKIES_PATH):
        try:
            with open(_COOKIES_PATH, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                if content:
                    return _parse_cookie_content(content) or content
        except Exception:
            pass

    # Check Render Secret Files and default locations
    for p in _discover_secret_files():
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read().strip()
                    if content:
                        parsed = _parse_cookie_content(content)
                        if parsed:
                            return parsed
                        if "youtube.com" in content or "\t" in content:
                            return content
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
    if YTDLP_COOKIES_URL and _CACHED_URL_COOKIES:
        return "Remote URL (YTDLP_COOKIES_URL)"
    if _COOKIES_PATH and os.path.exists(_COOKIES_PATH):
        return "Custom Path (YTDLP_COOKIES_PATH)"
    for p in _discover_secret_files():
        if p.exists() and p.is_file():
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                    if "youtube.com" in content or "\t" in content or _parse_cookie_content(content):
                        return f"Secret File ({p})"
            except Exception:
                pass
    return "None"

def get_secret_debug_info() -> str:
    """Returns safe diagnostic info about secret files and cookie configuration without exposing secrets."""
    parts = []
    render_secrets_dir = Path("/etc/secrets")
    if render_secrets_dir.exists() and render_secrets_dir.is_dir():
        try:
            files = [f"{f.name} ({f.stat().st_size}b)" for f in render_secrets_dir.iterdir() if f.is_file()]
            parts.append(f"/etc/secrets files: {files if files else 'empty dir'}")
        except Exception as e:
            parts.append(f"/etc/secrets read err: {e}")
    else:
        parts.append("/etc/secrets missing")

    env_cookie_keys = [k for k in os.environ.keys() if "COOKIE" in k.upper()]
    parts.append(f"env vars: {env_cookie_keys if env_cookie_keys else 'none'}")
    return " | ".join(parts)

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

def find_ffprobe() -> str:
    env_ffprobe = os.environ.get("FFPROBE_PATH")
    if env_ffprobe and os.path.exists(env_ffprobe):
        return env_ffprobe
    which_ffprobe = shutil.which("ffprobe") or shutil.which("ffprobe.exe")
    if which_ffprobe:
        return which_ffprobe
    if FFMPEG_DIR:
        sibling = Path(FFMPEG_DIR) / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
        if sibling.exists():
            return str(sibling)
    bundled = BASE_DIR / "node_modules" / "ffprobe-static" / ("ffprobe.exe" if os.name == "nt" else "ffprobe")
    if bundled.exists():
        return str(bundled)
    return "ffprobe"

FFPROBE_EXE = find_ffprobe()

# Ensure FFmpeg directory is in PATH for yt-dlp
if FFMPEG_DIR and FFMPEG_DIR not in os.environ.get("PATH", ""):
    os.environ["PATH"] = FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")

