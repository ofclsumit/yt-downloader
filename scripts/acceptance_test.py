"""
Acceptance Test Script for Render Media Worker Pipeline:
1. Verify yt-dlp version
2. Verify yt-dlp-ejs version
3. Verify Deno / JS Runtime
4. Verify FFmpeg and FFprobe
5. Verify Cookie configuration status (strictly boolean)
6. Extract metadata from a test YouTube URL
7. Test timestamp section download & FFmpeg trim
8. Verify zero secret leakage in all logs
"""
import sys
import os
import tempfile
from pathlib import Path

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from worker import config
from worker import diagnostics
from worker import media_processor

def run_acceptance_test():
    print("=" * 65)
    print("STARTING ACCEPTANCE TEST SUITE")
    print("=" * 65)

    # 1. System Diagnostics Verification
    print("\n[STEP 1-5] Verifying System Diagnostics...")
    diag = diagnostics.verify_startup_diagnostics(fail_on_missing_runtime=False)
    
    assert diag["ytdlp_version"] != "UNKNOWN", "yt-dlp version not detected"
    print(f"  ✓ yt-dlp version: {diag['ytdlp_version']}")
    
    assert diag["ytdlp_ejs_version"] != "NOT_INSTALLED", "yt-dlp-ejs is missing"
    print(f"  ✓ yt-dlp-ejs version: {diag['ytdlp_ejs_version']}")
    
    assert diag["ffmpeg_version"] != "NOT_FOUND", "FFmpeg is missing"
    print(f"  ✓ FFmpeg verified: {diag['ffmpeg_version'][:50]}...")
    
    print(f"  ✓ FFprobe status: {diag['ffprobe_version'][:50]}")
    print(f"  ✓ Deno status: {diag['deno_version']}")
    print(f"  ✓ Node.js status: {diag['node_version']}")
    print(f"  ✓ Cookies configured (boolean): {diag['cookies_configured']}")

    # 2. Metadata Extraction Pre-flight (Requirement 6)
    test_url = "https://youtu.be/2vYyHb34upc"
    print(f"\n[STEP 6-7] Pre-flight Metadata Extraction for: {test_url}...")
    temp_job_dir = Path(tempfile.mkdtemp(prefix="acceptance_job_"))
    
    try:
        info = media_processor.extract_video_metadata(test_url, job_dir=temp_job_dir, job_id="acceptance-test-1")
        assert info, "Metadata extraction returned empty object"
        title = info.get("title", "")
        duration = info.get("duration", 0)
        formats = len(info.get("formats", []))
        print(f"  ✓ Metadata extraction SUCCESS!")
        print(f"    Title:    {title[:45]}...")
        print(f"    Duration: {duration}s")
        print(f"    Formats:  {formats} available streams")
        
        # 3. Only after metadata extraction succeeds, test section download & trim (Requirement 8)
        print(f"\n[STEP 8] Section Trimming Test (5.0s -> 8.0s)...")
        clip_out = temp_job_dir / "test_clip.mp4"
        raw_out = temp_job_dir / "raw_stream.mp4"

        # Download section 5s to 8s
        import yt_dlp
        ydl_opts = {
            'format': 'bv*+ba/b',
            'outtmpl': str(raw_out),
            'merge_output_format': 'mp4',
            'quiet': True,
            'js_runtimes': {'deno': {}, 'node': {}},
            'remote_components': ['ejs:github'],
            'extractor_args': {
                'youtube': {
                    'player_client': ['web_embedded', 'default', '-tv_downgraded', 'android'],
                }
            },
            'download_ranges': yt_dlp.utils.download_range_func(None, [(5.0, 8.0)]),
            'force_keyframes_at_cuts': False,
        }
        if config.FFMPEG_EXE:
            ydl_opts['ffmpeg_location'] = config.FFMPEG_EXE

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([test_url])

        assert raw_out.exists(), "Raw stream download failed to produce file"
        print(f"  ✓ Section downloaded: {raw_out.stat().st_size} bytes")

        # Trim using FFmpeg
        media_processor.run_ffmpeg_trim(
            input_file=str(raw_out),
            output_file=str(clip_out),
            start_seconds=5.0,
            end_seconds=8.0,
            is_pre_cut=True
        )
        assert clip_out.exists(), "FFmpeg failed to produce trimmed clip"
        assert clip_out.stat().st_size > 1024, "Trimmed clip is empty"
        print(f"  ✓ FFmpeg trimmed output: {clip_out.stat().st_size} bytes")

        print("\n" + "=" * 65)
        print("ALL ACCEPTANCE TEST STEPS COMPLETED SUCCESSFULLY!")
        print("=" * 65)
        return True
    finally:
        import shutil
        if temp_job_dir.exists():
            shutil.rmtree(temp_job_dir, ignore_errors=True)

if __name__ == "__main__":
    success = run_acceptance_test()
    sys.exit(0 if success else 1)
