"""
Media Processing Engine for Render Background Worker.
Implements yt-dlp section-aware downloading and FFmpeg frame-accurate trimming.
"""
import os
import re
import shutil
import logging
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from datetime import datetime, timezone, timedelta
import yt_dlp

from worker import config
from worker import db
from worker import storage

logger = logging.getLogger("worker.processor")

class MediaProcessingError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message

def classify_ytdlp_error(err_str: str) -> Tuple[str, str]:
    """Maps raw yt-dlp error output into user-friendly error codes and messages."""
    lower_err = err_str.lower()
    if "private video" in lower_err:
        return "VIDEO_PRIVATE", "This video is private and cannot be processed."
    if "sign in to confirm your age" in lower_err or "age-restricted" in lower_err:
        return "AGE_RESTRICTED", "This video is age-restricted and requires authorization."
    if "not available in your country" in lower_err or "geo-restricted" in lower_err:
        return "REGION_RESTRICTED", "This video is not available in the worker's region."
    if "video unavailable" in lower_err or "this video does not exist" in lower_err:
        return "VIDEO_UNAVAILABLE", "This video is unavailable or has been removed."
    if "not a valid url" in lower_err or "unsupported url" in lower_err:
        return "INVALID_URL", "The provided link is not a valid or supported YouTube URL."
    if "too many requests" in lower_err or "429" in lower_err:
        return "DOWNLOAD_FAILED", "YouTube is temporarily throttling requests. Please try again shortly."
    if "sign in to confirm you’re not a bot" in lower_err or "sign in to confirm you're not a bot" in lower_err:
        return "BOT_DETECTION", "YouTube is requesting bot verification for datacenter IPs. Please configure YTDLP_COOKIES."
    if "requested format is not available" in lower_err:
        return "DOWNLOAD_FAILED", "Requested video format stream is not available. Using universal stream fallback."
    return "DOWNLOAD_FAILED", f"Media extraction failed: {err_str[:200]}"

def extract_video_metadata(url: str) -> Dict[str, Any]:
    """Fetches video metadata using yt-dlp without downloading any media bytes."""
    ydl_opts = {
        'skip_download': True,
        'extract_flat': False,
        'quiet': True,
        'no_warnings': True,
        'format': 'bv*+ba/b',
        'js_runtimes': {'node': {}, 'deno': {}},
        'remote_components': ['ejs:github'],
        'extractor_args': {
            'youtube': {
                'player_client': ['visionos', 'android'],
            }
        },
    }
    if config.FFMPEG_EXE:
        ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
    if config.YTDLP_COOKIES_FILE and os.path.exists(config.YTDLP_COOKIES_FILE):
        ydl_opts['cookiefile'] = config.YTDLP_COOKIES_FILE

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise MediaProcessingError("VIDEO_UNAVAILABLE", "Unable to extract video information.")
            return info
    except yt_dlp.utils.DownloadError as e:
        # Fallback with mobile/alternate client if standard extraction fails
        try:
            ydl_opts['extractor_args'] = {'youtube': {'player_client': ['android', 'web']}}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl_fb:
                info = ydl_fb.extract_info(url, download=False)
                if info:
                    return info
        except Exception:
            pass
        code, msg = classify_ytdlp_error(str(e))
        raise MediaProcessingError(code, msg)
    except Exception as e:
        if isinstance(e, MediaProcessingError):
            raise
        logger.error(f"Unexpected error extracting metadata: {e}", exc_info=True)
        raise MediaProcessingError("DOWNLOAD_FAILED", f"Failed to retrieve video metadata: {str(e)[:150]}")

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
        logger.info(f"[JOB {job_id}] Fetching metadata...")
        info = extract_video_metadata(url)
        video_duration = float(info.get("duration") or 0)
        title = info.get("title") or "YouTube Clip"
        logger.info(f"[JOB {job_id}] Video title: '{title}', duration: {video_duration}s")

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

        ydl_opts = {
            'format': 'bv*+ba/b',
            'outtmpl': raw_download_template,
            'merge_output_format': 'mp4',
            'progress_hooks': [progress_hook],
            'quiet': True,
            'no_warnings': True,
            'js_runtimes': {'node': {}, 'deno': {}},
            'remote_components': ['ejs:github'],
            'extractor_args': {
                'youtube': {
                    'player_client': ['visionos', 'android'],
                }
            },
            # Documented yt-dlp section downloading function
            'download_ranges': yt_dlp.utils.download_range_func(None, [(start_sec, end_sec)]),
            'force_keyframes_at_cuts': False,
        }
        if config.FFMPEG_EXE:
            ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE
        if config.YTDLP_COOKIES_FILE and os.path.exists(config.YTDLP_COOKIES_FILE):
            ydl_opts['cookiefile'] = config.YTDLP_COOKIES_FILE

        is_pre_cut = True
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
        except Exception as dl_err:
            logger.warning(f"[JOB {job_id}] Primary section download error: {dl_err}. Retrying with universal fallback format...")
            ydl_opts['format'] = 'b/bv*+ba/best'
            ydl_opts['extractor_args'] = {'youtube': {'player_client': ['android', 'visionos']}}
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([url])
            except Exception as retry_err:
                code, msg = classify_ytdlp_error(str(retry_err))
                raise MediaProcessingError(code, msg)

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
        logger.error(f"[JOB {job_id}] Media processing error [{mpe.code}]: {mpe.message}")
        db.mark_job_failed(job_id, mpe.code, mpe.message)
    except Exception as exc:
        logger.error(f"[JOB {job_id}] Unexpected failure: {exc}", exc_info=True)
        db.mark_job_failed(job_id, "UNKNOWN_ERROR", f"An unexpected error occurred: {str(exc)[:150]}")
    finally:
        # Step 6: Guaranteed Cleanup of Temporary Files
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
                logger.info(f"[JOB {job_id}] Cleaned temporary directory {job_dir}")
            except Exception as e:
                logger.warning(f"[JOB {job_id}] Failed to clean temporary directory: {e}")
