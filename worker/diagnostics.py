"""
System diagnostics module for yt-dlp, FFmpeg, FFprobe, Deno, Node, and yt-dlp-ejs.
Provides startup verification, sanitized error reporting, and metadata pre-flight diagnostics.
Strictly redacts all secrets, cookies, tokens, and authorization headers.
"""
import importlib.metadata
import logging
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional

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

def verify_startup_diagnostics(fail_on_missing_runtime: bool = True) -> Dict[str, Any]:
    """
    Executes and logs startup diagnostics.
    In production (Linux/Docker), fails startup if required tools are missing.
    """
    diag = get_all_diagnostics()
    logger.info("=" * 65)
    logger.info("RENDER WORKER STARTUP DIAGNOSTICS:")
    logger.info(f"  Python Version:         {diag['python_version']}")
    logger.info(f"  yt-dlp Version:         {diag['ytdlp_version']}")
    logger.info(f"  yt-dlp-ejs Version:     {diag['ytdlp_ejs_version']}")
    logger.info(f"  FFmpeg:                 {diag['ffmpeg_version']}")
    logger.info(f"  FFprobe:                {diag['ffprobe_version']}")
    logger.info(f"  Deno JS Runtime:        {diag['deno_version']}")
    logger.info(f"  Node.js JS Runtime:     {diag['node_version']}")
    logger.info(f"  Cookies Configured:     {'true' if diag['cookies_configured'] else 'false'}")
    logger.info("=" * 65)

    # Verify FFmpeg
    if diag["ffmpeg_version"] == "NOT_FOUND":
        logger.critical("FFmpeg binary is missing! Worker will not be able to process video.")
        if fail_on_missing_runtime and os.name != "nt":
            raise RuntimeError("Required dependency 'ffmpeg' is missing.")

    # Verify JavaScript runtime (Deno preferred, Node fallback)
    has_deno = diag["deno_version"] not in ("NOT_FOUND", "ERROR") and not diag["deno_version"].startswith("ERROR")
    has_node = diag["node_version"] not in ("NOT_FOUND", "ERROR") and not diag["node_version"].startswith("ERROR")

    if not has_deno and not has_node:
        logger.critical("No supported JavaScript runtime (Deno or Node.js) found! YouTube extraction will fail.")
        if fail_on_missing_runtime and os.name != "nt":
            raise RuntimeError("No supported JavaScript runtime found. Deno or Node.js is required.")

    if not has_deno:
        logger.warning("Deno is not available in PATH. Falling back to Node.js for JS challenge execution.")

    return diag

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

    logger.error("=" * 65)
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
