from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import yt_dlp
import time
import os
import re
import uuid
import sys
import subprocess
import secrets
import threading
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, UploadFile, File, Form, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

# ---------------------------------------------------------
# Path and Configuration Initialization
# ---------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_PATH = os.path.join(BASE_DIR, "downloads")
TEMP_PATH = os.path.join(BASE_DIR, "temp")
os.makedirs(DOWNLOAD_PATH, exist_ok=True)
os.makedirs(TEMP_PATH, exist_ok=True)

import shutil

# Locate and inject ffmpeg into PATH for yt-dlp
FFMPEG_NODE_PATH = os.path.join(BASE_DIR, "node_modules", "ffmpeg-static", "ffmpeg.exe")
if os.path.exists(FFMPEG_NODE_PATH):
    FFMPEG_EXE = FFMPEG_NODE_PATH
    ffmpeg_dir = os.path.dirname(FFMPEG_NODE_PATH)
    if ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
else:
    FFMPEG_EXE = shutil.which("ffmpeg") or "ffmpeg"

NODE_BIN = shutil.which('node') or r"C:\Program Files\nodejs\node.exe"
YTDLP_BASE_OPTS = {
    'quiet': True,
    'no_warnings': True,
    'extractor_args': {
        'youtube': {
            'player_client': ['visionos', 'android'],
        }
    },
    'js_runtimes': {'node': {'path': NODE_BIN}} if (NODE_BIN and os.path.exists(NODE_BIN)) else {},
}

# ---------------------------------------------------------
# Production Infrastructure Configuration
# 1. Rotating / Static Proxies
# 2. Concurrency Queue Semaphore
# 3. Automatic Background Cleanup Daemon
# ---------------------------------------------------------
PROXY_ENV = os.environ.get("YTDLP_PROXIES") or os.environ.get("YTDLP_PROXY") or ""
PROXIES_FILE = os.path.join(BASE_DIR, "proxies.txt")

COOKIES_ENV = os.environ.get("YTDLP_COOKIES", "").strip()
COOKIES_FILE = os.path.join(BASE_DIR, "cookies.txt")
if COOKIES_ENV and not os.path.exists(COOKIES_FILE):
    try:
        import base64
        # Support both raw cookies string and base64-encoded string
        decoded = None
        try:
            decoded = base64.b64decode(COOKIES_ENV).decode("utf-8")
            if "# Netscape" not in decoded and "\t" not in decoded:
                decoded = None
        except Exception:
            decoded = None
        with open(COOKIES_FILE, "w", encoding="utf-8") as f:
            f.write(decoded if decoded else COOKIES_ENV)
        print("[Cookies] Loaded cookies from YTDLP_COOKIES environment variable")
    except Exception as e:
        print(f"[Cookies Init] Failed to write cookies.txt: {e}")

PO_TOKEN_ENV = os.environ.get("YTDLP_PO_TOKEN", "").strip()

def get_rotating_proxy() -> Optional[str]:
    """
    Selects a proxy from YTDLP_PROXIES env var or proxies.txt file.
    Returns None if no proxy is configured, falling back to direct connection.
    """
    proxies = []
    if PROXY_ENV:
        proxies.extend([p.strip() for p in PROXY_ENV.split(",") if p.strip()])
    if os.path.exists(PROXIES_FILE):
        try:
            with open(PROXIES_FILE, "r", encoding="utf-8") as f:
                proxies.extend([line.strip() for line in f if line.strip() and not line.startswith("#")])
        except Exception:
            pass
    if proxies:
        import random
        return random.choice(proxies)
    return None

def get_ytdlp_opts(custom_opts: dict = None, use_cookies: bool = False) -> dict:
    """Builds yt-dlp options dictionary with proxy. Injects cookies only when explicitly requested."""
    import copy
    opts = copy.deepcopy(YTDLP_BASE_OPTS)
    proxy = get_rotating_proxy()
    if proxy:
        opts["proxy"] = proxy
        os.environ["http_proxy"] = proxy
        os.environ["https_proxy"] = proxy
        os.environ["HTTP_PROXY"] = proxy
        os.environ["HTTPS_PROXY"] = proxy
    if FFMPEG_EXE and (os.path.isabs(FFMPEG_EXE) or shutil.which(FFMPEG_EXE)):
        opts["ffmpeg_location"] = FFMPEG_EXE
    if use_cookies and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        opts["cookiefile"] = COOKIES_FILE
    if PO_TOKEN_ENV:
        opts.setdefault("extractor_args", {}).setdefault("youtube", {})["po_token"] = [f"web+{PO_TOKEN_ENV}"]
    if custom_opts:
        opts.update(custom_opts)
    return opts

# Concurrency Limiter: Max concurrent downloads to protect server CPU/RAM (Default: 3)
MAX_CONCURRENT_DOWNLOADS = int(os.environ.get("MAX_CONCURRENT_DOWNLOADS", 3))
DOWNLOAD_SEMAPHORE = threading.Semaphore(MAX_CONCURRENT_DOWNLOADS)

# File Retention Window: Purge temporary and processed files after retention period (Default: 20 minutes)
FILE_RETENTION_MINUTES = int(os.environ.get("FILE_RETENTION_MINUTES", 20))

def cleanup_expired_files():
    """Scans TEMP_PATH and DOWNLOAD_PATH and deletes files older than FILE_RETENTION_MINUTES, and prunes expired sessions."""
    cutoff = time.time() - (FILE_RETENTION_MINUTES * 60)
    
    # Prune expired sessions (older than expiration + 10 minutes)
    session_cutoff = time.time() - 600
    try:
        with SESSION_LOCK:
            expired_sids = [sid for sid, s in list(sessions.items()) if s.get("expires_at", 0) < session_cutoff]
            for sid in expired_sids:
                sessions.pop(sid, None)
    except Exception:
        pass

    # Clean temp folder
    if os.path.exists(TEMP_PATH):
        for fname in os.listdir(TEMP_PATH):
            fpath = os.path.join(TEMP_PATH, fname)
            try:
                if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
            except Exception:
                pass

    # Clean downloads folder
    if os.path.exists(DOWNLOAD_PATH):
        for root, _, files in os.walk(DOWNLOAD_PATH):
            for fname in files:
                fpath = os.path.join(root, fname)
                try:
                    if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                        os.remove(fpath)
                except Exception:
                    pass

def delayed_file_cleanup(file_path: str, delay_seconds: int = 60):
    """Clean up a downloaded file shortly after delivery to free server disk space."""
    try:
        time.sleep(delay_seconds)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass

def start_background_cleanup_daemon():
    """Starts a daemon thread that automatically purges expired media every 3 minutes."""
    def run_loop():
        while True:
            try:
                time.sleep(180)
                cleanup_expired_files()
            except Exception as e:
                print(f"[Auto-Cleanup] Error during file scan: {e}")

    t = threading.Thread(target=run_loop, daemon=True)
    t.start()



def setup_chrome_driver():
    """Setup Chrome with basic options"""
    chrome_options = Options()

    # Suppress DevTools logging
    chrome_options.add_experimental_option(
        'excludeSwitches', ['enable-logging'])

    # Add additional options to improve stability
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')
    chrome_options.add_argument("--disable-notifications")

    # Uncomment below line if you don't want to see the browser
    # chrome_options.add_argument("--headless")

    return webdriver.Chrome(options=chrome_options)


def determine_category(title):
    """
    Determine the category based on video title
    Add more keywords and categories as needed
    """
    if not title:
        return 'others'
    title = title.lower()

    categories = {
        'anime': [
            'dragon ball', 'naruto', 'one piece', 'bleach', 'attack on titan',
            'demon slayer', 'my hero academia', 'jujutsu', 'anime', 'boruto',
            'manga', 'hunter x hunter', 'death note', 'wind breaker', 'one punch', "amv", "eren",
            "luffy", "zoro", "nami", "vegita"
        ],
        'tv_series': [
            'friends', 'big bang theory', 'sheldon', 'breaking bad', 'game of thrones',
            'stranger things', 'series', 'episode', 'season', 'show', 'sitcom',
            'netflix', 'tv series', 'suits',
        ],
        'gaming': [
            'gameplay', 'gaming', 'playthrough', 'minecraft', 'fortnite',
            'game', 'ps5', 'xbox', 'nintendo', 'walkthrough', 'lets play',
            'stream', 'gaming moments'
        ],
        'music': [
            'music video', 'song', 'concert', 'live performance', 'mv',
            'official music', 'lyrics', 'album', 'official video', 'ft.',
            'featuring', 'rap', 'hip hop', 'rock'
        ],
        'movies': [
            'movie', 'film', 'cinema', 'trailer', 'teaser', 'behind the scenes',
            'movie scene', 'film review', 'movie review'
        ],
        'educational': [
            'tutorial', 'how to', 'learn', 'education', 'course',
            'lesson', 'guide', 'explained', 'documentary', 'history',
            'science', 'math', 'programming'
        ]
    }

    for category, keywords in categories.items():
        if any(keyword in title for keyword in keywords):
            return category

    return 'others'  # Default category if no match found


def download_video(url, base_path):
    """Download video using yt-dlp"""
    try:
        # First get video info to determine category
        ydl_opts_info = {'quiet': True, **YTDLP_BASE_OPTS}
        if FFMPEG_EXE and os.path.exists(FFMPEG_EXE):
            ydl_opts_info['ffmpeg_location'] = FFMPEG_EXE

        with yt_dlp.YoutubeDL(ydl_opts_info) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'video')
            category = determine_category(title)

            # Create category subfolder
            output_path = os.path.join(base_path, category)
            if not os.path.exists(output_path):
                os.makedirs(output_path, exist_ok=True)

        # Options for reliable video+audio download
        ydl_opts = {
            'format': 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b',
            'format_sort': [
                'res:1080',
                'res:720',
                'fps:30',
                'codec:h264'
            ],
            'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
            'quiet': False,
            'no_warnings': False,
            'ignoreerrors': True,
            'merge_output_format': 'mp4',
            'postprocessors': [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': 'mp4'
            }],
            **YTDLP_BASE_OPTS
        }
        if FFMPEG_EXE and os.path.exists(FFMPEG_EXE):
            ydl_opts['ffmpeg_location'] = FFMPEG_EXE

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
            print(f"Downloaded to category: {category}")
            return True

    except Exception as e:
        print(f"Error downloading {url}: {str(e)}")
        return False


# Global state for background channel scraping job
channel_status = {
    "is_running": False,
    "channel_url": "",
    "total_found": 0,
    "downloaded_count": 0,
    "current_video": "",
    "logs": []
}


def log_channel(msg: str):
    print(msg)
    channel_status["logs"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
    if len(channel_status["logs"]) > 100:
        channel_status["logs"].pop(0)


def download_channel_videos(channel_url, download_path, start_from=0):
    """
    Get all videos from YouTube channel and download them
    Parameters:
        channel_url: URL of the YouTube channel
        download_path: Base path for downloads (will be organized by categories)
        start_from: Skip first N videos (useful for resuming downloads)
    """
    channel_status["is_running"] = True
    channel_status["channel_url"] = channel_url
    channel_status["total_found"] = 0
    channel_status["downloaded_count"] = 0
    channel_status["logs"] = []

    try:
        driver = setup_chrome_driver()
    except Exception as e:
        log_channel(f"Error initializing Chrome Driver: {str(e)}")
        channel_status["is_running"] = False
        return

    video_urls = []
    no_new_videos_count = 0

    try:
        log_channel(f"Accessing channel: {channel_url}")
        driver.get(channel_url)

        last_height = driver.execute_script("return document.documentElement.scrollHeight")
        videos_found = 0

        while True:
            driver.execute_script("window.scrollTo(0, document.documentElement.scrollHeight);")
            time.sleep(2)

            initial_video_count = len(video_urls)

            regular_videos = driver.find_elements(By.CSS_SELECTOR, "#video-title")
            shorts = driver.find_elements(By.CSS_SELECTOR, "a.shortsLockupViewModelHostEndpoint")

            for video in regular_videos:
                url = video.get_attribute('href')
                if url and url not in video_urls and not '/shorts/' in url:
                    video_urls.append(url)
                    videos_found += 1
                    channel_status["total_found"] = videos_found
                    log_channel(f"Found regular video ({videos_found}): {video.get_attribute('title')}")

            for short in shorts:
                href = short.get_attribute('href')
                if href and href.startswith('/shorts/'):
                    url = f"https://www.youtube.com{href}"
                elif href and href.startswith('https://'):
                    url = href
                else:
                    continue

                if url and url not in video_urls:
                    video_urls.append(url)
                    videos_found += 1
                    channel_status["total_found"] = videos_found
                    log_channel(f"Found short ({videos_found}): {url}")

            if len(video_urls) == initial_video_count:
                no_new_videos_count += 1
            else:
                no_new_videos_count = 0

            if no_new_videos_count >= 5:
                log_channel("No new videos found after multiple scrolls. Starting downloads.")
                break

            new_height = driver.execute_script("return document.documentElement.scrollHeight")
            if new_height == last_height:
                time.sleep(3)
                new_height = driver.execute_script("return document.documentElement.scrollHeight")
                if new_height == last_height:
                    log_channel("Reached end of channel page.")
                    break
            last_height = new_height

            if videos_found % 100 == 0:
                log_channel(f"Found {videos_found} videos so far...")

        log_channel(f"Found total of {len(video_urls)} videos. Starting downloads...")

        with open(os.path.join(BASE_DIR, 'video_urls.txt'), 'a', encoding='utf-8') as f:
            for url in video_urls:
                f.write(f"{url}\n")

        for i, url in enumerate(video_urls[start_from:], start_from + 1):
            channel_status["current_video"] = url
            log_channel(f"Downloading video {i}/{len(video_urls)}: {url}")

            try:
                success = download_video(url, download_path)
                if success:
                    channel_status["downloaded_count"] += 1
                    log_channel(f"Successfully downloaded video {i}")
                else:
                    log_channel(f"Failed to download video {i}")
                    with open(os.path.join(BASE_DIR, 'failed_downloads.txt'), 'a', encoding='utf-8') as f:
                        f.write(f"{url}\n")
            except Exception as e:
                log_channel(f"Error downloading video {i}: {str(e)}")
                with open(os.path.join(BASE_DIR, 'failed_downloads.txt'), 'a', encoding='utf-8') as f:
                    f.write(f"{url}\n")

    except Exception as e:
        log_channel(f"Error during channel scraping: {str(e)}")
    finally:
        driver.quit()
        channel_status["is_running"] = False
        log_channel("Channel processing complete.")


# ---------------------------------------------------------
# FastAPI App & Endpoints for Frontend Integration
# ---------------------------------------------------------
app = FastAPI(title="YouTube Video & Clip Downloader", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Production Temporary Per-Video Session Management
# ---------------------------------------------------------
sessions: Dict[str, Dict[str, Any]] = {}
SESSION_LOCK = threading.Lock()
SESSION_EXPIRATION_SECONDS = 300  # 5 minutes inactivity timeout

# Lightweight in-memory rate limiter to protect expensive endpoints
RATE_LIMITS: Dict[str, List[float]] = {}
RATE_LIMIT_LOCK = threading.Lock()

def check_rate_limit(key: str, max_requests: int = 30, window_seconds: int = 60) -> bool:
    """Returns True if within rate limit, False if limit exceeded."""
    now = time.time()
    with RATE_LIMIT_LOCK:
        timestamps = RATE_LIMITS.setdefault(key, [])
        RATE_LIMITS[key] = [t for t in timestamps if now - t < window_seconds]
        if len(RATE_LIMITS[key]) >= max_requests:
            return False
        RATE_LIMITS[key].append(now)
        return True

# Jobs tracking in memory
jobs: Dict[str, Dict[str, Any]] = {}


class SessionCreateRequest(BaseModel):
    url: str


class SessionActivityRequest(BaseModel):
    token: Optional[str] = None
    timestamps: Optional[Dict[str, float]] = None
    quality: Optional[str] = None
    format: Optional[str] = None
    action: Optional[str] = None


class SessionCloseRequest(BaseModel):
    token: Optional[str] = None
    jobId: Optional[str] = None


class AnalyzeRequest(BaseModel):
    url: str
    sessionId: Optional[str] = None


class ClipJobRequest(BaseModel):
    url: Optional[str] = None
    source: Optional[str] = "youtube"
    start: Optional[float] = 0.0
    end: Optional[float] = None
    format: Optional[str] = "mp4"
    isClip: Optional[bool] = False
    category: Optional[str] = None
    quality: Optional[str] = "1080"
    sessionId: Optional[str] = None
    sessionToken: Optional[str] = None


class ChannelDownloadRequest(BaseModel):
    channel_url: str
    start_from: Optional[int] = 0


# ---------------------------------------------------------
# Session Lifecycle Endpoints
# ---------------------------------------------------------

@app.post("/api/session/create")
def api_create_session(req: SessionCreateRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"sess_create_{client_ip}", max_requests=25, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many session creation requests. Please wait a minute.")

    raw_url = req.url.strip()
    if not raw_url:
        raise HTTPException(status_code=400, detail="Video URL is required")

    # Generate cryptographically secure random session ID (12 chars, URL-safe)
    session_id = secrets.token_urlsafe(9).replace("-", "x").replace("_", "z")[:12]
    with SESSION_LOCK:
        while session_id in sessions:
            session_id = secrets.token_urlsafe(9).replace("-", "x").replace("_", "z")[:12]

    session_token = secrets.token_hex(16)
    now = time.time()

    yt_id = None
    yt_match = re.search(r'(?:v=|\/|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})', raw_url)
    if yt_match:
        yt_id = yt_match.group(1)

    with SESSION_LOCK:
        sessions[session_id] = {
            "id": session_id,
            "token": session_token,
            "video_url": raw_url,
            "video_id": yt_id,
            "created_at": now,
            "last_activity_at": now,
            "expires_at": now + SESSION_EXPIRATION_SECONDS,
            "status": "active",
            "timestamps": {"start": 0.0, "end": 60.0},
            "quality": "1080",
            "format": "mp4",
            "job_id": None,
            "metadata": None,
            "is_processing": False
        }

    print(f"[Session Created] ID: {session_id} | Video: {yt_id or 'media'} | Client: {client_ip}")

    return {
        "sessionId": session_id,
        "sessionToken": session_token,
        "videoUrl": raw_url,
        "videoId": yt_id,
        "expiresAt": now + SESSION_EXPIRATION_SECONDS,
        "expiresIn": SESSION_EXPIRATION_SECONDS,
        "clipUrl": f"/clip/{session_id}"
    }


@app.get("/api/session/{session_id}")
def api_get_session(session_id: str):
    now = time.time()
    with SESSION_LOCK:
        session = sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Enforce server-side 5-minute inactivity expiration
        if now > session["expires_at"] or session["status"] == "expired":
            session["status"] = "expired"
            session["is_processing"] = False
            return JSONResponse(
                status_code=410,
                content={
                    "status": "expired",
                    "sessionId": session_id,
                    "error": "Session expired",
                    "message": "This video session is no longer active."
                }
            )

        remaining = max(0, int(session["expires_at"] - now))
        job_info = None
        if session.get("job_id") and session["job_id"] in jobs:
            job_info = jobs[session["job_id"]]

        return {
            "status": session["status"],
            "sessionId": session_id,
            "videoUrl": session["video_url"],
            "videoId": session["video_id"],
            "timestamps": session["timestamps"],
            "quality": session["quality"],
            "format": session["format"],
            "metadata": session.get("metadata"),
            "jobId": session.get("job_id"),
            "isProcessing": session.get("is_processing", False),
            "job": job_info,
            "remainingSeconds": remaining,
            "expiresAt": session["expires_at"]
        }


@app.post("/api/session/{session_id}/activity")
def api_session_activity(
    session_id: str,
    req: SessionActivityRequest,
    x_session_token: Optional[str] = Header(None)
):
    now = time.time()
    token = req.token or x_session_token

    with SESSION_LOCK:
        session = sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Security: protect session ownership
        if token and token != session["token"]:
            raise HTTPException(status_code=403, detail="Unauthorized session access")

        if now > session["expires_at"] or session["status"] == "expired":
            session["status"] = "expired"
            session["is_processing"] = False
            return JSONResponse(
                status_code=410,
                content={"status": "expired", "message": "This video session is no longer active."}
            )

        # Meaningful user activity extends the 5-minute session timer
        session["last_activity_at"] = now
        session["expires_at"] = now + SESSION_EXPIRATION_SECONDS

        if req.timestamps:
            session["timestamps"] = req.timestamps
        if req.quality:
            session["quality"] = req.quality
        if req.format:
            session["format"] = req.format

        remaining = int(session["expires_at"] - now)

    return {
        "status": "active",
        "sessionId": session_id,
        "remainingSeconds": remaining,
        "expiresAt": now + SESSION_EXPIRATION_SECONDS
    }


@app.post("/api/session/{session_id}/close")
def api_session_close(
    session_id: str,
    req: Optional[SessionCloseRequest] = None,
    x_session_token: Optional[str] = Header(None)
):
    token = (req.token if req else None) or x_session_token
    job_id = req.jobId if req else None

    with SESSION_LOCK:
        session = sessions.get(session_id)
        if session:
            if token and token != session["token"]:
                raise HTTPException(status_code=403, detail="Unauthorized")
            session["status"] = "closed"
            session["is_processing"] = False
            session["expires_at"] = time.time() - 1

    if job_id and job_id in jobs:
        jobs[job_id]["status"] = "cancelled"

    print(f"[Session Closed] ID: {session_id}")
    return {"status": "closed", "sessionId": session_id}


@app.get("/api/health")
def api_health():
    return {
        "status": "healthy",
        "version": "1.1.5",
        "engine": "youtube.py",
        "has_cookies": os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0,
        "has_proxy": bool(PROXY_ENV or os.path.exists(PROXIES_FILE)),
        "ffmpeg": FFMPEG_EXE,
        "ffmpeg_available": os.path.exists(FFMPEG_EXE) if os.path.isabs(FFMPEG_EXE) else True,
        "active_jobs": len([j for j in jobs.values() if j.get("status") in ["queued", "processing"]]),
        "channel_scraping_active": channel_status["is_running"]
    }


@app.get("/api/debug/test-clients")
def api_test_clients(url: str = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"):
    clients_to_test = [
        ["tv_embedded"],
        ["android_embedded"],
        ["android_creator"],
        ["android"],
        ["tv"],
        ["ios"],
        ["web"]
    ]
    results = {}
    for c in clients_to_test:
        name = "+".join(c)
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'skip_download': True,
                'extract_flat': False,
                'extractor_args': {
                    'youtube': {
                        'player_client': c,
                    }
                }
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                fmts = [f for f in info.get("formats", []) if f.get("vcodec") != "none"]
                results[name] = {"success": True, "formats": len(fmts), "resolutions": sorted(list(set([f.get("height") for f in fmts if f.get("height")])))[:5]}
        except Exception as e:
            results[name] = {"success": False, "error": str(e)[:150]}
    return results


@app.get("/api/debug/test-cookies")
def api_test_cookies(url: str = "https://www.youtube.com/watch?v=aqz-KE-bpKQ"):
    cookie_exists = os.path.exists(COOKIES_FILE)
    cookie_size = os.path.getsize(COOKIES_FILE) if cookie_exists else 0
    first_line = ""
    if cookie_exists:
        try:
            with open(COOKIES_FILE, "r", encoding="utf-8") as f:
                first_line = f.readline().strip()
        except Exception as e:
            first_line = f"Error reading: {e}"

    # Test extraction with cookies directly
    ydl_opts = get_ytdlp_opts({
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
    })
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = [f for f in info.get("formats", []) if f.get("vcodec") != "none"]
            return {
                "success": True,
                "title": info.get("title"),
                "cookie_file_exists": cookie_exists,
                "cookie_size_bytes": cookie_size,
                "first_line_preview": first_line[:50],
                "formats_count": len(formats),
                "resolutions": sorted(list(set([f.get("height") for f in formats if f.get("height")])))
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "cookie_file_exists": cookie_exists,
            "cookie_size_bytes": cookie_size,
            "first_line_preview": first_line[:50]
        }


@app.post("/api/analyze")
def api_analyze(req: AnalyzeRequest):
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    # If sessionId provided, validate session
    if req.sessionId:
        with SESSION_LOCK:
            sess = sessions.get(req.sessionId)
            if sess and sess.get("status") == "expired":
                raise HTTPException(status_code=410, detail="This video session has expired.")

    # Detect if user entered a channel URL
    channel_pattern = re.compile(r'(youtube\.com/(c/|channel/|user/|@)|youtu\.be/)', re.IGNORECASE)
    is_channel = bool(re.search(r'youtube\.com/(c/|channel/|user/|@[\w.-]+)', url, re.IGNORECASE))

    if is_channel:
        return {
            "isChannel": True,
            "channelUrl": url,
            "title": f"YouTube Channel ({url.split('/')[-1]})",
            "category": "others"
        }

    # Extract YouTube video metadata
    try:
        info = None
        last_extract_err = None
        for attempt in range(2):
            try:
                ydl_opts = get_ytdlp_opts({
                    'extract_flat': False,
                    'skip_download': True,
                    'quiet': True,
                    'no_warnings': True,
                }, use_cookies=(attempt == 1 and os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0))
                if FFMPEG_EXE and os.path.exists(FFMPEG_EXE):
                    ydl_opts['ffmpeg_location'] = FFMPEG_EXE

                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        break
            except Exception as e:
                last_extract_err = e
                continue

        if not info:
            raise last_extract_err or Exception("Failed to extract video information.")

        if True:
            title = info.get('title', 'Unknown Title')
            category = determine_category(title)
            duration = info.get('duration', 0)
            thumbnail = info.get('thumbnail')
            uploader = info.get('uploader') or info.get('channel') or 'YouTube Creator'
            video_id = info.get('id')

            # Discover available resolutions dynamically from real formats
            formats = info.get('formats', [])
            best_audio_size = 0
            best_audio_format_id = None
            has_audio = False
            for f in formats:
                # Filter out storyboard images (sb1, sb2, mhtml)
                if f.get('protocol') == 'mhtml' or f.get('ext') == 'mhtml':
                    continue
                if 'storyboard' in (f.get('format_note') or '').lower():
                    continue

                acodec = f.get('acodec')
                if acodec and acodec != 'none':
                    has_audio = True
                    sz = f.get('filesize') or f.get('filesize_approx') or 0
                    if sz > best_audio_size:
                        best_audio_size = sz
                        best_audio_format_id = f.get('format_id')
                    elif not best_audio_format_id:
                        best_audio_format_id = f.get('format_id')

            # Map resolutions dynamically based on real formats
            res_map = {}
            for f in formats:
                # Filter out storyboard images
                if f.get('protocol') == 'mhtml' or f.get('ext') == 'mhtml':
                    continue
                if 'storyboard' in (f.get('format_note') or '').lower():
                    continue

                vcodec = f.get('vcodec')
                if vcodec and vcodec != 'none':
                    w = f.get('width')
                    h = f.get('height')
                    # Support portrait/Shorts by taking minimum dimension (e.g. 1080x1920 is 1080p, not 1920p)
                    if w and h:
                        res = min(w, h)
                    elif h:
                        res = h
                    elif w:
                        res = w
                    else:
                        continue
                    if isinstance(res, int) and res >= 144:
                        res_map.setdefault(res, []).append(f)

            sorted_res = sorted(res_map.keys(), reverse=True)
            quality_options = []

            # If formats found, add "Best Available" option
            if sorted_res:
                quality_options.append({
                    "id": "best",
                    "label": "Best Available",
                    "res": sorted_res[0],
                    "desc": f"Optimal quality ({sorted_res[0]}p)",
                    "badge": "Auto",
                    "ext": "mp4",
                    "isAudio": False,
                    "fileSizeMb": None
                })

            label_map = {
                2160: ("2160p", "4K", "Ultra HD"),
                1440: ("1440p", "2K", "Quad HD"),
                1080: ("1080p", "Full HD", "1080p"),
                720: ("720p", "HD", "720p"),
                480: ("480p", "SD", "480p"),
                360: ("360p", "SD", "360p"),
                240: ("240p", "SD", "240p"),
                144: ("144p", "Low", "144p"),
            }

            # Choose default: 1080p if available, else top available resolution, or 'best'
            default_res = 1080 if 1080 in sorted_res else (sorted_res[0] if sorted_res else "best")
            default_quality_id = str(default_res)

            for res in sorted_res:
                matching_formats = res_map[res]
                max_s = 0
                best_f = matching_formats[0]
                for f in matching_formats:
                    s = f.get('filesize') or f.get('filesize_approx') or 0
                    if s > max_s:
                        max_s = s
                        best_f = f
                    elif max_s == 0 and f.get('ext') == 'mp4':
                        best_f = f

                tot_size = max_s
                if best_f.get('acodec') == 'none' and best_audio_size > 0:
                    tot_size += best_audio_size

                size_mb = round(tot_size / (1024 * 1024), 1) if tot_size > 0 else None

                if res in label_map:
                    lbl, bdg, dsc = label_map[res]
                else:
                    lbl = f"{res}p"
                    bdg = f"{res}p"
                    dsc = f"{res}p"

                vcodec = best_f.get('vcodec') or ''
                codec_clean = 'H.264' if 'avc' in vcodec else ('VP9' if 'vp9' in vcodec else ('AV1' if 'av01' in vcodec else 'MP4'))

                quality_options.append({
                    "id": str(res),
                    "res": res,
                    "label": lbl,
                    "badge": bdg,
                    "desc": dsc,
                    "ext": "mp4",
                    "codec": codec_clean,
                    "fileSizeMb": size_mb,
                    "isAudio": False,
                    "videoFormatId": best_f.get('format_id'),
                    "audioFormatId": best_audio_format_id,
                    "isDefault": str(res) == default_quality_id
                })

            if has_audio:
                audio_mb = round(best_audio_size / (1024 * 1024), 1) if best_audio_size > 0 else None
                quality_options.append({
                    "id": "mp3",
                    "label": "MP3 Audio",
                    "desc": "192 kbps",
                    "badge": "Audio",
                    "ext": "mp3",
                    "codec": "MP3",
                    "fileSizeMb": audio_mb,
                    "isAudio": True,
                    "audioFormatId": best_audio_format_id,
                    "isDefault": False
                })

            if not quality_options:
                raise HTTPException(status_code=422, detail="No compatible video qualities were found.")

            return {
                "isChannel": False,
                "videoId": video_id,
                "title": title,
                "author": uploader,
                "duration": duration,
                "thumbnail": thumbnail,
                "category": category,
                "defaultQuality": default_quality_id,
                "qualities": quality_options,
                "url": url
            }
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        print(f"[Analyze Error] {err_str}")
        if "unavailable" in err_str.lower() or "private" in err_str.lower():
            detail = "This video is unavailable or private."
        elif "unsupported" in err_str.lower() or "not a valid url" in err_str.lower():
            detail = "This video URL is not supported."
        elif "too many requests" in err_str.lower() or "rate" in err_str.lower() or "429" in err_str:
            detail = "Too many requests. Please try again shortly."
        elif "no formats" in err_str.lower():
            detail = "No compatible video qualities were found."
        else:
            detail = f"Unable to analyze this video: {err_str}"
        raise HTTPException(status_code=400, detail=detail)


def process_download_job(job_id: str, req_data: Dict[str, Any]):
    job = jobs[job_id]
    job["step"] = f"Queued in worker pool (Concurrency limit: {MAX_CONCURRENT_DOWNLOADS})..."

    with DOWNLOAD_SEMAPHORE:
        url = req_data.get("url")
        is_clip = req_data.get("isClip", False)
        start_time = float(req_data.get("start") or 0.0)
        end_time = float(req_data.get("end") or 0.0)
        user_category = req_data.get("category")
        quality = str(req_data.get("quality", "1080"))
        is_audio = quality == "mp3" or quality == "audio"
        job["quality"] = quality
        job["isAudio"] = is_audio

        try:
            job["status"] = "processing"
            job["progress"] = 10
            job["step"] = "Worker slot allocated. Preparing download..."

            # Extract info with rotating proxy if enabled
            title = req_data.get("title")
            if not title:
                ydl_info_opts = get_ytdlp_opts({
                    'extract_flat': False,
                    'skip_download': True,
                    'quiet': True,
                    'no_warnings': True,
                })
                if FFMPEG_EXE and os.path.exists(FFMPEG_EXE):
                    ydl_info_opts['ffmpeg_location'] = FFMPEG_EXE

                try:
                    with yt_dlp.YoutubeDL(ydl_info_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                        title = info.get('title', 'video')
                except Exception:
                    title = "video"
            clean_title = re.sub(r'[\\/*?:"<>|]', '', title).strip()

            # Determine category
            category = user_category or determine_category(title)
            job["category"] = category
            job["title"] = title
            output_dir = os.path.join(DOWNLOAD_PATH, category)
            os.makedirs(output_dir, exist_ok=True)

            job["progress"] = 25

            # Progress hook
            def ydl_progress_hook(d):
                if d['status'] == 'downloading':
                    total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                    downloaded = d.get('downloaded_bytes', 0)
                    if total > 0:
                        pct = int((downloaded / total) * 60)
                        job["progress"] = min(88, 30 + pct)
                    if use_section_download:
                        job["step"] = f"Downloading clip segment ({int(start_time)}s - {int(end_time)}s)..."
                    else:
                        job["step"] = "Downloading media stream..."
                elif d['status'] == 'finished':
                    job["progress"] = 90
                    job["step"] = "Muxing and finalizing media..."

            # Configure yt-dlp format by selected quality
            postprocessors = []
            if is_audio:
                ydl_format = 'ba/b'
                postprocessors.append({
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                })
            else:
                try:
                    h_int = int(quality)
                    ydl_format = f'bestvideo[height<={h_int}]+bestaudio/best[height<={h_int}] / bestvideo+bestaudio / best'
                except Exception:
                    ydl_format = 'bestvideo+bestaudio/best'

            use_section_download = is_clip and end_time > start_time
            temp_video_pattern = os.path.join(TEMP_PATH, f"{job_id}_raw.%(ext)s")
            ffmpeg_dir = os.path.dirname(FFMPEG_EXE) if FFMPEG_EXE and os.path.isabs(FFMPEG_EXE) else None
            ydl_opts = get_ytdlp_opts({
                'format': ydl_format,
                'outtmpl': temp_video_pattern,
                'merge_output_format': 'mp4' if (not is_audio and not use_section_download) else None,
                'postprocessors': postprocessors if not use_section_download else [],
                'progress_hooks': [ydl_progress_hook],
            })
            if ffmpeg_dir and os.path.exists(ffmpeg_dir):
                ydl_opts['ffmpeg_location'] = ffmpeg_dir
            elif FFMPEG_EXE and os.path.exists(FFMPEG_EXE):
                ydl_opts['ffmpeg_location'] = FFMPEG_EXE

            if use_section_download:
                ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, [(start_time, end_time)])
                ydl_opts['force_keyframes_at_cuts'] = False

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as dl_err:
                # If range download fails or specific format fails, fallback to direct stream clipping without ever downloading the full video
                print(f"[Download Error] Initial download failed: {dl_err}. Falling back to direct segment cutting...")
                if use_section_download:
                    try:
                        ydl_info_opts = get_ytdlp_opts({'extract_flat': False, 'skip_download': True, 'quiet': True, 'no_warnings': True})
                        with yt_dlp.YoutubeDL(ydl_info_opts) as ydl_info:
                            v_info = ydl_info.extract_info(url, download=False)
                        fmts = v_info.get('formats', [])
                        proxy = ydl_info_opts.get('proxy')
                        direct_out = os.path.join(TEMP_PATH, f"{job_id}_raw.mp4" if not is_audio else f"{job_id}_raw.mp3")
                        if is_audio:
                            a_cands = [f for f in fmts if f.get('acodec') != 'none' and f.get('url')]
                            a_direct = [f for f in a_cands if 'videoplayback' in f.get('url', '')]
                            a_f = a_direct[0] if a_direct else (a_cands[0] if a_cands else None)
                            if not a_f:
                                raise Exception("No audio stream URL available.")
                            cmd = [FFMPEG_EXE, "-y", "-protocol_whitelist", "file,crypto,data,http,https,tcp,tls"]
                            if proxy:
                                cmd.extend(["-http_proxy", proxy])
                            cmd.extend(["-ss", str(start_time), "-to", str(end_time), "-i", a_f['url'], "-c:a", "libmp3lame", "-b:a", "192k", direct_out])
                        else:
                            h_target = int(quality) if quality.isdigit() else 1080
                            v_cands = [f for f in fmts if f.get('vcodec') != 'none' and f.get('height') and f.get('height') <= h_target and f.get('url')]
                            v_direct = [f for f in v_cands if 'videoplayback' in f.get('url', '')]
                            v_f = max(v_direct, key=lambda f: f.get('height', 0)) if v_direct else (max(v_cands, key=lambda f: f.get('height', 0)) if v_cands else next((f for f in fmts if f.get('vcodec') != 'none' and f.get('url')), None))
                            a_cands = [f for f in fmts if f.get('acodec') != 'none' and f.get('vcodec') == 'none' and f.get('url')]
                            a_direct = [f for f in a_cands if 'videoplayback' in f.get('url', '')]
                            a_f = a_direct[0] if a_direct else (a_cands[0] if a_cands else None)
                            if not v_f:
                                raise Exception("No video stream URL available.")
                            cmd = [FFMPEG_EXE, "-y", "-protocol_whitelist", "file,crypto,data,http,https,tcp,tls"]
                            if proxy:
                                cmd.extend(["-http_proxy", proxy])
                            cmd.extend(["-ss", str(start_time), "-to", str(end_time), "-i", v_f['url']])
                            if a_f and a_f.get('url'):
                                if proxy:
                                    cmd.extend(["-http_proxy", proxy])
                                cmd.extend(["-ss", str(start_time), "-to", str(end_time), "-i", a_f['url']])
                            cmd.extend(["-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", direct_out])
                        
                        job["step"] = f"Directly cutting segment ({int(start_time)}s - {int(end_time)}s)..."
                        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        if res.returncode != 0:
                            raise Exception(f"Direct stream cutting failed: {res.stderr[-500:]}")
                    except Exception as fallback_err:
                        raise Exception(f"Clip extraction failed: {dl_err} | Fallback: {fallback_err}")
                else:
                    raise dl_err

            # Locate downloaded media
            candidates = [os.path.join(TEMP_PATH, f) for f in os.listdir(TEMP_PATH) if f.startswith(f"{job_id}_raw")]
            if not candidates:
                raise Exception("Downloaded media file could not be found.")
            actual_downloaded = candidates[0]

            job["progress"] = 92
            job["step"] = "Finalizing video clip with FFmpeg..."

            if is_clip and end_time > start_time:
                if is_audio:
                    clip_filename = f"{clean_title}_clip_{int(start_time)}s_{int(end_time)}s.mp3"
                    final_file_path = os.path.join(output_dir, clip_filename)
                    
                    # If section download already produced the final audio file directly
                    if actual_downloaded.endswith('.mp3') and use_section_download:
                        shutil.move(actual_downloaded, final_file_path)
                    else:
                        cmd = [
                            FFMPEG_EXE,
                            "-y",
                            "-ss", str(start_time),
                            "-to", str(end_time),
                            "-i", actual_downloaded,
                            "-c:a", "libmp3lame",
                            "-b:a", "192k",
                            final_file_path
                        ]
                        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        if res.returncode != 0:
                            raise Exception(f"FFmpeg audio clipping failed: {res.stderr[:300]}")
                else:
                    q_suffix = f"_{quality}p" if quality.isdigit() else f"_{quality}"
                    clip_filename = f"{clean_title}_clip_{int(start_time)}s_{int(end_time)}s{q_suffix}.mp4"
                    final_file_path = os.path.join(output_dir, clip_filename)

                    # If section download was used, yt-dlp already cut the section accurately
                    if use_section_download and os.path.exists(actual_downloaded) and os.path.getsize(actual_downloaded) > 1024:
                        if actual_downloaded.lower().endswith('.mp4'):
                            shutil.move(actual_downloaded, final_file_path)
                        else:
                            # Remux/transcode into standard universal MP4
                            job["step"] = "Finalizing MP4 container..."
                            remux_cmd = [
                                FFMPEG_EXE, "-y", "-i", actual_downloaded,
                                "-c:v", "copy",
                                "-c:a", "aac", "-b:a", "192k",
                                "-movflags", "+faststart", final_file_path
                            ]
                            res = subprocess.run(remux_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                            if res.returncode != 0 or not os.path.exists(final_file_path) or os.path.getsize(final_file_path) < 1024:
                                encode_cmd = [
                                    FFMPEG_EXE, "-y", "-i", actual_downloaded,
                                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                                    "-c:a", "aac", "-b:a", "192k",
                                    "-movflags", "+faststart", final_file_path
                                ]
                                res = subprocess.run(encode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                                if res.returncode != 0:
                                    shutil.move(actual_downloaded, final_file_path)
                    else:
                        # Attempt ultra-fast stream copy first (sub-second completion)
                        job["progress"] = 94
                        copy_cmd = [
                            FFMPEG_EXE,
                            "-y",
                            "-ss", str(start_time),
                            "-to", str(end_time),
                            "-i", actual_downloaded,
                            "-c", "copy",
                            "-movflags", "+faststart",
                            final_file_path
                        ]
                        res = subprocess.run(copy_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

                        # If copy failed or generated an unplayable/empty file, fallback to ultrafast x264 encode
                        if res.returncode != 0 or not os.path.exists(final_file_path) or os.path.getsize(final_file_path) < 1024:
                            job["progress"] = 96
                            job["step"] = "Encoding clip (ultrafast)..."
                            encode_cmd = [
                                FFMPEG_EXE,
                                "-y",
                                "-ss", str(start_time),
                                "-to", str(end_time),
                                "-i", actual_downloaded,
                                "-c:v", "libx264",
                                "-preset", "ultrafast",
                                "-crf", "22",
                                "-c:a", "aac",
                                "-movflags", "+faststart",
                                final_file_path
                            ]
                            res = subprocess.run(encode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                            if res.returncode != 0:
                                raise Exception(f"FFmpeg clipping failed: {res.stderr[:300]}")

                if os.path.exists(actual_downloaded):
                    try:
                        os.remove(actual_downloaded)
                    except Exception:
                        pass
            else:
                if is_audio:
                    final_filename = f"{clean_title}.mp3"
                    final_file_path = os.path.join(output_dir, final_filename)
                    shutil.move(actual_downloaded, final_file_path)
                else:
                    q_suffix = f"_{quality}p" if quality.isdigit() else f"_{quality}"
                    final_filename = f"{clean_title}{q_suffix}.mp4"
                    final_file_path = os.path.join(output_dir, final_filename)
                    if actual_downloaded.lower().endswith('.mp4'):
                        shutil.move(actual_downloaded, final_file_path)
                    else:
                        job["step"] = "Finalizing MP4 container..."
                        remux_cmd = [
                            FFMPEG_EXE, "-y", "-i", actual_downloaded,
                            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22",
                            "-c:a", "aac", "-b:a", "192k",
                            "-movflags", "+faststart", final_file_path
                        ]
                        res = subprocess.run(remux_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                        if res.returncode != 0:
                            shutil.move(actual_downloaded, final_file_path)
                        else:
                            try:
                                os.remove(actual_downloaded)
                            except Exception:
                                pass

            job["progress"] = 100
            job["step"] = "Completed"
            job["status"] = "completed"
            job["filePath"] = final_file_path
            job["fileName"] = os.path.basename(final_file_path)
            job["downloadUrl"] = f"/api/clips/{job_id}/download"
            job["category"] = category
            job["mediaType"] = "audio/mpeg" if is_audio else "video/mp4"

        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e)
        finally:
            # Clear session processing flag if session exists
            session_id = req_data.get("sessionId")
            if session_id and session_id in sessions:
                try:
                    with SESSION_LOCK:
                        sessions[session_id]["is_processing"] = False
                except Exception:
                    pass


@app.post("/api/clips")
def api_create_clip_job(
    req: ClipJobRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    x_session_token: Optional[str] = Header(None)
):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"clip_create_{client_ip}", max_requests=15, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many clip creation requests. Please wait a moment.")

    # Concurrency Protection: Check active queued/processing jobs against MAX_CONCURRENT_DOWNLOADS
    active_jobs = [j for j in jobs.values() if j.get("status") in ["queued", "processing"]]
    if len(active_jobs) >= MAX_CONCURRENT_DOWNLOADS:
        raise HTTPException(
            status_code=429,
            detail="Processing is currently busy. Please try again shortly."
        )

    # Session ownership & Duplicate Protection
    target_url = req.url
    if req.sessionId:
        with SESSION_LOCK:
            session = sessions.get(req.sessionId)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found or invalid.")

            token = req.sessionToken or x_session_token
            if token and token != session["token"]:
                raise HTTPException(status_code=403, detail="Unauthorized session access.")

            if time.time() > session["expires_at"] or session["status"] == "expired":
                raise HTTPException(status_code=410, detail="This video session is no longer active.")

            # Duplicate Request Protection
            if session.get("is_processing"):
                existing_job_id = session.get("job_id")
                if existing_job_id and existing_job_id in jobs:
                    existing_status = jobs[existing_job_id].get("status")
                    if existing_status in ["queued", "processing"]:
                        raise HTTPException(
                            status_code=409,
                            detail="A clip is already being created for this session."
                        )

            # Mark session as currently processing and reset activity timer
            session["is_processing"] = True
            session["last_activity_at"] = time.time()
            session["expires_at"] = time.time() + SESSION_EXPIRATION_SECONDS
            if not target_url:
                target_url = session["video_url"]

    if not target_url:
        raise HTTPException(status_code=400, detail="Video URL is required")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "step": "Queued in processing engine...",
        "error": None,
        "url": target_url,
        "category": req.category,
        "isClip": req.isClip,
        "sessionId": req.sessionId
    }

    if req.sessionId and req.sessionId in sessions:
        with SESSION_LOCK:
            sessions[req.sessionId]["job_id"] = job_id

    req_dict = req.dict()
    req_dict["url"] = target_url
    background_tasks.add_task(process_download_job, job_id, req_dict)

    return {
        "jobId": job_id,
        "status": "queued"
    }


@app.get("/api/clips/{job_id}")
def api_get_clip_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    return {
        "jobId": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "step": job.get("step", ""),
        "error": job.get("error"),
        "fileName": job.get("fileName"),
        "category": job.get("category"),
        "title": job.get("title"),
        "quality": job.get("quality"),
        "isAudio": job.get("isAudio"),
        "downloadUrl": job.get("downloadUrl")
    }


@app.delete("/api/clips/{job_id}")
def api_delete_clip_job(job_id: str):
    if job_id in jobs:
        jobs[job_id]["status"] = "cancelled"
        file_path = jobs[job_id].get("filePath")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    # Purge any associated temp files immediately
    if os.path.exists(TEMP_PATH):
        for fname in os.listdir(TEMP_PATH):
            if job_id in fname:
                try:
                    os.remove(os.path.join(TEMP_PATH, fname))
                except Exception:
                    pass
    return {"status": "cancelled", "jobId": job_id}


class SessionCleanupPayload(BaseModel):
    sessionId: Optional[str] = None
    jobId: Optional[str] = None

@app.post("/api/session/cleanup")
def api_session_cleanup(payload: SessionCleanupPayload):
    """
    Cleans up resources when a user leaves the page, refreshes, or times out after 5 minutes.
    """
    job_id = payload.jobId
    session_id = payload.sessionId
    
    if job_id and job_id in jobs:
        jobs[job_id]["status"] = "cancelled"
        file_path = jobs[job_id].get("filePath")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass

    target_tokens = [t for t in [job_id, session_id] if t]
    if target_tokens and os.path.exists(TEMP_PATH):
        for fname in os.listdir(TEMP_PATH):
            for token in target_tokens:
                if token in fname:
                    try:
                        os.remove(os.path.join(TEMP_PATH, fname))
                    except Exception:
                        pass
    return {"status": "cleaned", "sessionId": session_id, "jobId": job_id}


@app.get("/api/clips/{job_id}/download")
def api_download_clip_file(job_id: str, background_tasks: BackgroundTasks):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job = jobs[job_id]
    file_path = job.get("filePath")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Processed file not found")

    file_name = job.get("fileName") or os.path.basename(file_path)
    media_type = job.get("mediaType", "video/mp4")
    
    # Schedule post-delivery cleanup (after 60 seconds) so server disk space is automatically freed
    background_tasks.add_task(delayed_file_cleanup, file_path, delay_seconds=60)
    
    return FileResponse(file_path, filename=file_name, media_type=media_type)


@app.post("/api/channel/download")
def api_channel_download(req: ChannelDownloadRequest, background_tasks: BackgroundTasks):
    if channel_status["is_running"]:
        return {"message": "Channel scraping already in progress", "status": channel_status}

    background_tasks.add_task(download_channel_videos, req.channel_url, DOWNLOAD_PATH, req.start_from or 0)
    return {
        "message": "Channel batch download started",
        "channel_url": req.channel_url,
        "status": "started"
    }


@app.get("/api/channel/status")
def api_get_channel_status():
    return channel_status


@app.get("/api/downloads")
def api_list_downloads():
    results = []
    if os.path.exists(DOWNLOAD_PATH):
        for category in os.listdir(DOWNLOAD_PATH):
            cat_dir = os.path.join(DOWNLOAD_PATH, category)
            if os.path.isdir(cat_dir):
                for fname in os.listdir(cat_dir):
                    fpath = os.path.join(cat_dir, fname)
                    if os.path.isfile(fpath):
                        size_mb = round(os.path.getsize(fpath) / (1024 * 1024), 2)
                        results.append({
                            "fileName": fname,
                            "category": category,
                            "sizeMb": size_mb,
                            "filePath": fpath,
                            "downloadUrl": f"/api/files/{category}/{fname}"
                        })
    return {"downloads": results, "total": len(results)}


@app.get("/api/files/{category}/{filename}")
def api_download_saved_file(category: str, filename: str):
    target = os.path.join(DOWNLOAD_PATH, category, filename)
    if not os.path.exists(target):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=filename, media_type="video/mp4")


@app.post("/api/upload")
async def api_upload_media(file: UploadFile = File(...)):
    temp_filename = f"{uuid.uuid4()}_{file.filename}"
    temp_dest = os.path.join(TEMP_PATH, temp_filename)
    with open(temp_dest, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    return {
        "sourceRef": temp_filename,
        "fileName": file.filename,
        "mediaUrl": f"/preview-media/{temp_filename}"
    }


@app.get("/preview-media/{filename}")
def api_preview_media(filename: str):
    file_path = os.path.join(TEMP_PATH, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Media not found")
    return FileResponse(file_path, media_type="video/mp4")


# ---------------------------------------------------------
# CLI & Execution Entry Point
# ---------------------------------------------------------
def main():
    # List of channel URLs to process in CLI mode
    channels = [
        # "https://www.youtube.com/@CareerGenie1/shorts"
    ]

    # If channel URLs are specified or --cli flag passed, run scraping in CLI mode
    if len(sys.argv) > 1 and sys.argv[1] == "--cli" or len(channels) > 0:
        download_path = os.path.join(os.getcwd(), "downloads")
        for channel_url in channels:
            print(f"\nProcessing channel via CLI: {channel_url}")
            try:
                download_channel_videos(channel_url, download_path)
            except Exception as e:
                print(f"Error processing channel {channel_url}: {str(e)}")
                continue
    else:
        # Boot FastAPI Backend Server on port 3001
        print("=" * 60)
        print("Starting YouTube-Video-Downloader Backend (FastAPI + yt-dlp)")
        print(f"Base Directory: {BASE_DIR}")
        print(f"Downloads Path: {DOWNLOAD_PATH}")
        # Start background cleanup daemon for automatic file retention
        start_background_cleanup_daemon()
        print(f"[Auto-Cleanup] File retention cleaner active (Interval: 3m, Retention: {FILE_RETENTION_MINUTES}m)")
        print(f"[Concurrency] Max concurrent worker limit: {MAX_CONCURRENT_DOWNLOADS}")
        proxy_count = len([p for p in PROXY_ENV.split(",") if p.strip()]) if PROXY_ENV else 0
        if os.path.exists(PROXIES_FILE):
            try:
                with open(PROXIES_FILE, "r") as f:
                    proxy_count += len([l for l in f if l.strip() and not l.startswith("#")])
            except Exception:
                pass
        server_host = os.environ.get("HOST", "0.0.0.0")
        server_port = int(os.environ.get("PORT", 3001))
        uvicorn.run(app, host=server_host, port=server_port, log_level="info")


if __name__ == "__main__":
    main()
