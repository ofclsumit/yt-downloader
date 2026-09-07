"""
System diagnostics module for yt-dlp, FFmpeg, FFprobe, Deno, Node, and yt-dlp-ejs.
Strictly redacts all secrets, cookies, tokens, and authorization headers.
Implements Steps 1, 2, 3, 4, 5, 7 diagnostics required for production reliability.
"""
import importlib.metadata
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import yt_dlp
from worker import config

logger = logging.getLogger("worker.diagnostics")

def sanitize_diagnostic_text(text: Optional[str]) -> str:
    """
    Sanitizes diagnostic text, stack traces, and stderr.
    Completely redacts cookie contents, auth headers, tokens, and secret paths.
    """
    if not text:
        return ""
    sanitized = str(text)
    # Redact cookie paths
    sanitized = re.sub(r'(/[\w./-]*\.job_cookies\.txt)', '[REDACTED_COOKIE_PATH]', sanitized)
    sanitized = re.sub(r'([A-Za-z]:\\[\w.\\-]*\.job_cookies\.txt)', '[REDACTED_COOKIE_PATH]', sanitized)
    sanitized = re.sub(r'(/[\w./-]*yt_cookie_[\w.-]*)', '[REDACTED_COOKIE_PATH]', sanitized)
    sanitized = re.sub(r'([A-Za-z]:\\[\w.\\-]*yt_cookie_[\w.-]*)', '[REDACTED_COOKIE_PATH]', sanitized)
    # Redact tokens and credentials
    sanitized = re.sub(r'(po_token=)[^\s&]+', r'\1[REDACTED]', sanitized)
    sanitized = re.sub(r'(token=)[^\s&]+', r'\1[REDACTED]', sanitized)
    sanitized = re.sub(r'(Bearer\s+)[^\s&]+', r'\1[REDACTED]', sanitized)
    sanitized = re.sub(r'(Authorization:\s*)[^\r\n]+', r'\1[REDACTED]', sanitized)
    sanitized = re.sub(r'(--cookies\s+)[^\s]+', r'\1[REDACTED_PATH]', sanitized)
    sanitized = re.sub(r'(--header\s+["\'][^"\']*Authorization[^"\']*["\'])', '--header [REDACTED]', sanitized)
    sanitized = re.sub(r'([?&]X-Amz-Signature=)[^&\s]+', r'\1[REDACTED]', sanitized)
    sanitized = re.sub(r'([?&]X-Amz-Credential=)[^&\s]+', r'\1[REDACTED]', sanitized)
    return sanitized

def get_ytdlp_version() -> str:
    try:
        from yt_dlp.version import __version__
        return str(__version__)
    except Exception:
        return "UNKNOWN"

def get_ytdlp_ejs_version() -> str:
    try:
        import yt_dlp_ejs
        ver = getattr(yt_dlp_ejs, "version", None)
        if ver:
            return str(ver)
    except ImportError:
        pass
    try:
        return importlib.metadata.version("yt-dlp-ejs")
    except Exception:
        return "NOT_INSTALLED"

def get_binary_version(bin_path: Optional[str], flag: str = "--version") -> str:
    """Executes a binary and returns the first line of output."""
    if not bin_path:
        return "NOT_FOUND"
    resolved = shutil.which(bin_path) or (bin_path if Path(bin_path).exists() else None)
    if not resolved:
        return "NOT_FOUND"
    try:
        res = subprocess.run(
            [resolved, flag],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        out = (res.stdout or res.stderr or "").strip().splitlines()
        return out[0].strip() if out else "UNKNOWN"
    except Exception as e:
        return f"ERROR ({e})"

def get_all_diagnostics() -> Dict[str, Any]:
    """Collects system-wide runtime diagnostics."""
    ytdlp_ver = get_ytdlp_version()
    python_ver = sys.version.split()[0]
    ffmpeg_ver = get_binary_version(config.FFMPEG_EXE, "-version")
    ffprobe_ver = get_binary_version(getattr(config, "FFPROBE_EXE", "ffprobe"), "-version")
    deno_ver = get_binary_version("deno", "--version")
    node_ver = get_binary_version("node", "-v")
    if node_ver == "NOT_FOUND":
        node_ver = get_binary_version("nodejs", "-v")
    ejs_ver = get_ytdlp_ejs_version()
    cookies_conf = bool(config.has_cookies())

    return {
        "python_version": python_ver,
        "ytdlp_version": ytdlp_ver,
        "ytdlp_ejs_version": ejs_ver,
        "ffmpeg_version": ffmpeg_ver,
        "ffprobe_version": ffprobe_ver,
        "deno_version": deno_ver,
        "node_version": node_ver,
        "cookies_configured": cookies_conf,
    }

def verify_cookie_format(cookie_content: Optional[str]) -> Tuple[bool, int]:
    """
    Verifies cookie file structure without exposing any cookie content.
    Returns (is_valid_format, youtube_entries_count).
    """
    if not cookie_content:
        return False, 0
    lines = [l.strip() for l in cookie_content.splitlines() if l.strip()]
    if not lines:
        return False, 0

    header_valid = any(lines[0].startswith(h) for h in ["# Netscape", "# HTTP", "#"])
    youtube_entries = 0
    for line in lines:
        if line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 5 and "youtube.com" in parts[0]:
            youtube_entries += 1

    return (header_valid and youtube_entries > 0), youtube_entries

def execute_metadata_probe(url: str, cookie_path: Optional[str] = None) -> Tuple[bool, str, str]:
    """
    Executes a metadata-only extraction using yt-dlp.
    Returns (success, classification_or_title, sanitized_stderr).
    """
    from worker.media_processor import YtDlpDiagnosticLogger, classify_ytdlp_error
    diag_logger = YtDlpDiagnosticLogger()
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
    if cookie_path and os.path.exists(cookie_path):
        ydl_opts['cookiefile'] = cookie_path

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get("title", "Video") if info else "Video"
            return True, title, diag_logger.get_stderr()
    except Exception as e:
        full_err = f"{e}\n{diag_logger.get_stderr()}".strip()
        code, _ = classify_ytdlp_error(full_err)
        return False, code, sanitize_diagnostic_text(full_err)

def run_environment_and_cookie_diagnostics(fail_on_missing_runtime: bool = True) -> Dict[str, Any]:
    """
    Executes complete Steps 1, 2, 3, 4, 5, 7 diagnostics at startup.
    Strictly follows exact formatting requirements.
    """
    # --- STEP 1: Environment Diagnostics ---
    raw_env_cookies = os.environ.get("YTDLP_COOKIES") or os.environ.get("YTDLP_COOKIES_B64") or ""
    ytdlp_cookies_configured = bool(raw_env_cookies)
    ytdlp_cookies_len = len(raw_env_cookies)

    # Check secret files on disk
    cookie_file_found = False
    cookie_file_size = 0
    candidate_paths = [
        Path("/etc/secrets/cookies.txt"),
        Path("/etc/secrets/youtube_cookies.txt"),
        Path("/etc/secrets/cookies"),
        config.BASE_DIR / "cookies.txt",
    ]
    if Path("/etc/secrets").exists() and Path("/etc/secrets").is_dir():
        try:
            for f in Path("/etc/secrets").iterdir():
                if f.is_file() and f not in candidate_paths:
                    candidate_paths.append(f)
        except Exception:
            pass

    for cp in candidate_paths:
        if cp.exists() and cp.is_file():
            cookie_file_found = True
            try:
                cookie_file_size = cp.stat().st_size
            except Exception:
                pass
            break

    diag = get_all_diagnostics()
    deno_installed = diag["deno_version"] not in ("NOT_FOUND", "ERROR") and not diag["deno_version"].startswith("ERROR")
    ffmpeg_installed = diag["ffmpeg_version"] not in ("NOT_FOUND", "ERROR") and not diag["ffmpeg_version"].startswith("ERROR")
    ejs_installed = diag["ytdlp_ejs_version"] != "NOT_INSTALLED"

    logger.info("=" * 65)
    logger.info("STARTUP DIAGNOSTICS: STEP 1 - Environment Diagnostics")
    logger.info(f"YTDLP_COOKIES configured: {'true' if ytdlp_cookies_configured else 'false'}")
    logger.info(f"YTDLP_COOKIES length: {ytdlp_cookies_len}")
    logger.info(f"cookie file exists: {'true' if cookie_file_found else 'false'}")
    logger.info(f"cookie file size: {cookie_file_size}")
    logger.info(f"yt-dlp version: {diag['ytdlp_version']}")
    logger.info(f"yt-dlp-ejs installed: {'true' if ejs_installed else 'false'}")
    logger.info(f"yt-dlp-ejs version: {diag['ytdlp_ejs_version']}")
    logger.info(f"Deno installed: {'true' if deno_installed else 'false'}")
    logger.info(f"Deno version: {diag['deno_version']}")
    logger.info(f"FFmpeg installed: {'true' if ffmpeg_installed else 'false'}")
    logger.info(f"FFmpeg version: {diag['ffmpeg_version']}")
    logger.info("=" * 65)

    # Fail fast if required runtime is missing in production container
    if not deno_installed and diag["node_version"] == "NOT_FOUND" and fail_on_missing_runtime and os.name != "nt":
        raise RuntimeError("Missing required JavaScript runtime (Deno or Node.js).")

    # --- STEP 2: Verify Cookie File ---
    cookie_content = config.get_cookie_content()
    is_valid_format, entry_count = verify_cookie_format(cookie_content)
    logger.info("STARTUP DIAGNOSTICS: STEP 2 - Cookie Verification")
    logger.info(f"cookie_format_valid: {'true' if is_valid_format else 'false'}")
    logger.info(f"youtube_cookie_entries: {entry_count}")
    logger.info("=" * 65)

    # --- STEP 3, 4, 5, 7: Dual Probe Test (TEST A vs TEST B) ---
    probe_url = "https://youtu.be/2vYyHb34upc"
    logger.info(f"STARTUP DIAGNOSTICS: STEP 7 - Cookie Comparison Probe ({probe_url})")

    # TEST A: Without cookies
    success_a, res_a, err_a = execute_metadata_probe(probe_url, cookie_path=None)
    logger.info(f"TEST A (No Cookies): {'SUCCESS' if success_a else f'FAILED ({res_a})'}")

    # TEST B: With cookies
    success_b = None
    res_b = "SKIPPED"
    err_b = ""
    if cookie_content and is_valid_format:
        tmp_cf = None
        try:
            fd, tmp_cf = tempfile.mkstemp(prefix="probe_cookie_", suffix=".txt")
            os.close(fd)
            Path(tmp_cf).write_text(cookie_content, encoding="utf-8")
            success_b, res_b, err_b = execute_metadata_probe(probe_url, cookie_path=tmp_cf)
            logger.info(f"TEST B (With Cookies): {'SUCCESS' if success_b else f'FAILED ({res_b})'}")
        finally:
            if tmp_cf and os.path.exists(tmp_cf):
                try:
                    os.remove(tmp_cf)
                except Exception:
                    pass
    else:
        logger.info("TEST B (With Cookies): SKIPPED (No valid cookies configured)")

    # Compare results
    if success_b is not None:
        if not success_a and success_b:
            logger.info("Probe Evaluation: A=FAILED, B=SUCCESS -> Cookies are valid and actively bypassing YouTube bot detection.")
        elif not success_a and not success_b:
            logger.warning(f"Probe Evaluation: A={res_a}, B={res_b} -> YouTube blocked both unauthenticated and authenticated requests. The issue is not simply missing cookies.")
        elif success_a and success_b:
            logger.info("Probe Evaluation: A=SUCCESS, B=SUCCESS -> Both unauthenticated and authenticated requests succeeded.")
        elif success_a and not success_b:
            logger.warning(f"Probe Evaluation: A=SUCCESS, B={res_b} -> Unauthenticated succeeded but configured cookies caused failure.")
    else:
        logger.info(f"Probe Evaluation: Unauthenticated only (A={'SUCCESS' if success_a else f'FAILED ({res_a})'})")

    primary_success = success_b if (cookie_content and is_valid_format) else success_a
    primary_class = (res_b if (cookie_content and is_valid_format) else res_a) if not primary_success else "NONE"
    logger.info(
        f"cookie_configured={'true' if ytdlp_cookies_configured else 'false'} "
        f"cookie_file_valid={'true' if is_valid_format else 'false'} "
        f"cookie_file_used={'true' if (cookie_content and is_valid_format) else 'false'} "
        f"youtube_metadata_extraction={'SUCCESS' if primary_success else 'FAILED'} "
        f"classification={primary_class}"
    )
    logger.info("=" * 65)

    return diag

# Backward-compatible alias
verify_startup_diagnostics = run_environment_and_cookie_diagnostics

def log_job_failure_diagnostics(
    job_id: str,
    stage: str,
    classification: str,
    raw_error: Exception,
    raw_stderr: str = "",
    raw_stdout: str = "",
    exit_code: Optional[Any] = None
) -> None:
    """
    Logs comprehensive sanitized diagnostics when yt-dlp or media extraction fails.
    Preserves exact technical cause while strictly protecting secrets.
    """
    diag = get_all_diagnostics()
    clean_err = sanitize_diagnostic_text(str(raw_error))
    clean_stderr = sanitize_diagnostic_text(raw_stderr)
    clean_stdout = sanitize_diagnostic_text(raw_stdout)
    cookie_content = config.get_cookie_content()
    cookie_valid, _ = verify_cookie_format(cookie_content)
    has_conf = bool(config.has_cookies())

    logger.error("=" * 65)
    logger.error(
        f"cookie_configured={'true' if has_conf else 'false'} "
        f"cookie_file_valid={'true' if cookie_valid else 'false'} "
        f"cookie_file_used={'true' if has_conf else 'false'} "
        f"youtube_metadata_extraction=FAILED "
        f"classification={classification}"
    )
    logger.error(f"[JOB {job_id}] Media Extraction Diagnostics ({stage} FAILED):")
    logger.error(f"  yt-dlp version:       {diag['ytdlp_version']}")
    logger.error(f"  Python version:       {diag['python_version']}")
    logger.error(f"  FFmpeg version:       {diag['ffmpeg_version']}")
    logger.error(f"  FFprobe version:      {diag['ffprobe_version']}")
    logger.error(f"  JavaScript runtimes:  Deno: {diag['deno_version']} | Node: {diag['node_version']}")
    logger.error(f"  yt-dlp-ejs:           {diag['ytdlp_ejs_version']}")
    logger.error(f"  cookies configured:   {'true' if diag['cookies_configured'] else 'false'}")
    logger.error(f"  metadata extraction:  FAILED")
    logger.error(f"  classification:       {classification}")
    logger.error(f"  exit code/exception:  {exit_code or type(raw_error).__name__}")
    if clean_stderr:
        logger.error(f"  sanitized stderr:\n{clean_stderr}")
    if clean_stdout:
        logger.error(f"  sanitized stdout:\n{clean_stdout}")
    logger.error(f"  raw error snippet:    {clean_err[:300]}")
    logger.error("=" * 65)
