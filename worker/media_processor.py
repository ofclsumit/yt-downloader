"""
Media Processing Engine for Render Background Worker.
Implements yt-dlp section-aware downloading and FFmpeg frame-accurate trimming.
"""
import os
import re
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
    - COOKIE_INVALID
    - COOKIE_EXPIRED
    - BOT_DETECTION
    - VIDEO_AGE_RESTRICTED
    - VIDEO_PRIVATE
    - VIDEO_REGION_RESTRICTED
    - VIDEO_UNAVAILABLE
    - FORMAT_ERROR
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

    # 3. Cookies Invalid
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

    # 4. Cookies Expired
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

    # 5. YouTube Bot Detection
    bot_triggers = [
        "sign in to confirm you’re not a bot",
        "sign in to confirm you're not a bot",
        "not a bot",
        "captcha",
        "bot verification",
        "login_required",
        "automated requests",
    ]
    if any(t in lower for t in bot_triggers):
        return (
            "BOT_DETECTION",
            "YouTube is currently blocking automated requests from the processing server. The administrator needs to configure a valid yt-dlp cookie session."
        )

    # 6. Age Restricted
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

    # 7. Private Video
    if any(k in lower for k in [
        "private video",
        "sign in if you've been granted access",
        "this is a private video",
    ]):
        return (
            "VIDEO_PRIVATE",
            "This video is private and cannot be processed."
        )

    # 8. Region / Geo Restricted
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

    # 9. Video Unavailable / Deleted
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

    # 10. Format Error
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

    # 11. Network Error / Rate Limit
    if any(k in lower for k in [
        "too many requests",
        "http error 429",
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
            "Network or rate-limit error communicating with YouTube. Please try again shortly."
        )

    # 12. Generic yt-dlp error
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
    Fetches video metadata using yt-dlp with secure scoped cookie lifecycle.
    Equivalent to: yt-dlp --dump-single-json "<URL>".
    Does NOT download video data.
    Captures stderr and stdout for comprehensive diagnostics on failure.
    """
    diag_logger = YtDlpDiagnosticLogger()
    with scoped_cookie_file(job_dir) as cookie_file:
        ydl_opts = {
            'skip_download': True,
            'extract_flat': False,
            'quiet': False,
            'logger': diag_logger,
            'no_warnings': False,
            'format': 'bv*+ba/b',
            'js_runtimes': {'deno': {}, 'node': {}},
            'remote_components': ['ejs:github'],
            'extractor_args': {
                'youtube': {
                    'player_client': ['web_embedded', 'default', '-tv_downgraded', 'android'],
                }
            },
        }
        if config.FFMPEG_EXE:
            ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
        if config.YTDLP_PROXY:
            ydl_opts['proxy'] = config.YTDLP_PROXY
        if cookie_file:
            ydl_opts['cookiefile'] = cookie_file

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    raise MediaProcessingError("VIDEO_UNAVAILABLE", "Unable to extract video information.")
                return info
        except Exception as e:
            full_stderr = diag_logger.get_stderr()
            combined_err = f"{e}\n{full_stderr}".strip()
            code, msg = classify_ytdlp_error(combined_err)

            # Check if fallback client succeeds
            if code not in ("BOT_DETECTION", "COOKIE_INVALID", "COOKIE_EXPIRED", "JS_RUNTIME_MISSING", "EJS_MISSING"):
                try:
                    ydl_opts['extractor_args'] = {'youtube': {'player_client': ['android', 'visionos']}}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl_fb:
                        info = ydl_fb.extract_info(url, download=False)
                        if info:
                            return info
                except Exception:
                    pass

            diagnostics.log_job_failure_diagnostics(
                job_id=job_id,
                stage="METADATA_EXTRACTION",
                classification=code,
                raw_error=e,
                raw_stderr=full_stderr,
                raw_stdout=diag_logger.get_stdout(),
                exit_code=getattr(e, "code", None)
            )
            raise MediaProcessingError(code, msg)

def run_ffmpeg_trim(
    input_file: str,
    output_file: str,
    start_seconds: float,
    end_seconds: float,
    is_pre_cut: bool = False
) -> None:
    """
    Executes FFmpeg accurate trimming.
    If is_pre_cut is True (yt-dlp downloaded only the section), the local file starts near 0.
    Otherwise trims from start_seconds to end_seconds.
    Attempts stream-copy first for speed, falling back to frame-accurate libx264 encoding.
    """
    duration = end_seconds - start_seconds
    trim_start = 0.0 if is_pre_cut else start_seconds
    
    # 1. Attempt ultra-fast stream copy if inputs allow
    copy_cmd = [
        config.FFMPEG_EXE,
        "-y",
        "-ss", str(trim_start),
        "-t", str(duration),
        "-i", input_file,
        "-c", "copy",
        "-movflags", "+faststart",
        output_file
    ]
    
    logger.info(f"Running FFmpeg stream-copy: {' '.join(copy_cmd)}")
    res = subprocess.run(copy_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    valid_copy = (
        res.returncode == 0
        and os.path.exists(output_file)
        and os.path.getsize(output_file) > 1024
    )
    
    if not valid_copy:
        logger.info("Stream-copy did not produce accurate output. Falling back to libx264 frame-accurate encode.")
        # 2. Frame-accurate encode with fast preset and universal compatibility
        encode_cmd = [
            config.FFMPEG_EXE,
            "-y",
            "-ss", str(trim_start),
            "-t", str(duration),
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
        logger.info(f"Running FFmpeg re-encode: {' '.join(encode_cmd)}")
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
    2. yt-dlp section-aware download into isolated directory
    3. FFmpeg accurate trimming & remuxing
    4. Cloudflare R2 upload
    5. PostgreSQL status updates & completion
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
        logger.info(f"[JOB {job_id}] Metadata extraction SUCCESS: '{title}' ({video_duration}s)")

        if video_duration > 0:
            if start_sec >= video_duration:
                raise MediaProcessingError("TIMESTAMP_INVALID", f"Start timestamp ({start_sec}s) exceeds video duration ({int(video_duration)}s).")
            if end_sec > video_duration + 1.0:  # 1s tolerance for rounding
                end_sec = video_duration
                requested_duration = end_sec - start_sec

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

        with scoped_cookie_file(job_dir) as cookie_file:
            dl_logger = YtDlpDiagnosticLogger()
            ydl_opts = {
                'format': 'bv*+ba/b',
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
                        'player_client': ['web_embedded', 'default', '-tv_downgraded', 'android'],
                    }
                },
                # Documented yt-dlp section downloading function
                'download_ranges': yt_dlp.utils.download_range_func(None, [(start_sec, end_sec)]),
                'force_keyframes_at_cuts': False,
            }
            if config.FFMPEG_EXE:
                ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
            if config.YTDLP_PROXY:
                ydl_opts['proxy'] = config.YTDLP_PROXY
            if cookie_file:
                ydl_opts['cookiefile'] = cookie_file

            is_pre_cut = True
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as dl_err:
                full_stderr = dl_logger.get_stderr()
                combined_err = f"{dl_err}\n{full_stderr}".strip()
                code, msg = classify_ytdlp_error(combined_err)

                diagnostics.log_job_failure_diagnostics(
                    job_id=job_id,
                    stage="MEDIA_DOWNLOAD",
                    classification=code,
                    raw_error=dl_err,
                    raw_stderr=full_stderr,
                    raw_stdout=dl_logger.get_stdout(),
                    exit_code=getattr(dl_err, "code", None)
                )

                if code in ("BOT_DETECTION", "COOKIE_EXPIRED", "COOKIE_INVALID", "JS_RUNTIME_MISSING", "EJS_MISSING"):
                    logger.error(f"[JOB {job_id}] Unrecoverable error ({code}). Failing immediately without retry.")
                    raise MediaProcessingError(code, msg)

                clean_err = sanitize_log_message(str(dl_err))
                logger.warning(f"[JOB {job_id}] Primary section download error: {clean_err}. Retrying with universal fallback format...")
                ydl_opts['format'] = 'b/bv*+ba/best'
                ydl_opts['extractor_args'] = {
                    'youtube': {
                        'player_client': ['web_embedded', 'android', 'visionos']
                    }
                }
                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])
                except Exception as retry_err:
                    retry_stderr = dl_logger.get_stderr()
                    r_code, r_msg = classify_ytdlp_error(f"{retry_err}\n{retry_stderr}".strip())
                    diagnostics.log_job_failure_diagnostics(
                        job_id=job_id,
                        stage="MEDIA_DOWNLOAD_RETRY",
                        classification=r_code,
                        raw_error=retry_err,
                        raw_stderr=retry_stderr,
                        raw_stdout=dl_logger.get_stdout(),
                        exit_code=getattr(retry_err, "code", None)
                    )
                    raise MediaProcessingError(r_code, r_msg)

        # Locate downloaded raw file
        raw_candidates = list(job_dir.glob("raw_stream.*"))
        if not raw_candidates:
            raise MediaProcessingError("DOWNLOAD_FAILED", "Downloaded media stream could not be located on disk.")
        downloaded_raw_file = str(raw_candidates[0])
        logger.info(f"[JOB {job_id}] Download completed: {downloaded_raw_file} ({os.path.getsize(downloaded_raw_file)} bytes)")

        # Step 3: FFmpeg Trimming & Remuxing
        db.update_job_progress(job_id, 75)
        logger.info(f"[JOB {job_id}] Running FFmpeg trimming...")
        run_ffmpeg_trim(
            input_file=downloaded_raw_file,
            output_file=final_clip_path,
            start_seconds=start_sec,
            end_seconds=end_sec,
            is_pre_cut=is_pre_cut
        )
        clip_size = os.path.getsize(final_clip_path)
        logger.info(f"[JOB {job_id}] Clip created successfully: {clip_size} bytes")

        # Step 4: Upload to Cloudflare R2
        db.update_job_progress(job_id, 90)
        logger.info(f"[JOB {job_id}] Uploading to Cloudflare R2...")
        now = datetime.now(timezone.utc)
        year_str = now.strftime("%Y")
        month_str = now.strftime("%m")
        object_key = f"clips/{year_str}/{month_str}/{job_id}.mp4"

        storage.upload_clip(
            local_file_path=final_clip_path,
            object_key=object_key,
            content_type="video/mp4"
        )

        # Step 5: Mark COMPLETED in PostgreSQL
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
        # Step 6: Guaranteed Cleanup of Temporary Files & Cookie Credentials
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
                logger.info(f"[JOB {job_id}] Cleaned temporary directory {job_dir}")
            except Exception as e:
                logger.warning(f"[JOB {job_id}] Failed to clean temporary directory: {e}")
