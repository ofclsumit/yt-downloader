"""
Media Processing Engine for Render Background Worker.
Implements yt-dlp section-aware downloading and FFmpeg frame-accurate trimming.
"""
import os
import re
import json
import shutil
import logging
import tempfile
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from datetime import datetime, timezone, timedelta
from contextlib import contextmanager
import yt_dlp

from worker import config
from worker import db
from worker import storage
from worker import diagnostics

logger = logging.getLogger("worker.processor")

CLIENT_STRATEGIES_NO_COOKIES = [
    {
        "name": "visionos",
        "player_client": ['visionos'],
    },
    {
        "name": "tv_embedded",
        "player_client": ['tv_embedded'],
    },
    {
        "name": "android_creator",
        "player_client": ['android_creator'],
    },
    {
        "name": "android_music",
        "player_client": ['android_music'],
    },
    {
        "name": "web_embedded",
        "player_client": ['web_embedded', 'default', '-tv_downgraded', 'android'],
    },
    {
        "name": "android",
        "player_client": ['android'],
    },
    {
        "name": "default",
        "player_client": ['default', '-tv_downgraded'],
    },
]

CLIENT_STRATEGIES_WITH_COOKIES = [
    {
        "name": "visionos",
        "player_client": ['visionos'],
    },
    {
        "name": "web",
        "player_client": ['web', 'default'],
    },
    {
        "name": "web_embedded",
        "player_client": ['web_embedded', 'default', '-tv_downgraded'],
    },
    {
        "name": "mweb",
        "player_client": ['mweb'],
    },
    {
        "name": "tv_embedded",
        "player_client": ['tv_embedded'],
    },
    {
        "name": "android",
        "player_client": ['android'],
    },
]

def get_client_strategies(has_cookies: bool = False):
    return CLIENT_STRATEGIES_WITH_COOKIES if has_cookies else CLIENT_STRATEGIES_NO_COOKIES

CLIENT_STRATEGIES = CLIENT_STRATEGIES_NO_COOKIES

def probe_media_file(file_path: str) -> Dict[str, Any]:
    """
    Independently inspects an MP4/media file using FFprobe or FFmpeg.
    Returns:
    {
        "duration": float,
        "has_video": bool,
        "has_audio": bool,
        "video_codec": Optional[str],
        "audio_codec": Optional[str],
        "container": str
    }
    """
    path_obj = Path(file_path)
    if not path_obj.exists() or path_obj.stat().st_size == 0:
        return {
            "duration": 0.0,
            "has_video": False,
            "has_audio": False,
            "video_codec": None,
            "audio_codec": None,
            "container": "unknown"
        }

    # 1. Attempt ffprobe JSON output if available
    ffprobe_bin = getattr(config, "FFPROBE_EXE", "ffprobe")
    resolved_ffprobe = shutil.which(ffprobe_bin) or (ffprobe_bin if Path(ffprobe_bin).exists() else None)
    if resolved_ffprobe:
        try:
            cmd = [
                resolved_ffprobe,
                "-v", "error",
                "-show_entries", "format=duration,format_name",
                "-show_streams",
                "-of", "json",
                str(file_path)
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
            if res.returncode == 0 and res.stdout:
                data = json.loads(res.stdout)
                streams = data.get("streams", [])
                has_video = any(s.get("codec_type") == "video" for s in streams)
                has_audio = any(s.get("codec_type") == "audio" for s in streams)
                video_codec = next((s.get("codec_name") for s in streams if s.get("codec_type") == "video"), None)
                audio_codec = next((s.get("codec_name") for s in streams if s.get("codec_type") == "audio"), None)
                duration = float(data.get("format", {}).get("duration") or 0.0)
                container = data.get("format", {}).get("format_name", "mp4")
                return {
                    "duration": duration,
                    "has_video": has_video,
                    "has_audio": has_audio,
                    "video_codec": video_codec,
                    "audio_codec": audio_codec,
                    "container": container,
                }
        except Exception:
            pass

    # 2. Universal FFmpeg -i fallback parser
    res = subprocess.run(
        [config.FFMPEG_EXE, "-i", str(file_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=10
    )
    out = res.stderr or ""
    dur = 0.0
    dur_match = re.search(r'Duration:\s*(\d+):(\d+):(\d+\.\d+)', out)
    if dur_match:
        h, m, s = [float(x) for x in dur_match.groups()]
        dur = h * 3600 + m * 60 + s

    has_video = "Video:" in out
    has_audio = "Audio:" in out
    v_match = re.search(r'Stream #\d+:\d+.*Video:\s*(\w+)', out)
    a_match = re.search(r'Stream #\d+:\d+.*Audio:\s*(\w+)', out)
    video_codec = v_match.group(1) if v_match else ("h264" if has_video else None)
    audio_codec = a_match.group(1) if a_match else ("aac" if has_audio else None)

    return {
        "duration": dur,
        "has_video": has_video,
        "has_audio": has_audio,
        "video_codec": video_codec,
        "audio_codec": audio_codec,
        "container": "mp4",
    }

class YtDlpDiagnosticLogger:
    """Captures yt-dlp stderr, stdout, warnings, and errors for sanitized diagnostic reporting."""
    def __init__(self):
        self.stderr_lines = []
        self.stdout_lines = []

    def debug(self, msg):
        self.stdout_lines.append(str(msg))

    def info(self, msg):
        self.stdout_lines.append(str(msg))

    def warning(self, msg):
        self.stderr_lines.append(f"WARNING: {msg}")

    def error(self, msg):
        self.stderr_lines.append(f"ERROR: {msg}")

    def get_stderr(self) -> str:
        return "\n".join(self.stderr_lines)

    def get_stdout(self) -> str:
        return "\n".join(self.stdout_lines)

def sanitize_log_message(msg: str) -> str:
    """Redacts any sensitive paths, cookie file references, or tokens from log messages."""
    return diagnostics.sanitize_diagnostic_text(msg)

@contextmanager
def scoped_cookie_file(target_dir: Optional[Path] = None):
    """
    Safely writes temporary cookie credentials inside the job directory with 0600 permissions.
    Guarantees deletion in finally: block.
    Never exposes cookie path or contents to logs, database, Redis, or R2.
    """
    cookie_content = config.get_cookie_content()
    if not cookie_content:
        yield None
        return

    cookie_path = None
    try:
        if target_dir:
            target_dir.mkdir(parents=True, exist_ok=True)
            cookie_path = target_dir / ".job_cookies.txt"
        else:
            fd, tmp_p = tempfile.mkstemp(prefix="yt_cookie_", suffix=".txt")
            os.close(fd)
            cookie_path = Path(tmp_p)

        cookie_path.write_text(cookie_content, encoding="utf-8")
        try:
            os.chmod(cookie_path, 0o600)
        except Exception:
            pass
        yield str(cookie_path)
    finally:
        if cookie_path and cookie_path.exists():
            try:
                os.remove(cookie_path)
            except Exception:
                pass

class MediaProcessingError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

def classify_ytdlp_error(err_str: str) -> Tuple[str, str]:
    """
    Classifies raw yt-dlp error output into standardized error codes:
    - JS_RUNTIME_MISSING
    - EJS_MISSING
    - COOKIE_NOT_USED
    - COOKIE_INVALID
    - COOKIE_EXPIRED
    - PO_TOKEN_REQUIRED
    - BOT_DETECTION
    - LOGIN_REQUIRED
    - VIDEO_AGE_RESTRICTED
    - VIDEO_PRIVATE
    - VIDEO_REGION_RESTRICTED
    - VIDEO_UNAVAILABLE
    - FORMAT_ERROR
    - RATE_LIMITED
    - NETWORK_ERROR
    - YTDLP_ERROR
    - UNKNOWN_ERROR
    """
    lower = err_str.lower()

    # 1. JS Runtime Missing
    if any(k in lower for k in [
        "no supported javascript runtime could be found",
        "js runtime missing",
        "no supported js runtime",
        "supported_js_runtimes",
        "install a supported js runtime",
        "javascript runtime is required",
        "runtime could be found",
    ]):
        return (
            "JS_RUNTIME_MISSING",
            "JavaScript runtime (Deno/Node.js) is missing on the worker. Administrator must verify runtime."
        )

    # 2. EJS Component Missing
    if any(k in lower for k in [
        "yt-dlp-ejs is required",
        "missing ejs",
        "ejs not found",
        "no ejs component",
        "install yt-dlp-ejs",
        "ejs provider",
    ]):
        return (
            "EJS_MISSING",
            "YouTube challenge solver component (yt-dlp-ejs) is missing. Administrator must install yt-dlp-ejs."
        )

    # 3. Cookies Not Used / Ignored
    if any(k in lower for k in [
        "cookie file not found",
        "cookies were not used",
        "cookie not used",
        "cookies are ignored",
        "failed to load cookies",
        "ignoring cookies",
        "cookie file empty",
    ]):
        return (
            "COOKIE_NOT_USED",
            "The configured cookie file was not accepted or loaded by yt-dlp."
        )

    # 4. Cookies Invalid
    if any(k in lower for k in [
        "could not parse cookies",
        "cookie is invalid",
        "invalid cookie",
        "malformed cookie",
        "cookies cannot be parsed",
        "cookie format",
    ]):
        return (
            "COOKIE_INVALID",
            "The configured YouTube cookie session is invalid or malformed. Please verify cookies.txt format."
        )

    # 5. Cookies Expired
    if any(k in lower for k in [
        "cookie has expired",
        "expired cookie",
        "login expired",
        "session expired",
        "account suspended",
        "re-authenticate",
    ]):
        return (
            "COOKIE_EXPIRED",
            "The YouTube cookie session has expired. Please re-export active cookies from your browser."
        )

    # 6. PO Token / Proof of Origin Required
    if any(k in lower for k in [
        "po token",
        "po_token",
        "potoken",
        "proof of origin",
        "visitordata",
        "visitor_data",
        "gvs token",
    ]):
        return (
            "PO_TOKEN_REQUIRED",
            "YouTube requires a Proof of Origin (PO) token for automated requests from datacenter IPs."
        )

    # 7. YouTube Bot Detection / Captcha
    bot_triggers = [
        "sign in to confirm you’re not a bot",
        "sign in to confirm you're not a bot",
        "confirm you're not a bot",
        "confirm you’re not a bot",
        "not a bot",
        "captcha",
        "bot verification",
        "bot check",
        "automated requests",
        "unusual traffic",
    ]
    if any(t in lower for t in bot_triggers):
        return (
            "BOT_DETECTION",
            "YouTube is currently blocking automated requests from the processing server. The administrator needs to configure a valid yt-dlp cookie session."
        )

    # 8. Login Required (Members-only, paid, private requiring login)
    if any(k in lower for k in [
        "sign in to view this video",
        "this video requires payment",
        "this video is only available to",
        "members-only",
        "join this channel to get access",
        "login required",
        "sign in with your google account",
    ]):
        return (
            "LOGIN_REQUIRED",
            "YouTube sign-in is required to view this video."
        )

    # 9. Age Restricted
    if any(k in lower for k in [
        "sign in to confirm your age",
        "age-restricted",
        "requires age verification",
        "content warning",
    ]):
        return (
            "VIDEO_AGE_RESTRICTED",
            "This video is age-restricted and requires account verification."
        )

    # 10. Private Video
    if any(k in lower for k in [
        "private video",
        "sign in if you've been granted access",
        "this is a private video",
    ]):
        return (
            "VIDEO_PRIVATE",
            "This video is private and cannot be processed."
        )

    # 11. Region / Geo Restricted
    if any(k in lower for k in [
        "not available in your country",
        "geo-restricted",
        "geographically restricted",
        "who has blocked it in your country",
        "country restrictions",
    ]):
        return (
            "VIDEO_REGION_RESTRICTED",
            "This video is geographically restricted and unavailable in the processing region."
        )

    # 12. Video Unavailable / Deleted
    if any(k in lower for k in [
        "video unavailable",
        "this video does not exist",
        "video has been removed",
        "deleted video",
        "no longer available",
    ]):
        return (
            "VIDEO_UNAVAILABLE",
            "This video is unavailable or has been removed."
        )

    # 13. Format Error
    if any(k in lower for k in [
        "requested format is not available",
        "the page needs to be reloaded",
        "no matching formats",
        "format not found",
        "unplayable",
    ]):
        return (
            "FORMAT_ERROR",
            "Requested video format stream is not available from YouTube."
        )

    # 14. Rate Limited (HTTP 429)
    if any(k in lower for k in [
        "too many requests",
        "http error 429",
        "rate-limit",
        "rate limited",
        "429 too many requests",
    ]):
        return (
            "RATE_LIMITED",
            "YouTube rate-limited automated requests. Please wait a moment before trying again."
        )

    # 15. Network Error
    if any(k in lower for k in [
        "connection refused",
        "timed out",
        "timeout",
        "network is unreachable",
        "temporary failure in name resolution",
        "unable to download webpage",
        "connection reset",
        "http error 50",
    ]):
        return (
            "NETWORK_ERROR",
            "Network error communicating with YouTube. Please try again shortly."
        )

    # 16. Generic yt-dlp error
    if "error:" in lower or "yt_dlp" in lower or "ytdlp" in lower:
        return (
            "YTDLP_ERROR",
            f"Failed to extract video data from YouTube: {sanitize_log_message(err_str[:200])}"
        )

    return (
        "UNKNOWN_ERROR",
        f"Media extraction failed: {sanitize_log_message(err_str[:200])}"
    )

def extract_video_metadata(
    url: str,
    job_dir: Optional[Path] = None,
    job_id: str = "diagnostic"
) -> Dict[str, Any]:
    """
    Fetches video metadata using yt-dlp with controlled client fallback strategy.
    Equivalent to: yt-dlp --dump-single-json "<URL>".
    Does NOT download video data.
    Captures stderr and stdout for comprehensive diagnostics on failure.
    """
    cookie_content = config.get_cookie_content()
    cookie_configured = bool(config.has_cookies())
    cookie_valid, _ = diagnostics.verify_cookie_format(cookie_content)
    cookie_file_used = False

    last_error = None
    last_code = "UNKNOWN_ERROR"
    last_msg = ""
    last_stderr = ""
    last_stdout = ""

    with scoped_cookie_file(job_dir) as cookie_file:
        cookie_file_used = bool(cookie_file and os.path.exists(cookie_file))
        active_strategies = get_client_strategies(has_cookies=cookie_configured)
        client_results = {}

        for strategy in active_strategies:
            client_name = strategy["name"]
            player_client = strategy["player_client"]
            diag_logger = YtDlpDiagnosticLogger()

            ydl_opts = {
                'skip_download': True,
                'extract_flat': False,
                'quiet': False,
                'logger': diag_logger,
                'no_warnings': False,
                'js_runtimes': {'deno': {}, 'node': {}},
                'remote_components': ['ejs:github'],
                'extractor_args': {
                    'youtube': {
                        'player_client': player_client,
                    }
                },
            }
            if config.FFMPEG_EXE:
                ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
            if config.YTDLP_PROXY:
                ydl_opts['proxy'] = config.YTDLP_PROXY
            if cookie_file and client_name not in ("visionos", "tv_embedded"):
                ydl_opts['cookiefile'] = cookie_file

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if info:
                        info["_selected_client"] = client_name
                        logger.info(f"[JOB {job_id}] Metadata extraction SUCCESS using client '{client_name}'.")
                        logger.info(
                            f"cookie_configured={'true' if cookie_configured else 'false'} "
                            f"cookie_file_valid={'true' if cookie_valid else 'false'} "
                            f"cookie_file_used={'true' if cookie_file_used else 'false'} "
                            f"youtube_metadata_extraction=SUCCESS "
                            f"classification=NONE"
                        )
                        return info
            except Exception as e:
                full_stderr = diag_logger.get_stderr()
                combined_err = f"{e}\n{full_stderr}".strip()
                code, msg = classify_ytdlp_error(combined_err)
                client_results[client_name] = f"{code}: {sanitize_log_message(str(e))[:60]}"
                last_error = e
                last_code = code
                last_msg = msg
                last_stderr = full_stderr
                last_stdout = diag_logger.get_stdout()

                logger.warning(
                    f"[JOB {job_id}] Client '{client_name}' extraction failed ({code}): {sanitize_log_message(str(e)[:120])}. Attempting next client..."
                )

        logger.info(
            f"cookie_configured={'true' if cookie_configured else 'false'} "
            f"cookie_file_valid={'true' if cookie_valid else 'false'} "
            f"cookie_file_used={'true' if cookie_file_used else 'false'} "
            f"youtube_metadata_extraction=FAILED "
            f"classification={last_code}"
        )

        diagnostics.log_job_failure_diagnostics(
            job_id=job_id,
            stage="METADATA_EXTRACTION",
            classification=last_code,
            raw_error=last_error,
            raw_stderr=last_stderr,
            raw_stdout=last_stdout,
            exit_code=getattr(last_error, "code", None)
        )
        matrix_str = " | ".join([f"{k} -> {v}" for k, v in client_results.items()])
        debug_info = f"[Matrix: {matrix_str} | Cookies: {config.get_cookie_source()}]"
        raise MediaProcessingError(last_code, f"{last_msg} {debug_info}")

def run_ffmpeg_trim(
    input_file: str,
    output_file: str,
    start_seconds: float,
    end_seconds: float,
    is_pre_cut: bool = False
) -> None:
    """
    Executes FFmpeg frame-accurate trimming and remuxing into web-compatible MP4.
    Preserves both video and audio streams with faststart for instant playback.
    """
    duration = end_seconds - start_seconds
    trim_start = 0.0 if is_pre_cut else start_seconds

    # Frame-accurate encode with libx264 + aac for universal compatibility and faststart
    encode_cmd = [
        config.FFMPEG_EXE,
        "-y",
        "-ss", f"{trim_start:.3f}",
        "-t", f"{duration:.3f}",
        "-i", input_file,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_file
    ]
    logger.info(f"Running FFmpeg frame-accurate trim: {' '.join(encode_cmd)}")
    res_encode = subprocess.run(encode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res_encode.returncode != 0:
        err_msg = res_encode.stderr[-400:] if res_encode.stderr else "Unknown FFmpeg error"
        logger.error(f"FFmpeg encoding failed: {err_msg}")
        raise MediaProcessingError("PROCESSING_FAILED", f"Video trimming failed: {err_msg}")

    if not os.path.exists(output_file) or os.path.getsize(output_file) < 1024:
        raise MediaProcessingError("PROCESSING_FAILED", "Generated clip is empty or corrupt.")

def process_job(job_data: Dict[str, Any]) -> None:
    """
    Complete media worker processing pipeline for a single job:
    1. Validate timestamps & bounds against video duration
    2. yt-dlp section-aware download with controlled client strategy
    3. FFmpeg accurate trimming & remuxing
    4. Independent ffprobe/ffmpeg duration & stream verification
    5. Cloudflare R2 upload & completion
    6. Guaranteed temporary file cleanup
    """
    job_id = job_data["id"]
    url = job_data["youtube_url"]
    start_sec = float(job_data["start_seconds"])
    end_sec = float(job_data["end_seconds"])
    requested_duration = end_sec - start_sec

    # Setup isolated directory
    job_dir = config.LOCAL_TEMP_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    raw_download_template = str(job_dir / "raw_stream.%(ext)s")
    final_clip_path = str(job_dir / f"clip_{job_id}.mp4")

    logger.info(f"[JOB {job_id}] Started processing: {url} ({start_sec}s -> {end_sec}s)")

    try:
        # Step 1: Validate Job Input
        if start_sec < 0:
            raise MediaProcessingError("TIMESTAMP_INVALID", "Start timestamp cannot be negative.")
        if end_sec <= start_sec:
            raise MediaProcessingError("TIMESTAMP_INVALID", "End timestamp must be strictly greater than start timestamp.")
        if requested_duration > config.MAX_CLIP_DURATION_SECONDS:
            raise MediaProcessingError(
                "CLIP_TOO_LONG",
                f"Requested clip ({int(requested_duration)}s) exceeds maximum allowed duration ({config.MAX_CLIP_DURATION_SECONDS}s)."
            )

        db.update_job_progress(job_id, 20)
        logger.info(f"[JOB {job_id}] Fetching metadata (pre-flight check)...")
        info = extract_video_metadata(url, job_dir=job_dir, job_id=job_id)
        video_duration = float(info.get("duration") or 0)
        title = info.get("title") or "YouTube Clip"
        selected_client = info.get("_selected_client", "web_embedded")
        logger.info(f"[JOB {job_id}] Metadata extraction SUCCESS: '{title}' ({video_duration}s)")

        if video_duration > 0:
            if start_sec >= video_duration:
                raise MediaProcessingError("TIMESTAMP_INVALID", f"Start timestamp ({start_sec}s) exceeds video duration ({int(video_duration)}s).")
            if end_sec > video_duration + 1.0:  # 1s tolerance for rounding
                end_sec = video_duration
                requested_duration = end_sec - start_sec

        # Required logs: [source] and [request]
        logger.info("=" * 50)
        logger.info(f"[source]\nvideo duration: {video_duration}s")
        logger.info(
            f"[request]\nstart_seconds: {start_sec:.2f}\nend_seconds: {end_sec:.2f}\nrequested_duration: {requested_duration:.2f}s"
        )
        logger.info("=" * 50)

        # Step 2: yt-dlp Section-Aware Download
        db.update_job_progress(job_id, 40)
        logger.info(f"[JOB {job_id}] Starting section-aware download ({start_sec}s -> {end_sec}s)...")

        def progress_hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                if total > 0:
                    pct = int((downloaded / total) * 30)
                    db.update_job_progress(job_id, min(70, 40 + pct))

        has_conf_cookies = bool(config.has_cookies())
        dl_strategies = get_client_strategies(has_cookies=has_conf_cookies)
        ordered_strategies = sorted(
            dl_strategies,
            key=lambda s: 0 if s["name"] == selected_client else 1
        )
        download_success = False
        active_client = selected_client
        last_dl_error = None
        last_dl_code = "DOWNLOAD_FAILED"
        last_dl_msg = ""
        last_dl_stderr = ""

        with scoped_cookie_file(job_dir) as cookie_file:
            for strategy in ordered_strategies:
                client_name = strategy["name"]
                player_client = strategy["player_client"]
                dl_logger = YtDlpDiagnosticLogger()
                ydl_opts = {
                    'format': 'bv*[height<=1080]+ba/b/best',
                    'outtmpl': raw_download_template,
                    'merge_output_format': 'mp4',
                    'progress_hooks': [progress_hook],
                    'quiet': False,
                    'logger': dl_logger,
                    'no_warnings': False,
                    'js_runtimes': {'deno': {}, 'node': {}},
                    'remote_components': ['ejs:github'],
                    'extractor_args': {
                        'youtube': {
                            'player_client': player_client,
                        }
                    },
                    'download_ranges': yt_dlp.utils.download_range_func(None, [(start_sec, end_sec)]),
                    'force_keyframes_at_cuts': False,
                }
                if config.FFMPEG_EXE:
                    ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
                if config.YTDLP_PROXY:
                    ydl_opts['proxy'] = config.YTDLP_PROXY
                if cookie_file and client_name not in ("visionos", "tv_embedded"):
                    ydl_opts['cookiefile'] = cookie_file

                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                    download_success = True
                    active_client = client_name
                    break
                except Exception as dl_err:
                    full_stderr = dl_logger.get_stderr()
                    code, msg = classify_ytdlp_error(f"{dl_err}\n{full_stderr}".strip())
                    last_dl_error = dl_err
                    last_dl_code = code
                    last_dl_msg = msg
                    last_dl_stderr = full_stderr
                    logger.warning(
                        f"[JOB {job_id}] Download with client '{client_name}' failed ({code}). Attempting next client..."
                    )

        if not download_success:
            diagnostics.log_job_failure_diagnostics(
                job_id=job_id,
                stage="MEDIA_DOWNLOAD",
                classification=last_dl_code,
                raw_error=last_dl_error,
                raw_stderr=last_dl_stderr,
                raw_stdout="",
                exit_code=getattr(last_dl_error, "code", None)
            )
            raise MediaProcessingError(last_dl_code, last_dl_msg)

        # Locate downloaded raw file
        raw_candidates = list(job_dir.glob("raw_stream.*"))
        if not raw_candidates:
            raise MediaProcessingError("DOWNLOAD_FAILED", "Downloaded media stream could not be located on disk.")
        downloaded_raw_file = str(raw_candidates[0])
        downloaded_bytes = os.path.getsize(downloaded_raw_file)

        # Probe raw downloaded file
        raw_probe = probe_media_file(downloaded_raw_file)
        raw_duration = raw_probe["duration"]
        video_fmt = raw_probe.get("video_codec") or "h264"
        audio_fmt = raw_probe.get("audio_codec") or "aac"

        logger.info("=" * 50)
        logger.info(
            f"[yt-dlp]\n"
            f"selected client: {active_client}\n"
            f"selected video format: {video_fmt}\n"
            f"selected audio format: {audio_fmt}\n"
            f"downloaded bytes: {downloaded_bytes}"
        )
        logger.info("=" * 50)

        # Step 3: FFmpeg Precise Trimming
        db.update_job_progress(job_id, 75)
        logger.info(f"[JOB {job_id}] Running FFmpeg trimming...")
        is_pre_cut = abs(raw_duration - requested_duration) <= 3.0
        run_ffmpeg_trim(
            input_file=downloaded_raw_file,
            output_file=final_clip_path,
            start_seconds=start_sec,
            end_seconds=end_sec,
            is_pre_cut=is_pre_cut
        )
        clip_size = os.path.getsize(final_clip_path)

        # Step 4: Validate Output Clip with independent ffprobe/ffmpeg
        output_probe = probe_media_file(final_clip_path)
        output_duration = output_probe["duration"]
        codec_container = f"{output_probe.get('video_codec', 'unknown')}+{output_probe.get('audio_codec', 'unknown')}/{output_probe.get('container', 'mp4')}"

        logger.info("=" * 50)
        logger.info(
            f"[ffmpeg]\n"
            f"input duration: {raw_duration:.2f}s\n"
            f"output duration: {output_duration:.2f}s\n"
            f"codec/container: {codec_container}"
        )
        logger.info("=" * 50)

        # Verify timestamp accuracy
        dur_diff = abs(output_duration - requested_duration)
        if dur_diff > 2.5:
            raise MediaProcessingError(
                "PROCESSING_FAILED",
                f"Generated clip duration ({output_duration:.2f}s) differs materially from requested duration ({requested_duration:.2f}s, delta: {dur_diff:.2f}s)."
            )

        # Verify video stream exists
        if not output_probe.get("has_video"):
            raise MediaProcessingError("PROCESSING_FAILED", "Generated clip is missing a valid video stream.")

        # Verify audio stream exists if source has audio
        if raw_probe.get("has_audio") and not output_probe.get("has_audio"):
            raise MediaProcessingError("PROCESSING_FAILED", "Generated clip is missing an audio stream present in source.")

        # Step 5: Upload ONLY final clip to Cloudflare R2
        db.update_job_progress(job_id, 90)
        logger.info(f"[JOB {job_id}] Uploading final clip to Cloudflare R2...")
        now = datetime.now(timezone.utc)
        year_str = now.strftime("%Y")
        month_str = now.strftime("%m")
        object_key = f"clips/{year_str}/{month_str}/{job_id}.mp4"

        storage.upload_clip(
            local_file_path=final_clip_path,
            object_key=object_key,
            content_type="video/mp4"
        )

        logger.info("=" * 50)
        logger.info(
            f"[storage]\n"
            f"R2 upload size: {clip_size} bytes\n"
            f"R2 object key: {object_key}"
        )
        logger.info("=" * 50)

        # Step 6: Mark COMPLETED in PostgreSQL
        expires_at = now + timedelta(hours=config.CLIP_EXPIRATION_HOURS)
        db.mark_job_completed(
            job_id=job_id,
            r2_object_key=object_key,
            file_size_bytes=clip_size,
            expires_at=expires_at,
            title=title
        )
        logger.info(f"[JOB {job_id}] Processing COMPLETED. Expires at {expires_at.isoformat()}")

    except MediaProcessingError as mpe:
        clean_msg = sanitize_log_message(mpe.message)
        logger.error(f"[JOB {job_id}] Media processing error [{mpe.code}]: {clean_msg}")
        db.mark_job_failed(job_id, mpe.code, clean_msg)
    except Exception as exc:
        clean_exc = sanitize_log_message(str(exc))
        logger.error(f"[JOB {job_id}] Unexpected failure: {clean_exc}", exc_info=True)
        db.mark_job_failed(job_id, "UNKNOWN_ERROR", f"An unexpected error occurred: {clean_exc[:150]}")
    finally:
        # Step 7: Guaranteed Cleanup of Temporary Files & Cookie Credentials
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
                logger.info(f"[JOB {job_id}] Cleaned temporary directory {job_dir}")
            except Exception as e:
                logger.warning(f"[JOB {job_id}] Failed to clean temporary directory: {e}")
