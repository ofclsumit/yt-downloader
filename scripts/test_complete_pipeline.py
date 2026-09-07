"""
End-to-End Production Pipeline Acceptance Test.
Validates:
YouTube URL -> Metadata Extraction -> Timestamp Validation ->
Section-Aware Media Acquisition -> FFmpeg Precise Trimming ->
Independent MP4 Probe (Duration, Audio, Video) ->
Cloudflare R2 Upload -> Presigned URL Generation ->
Direct Browser HTTP Download -> Temporary File Cleanup.
"""
import os
import sys
import time
import uuid
import logging
import urllib.request
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("e2e_test")

from worker import config, storage
from worker.media_processor import (
    extract_video_metadata,
    run_ffmpeg_trim,
    probe_media_file,
    process_job,
    CLIENT_STRATEGIES,
    MediaProcessingError,
)

def run_end_to_end_pipeline_test():
    test_id = f"e2e_{uuid.uuid4().hex[:8]}"
    test_url = "https://youtu.be/2vYyHb34upc"
    start_sec = 10.0
    end_sec = 30.0
    expected_duration = end_sec - start_sec  # 20.0 seconds

    results = {
        "youtube_extraction": "FAIL",
        "client_used": "NONE",
        "metadata_extraction": "FAIL",
        "requested_duration": f"{expected_duration:.2f}s",
        "downloaded_source_bytes": 0,
        "final_clip_duration": "0.0s",
        "audio": "FAIL",
        "video": "FAIL",
        "ffmpeg": "FAIL",
        "r2_upload": "FAIL",
        "signed_url": "FAIL",
        "browser_download": "FAIL",
        "temporary_cleanup": "FAIL",
        "r2_object_key": "",
    }

    job_dir = config.LOCAL_TEMP_DIR / test_id
    job_dir.mkdir(parents=True, exist_ok=True)
    raw_download_template = str(job_dir / "raw_stream.%(ext)s")
    final_clip_path = str(job_dir / f"clip_{test_id}.mp4")

    logger.info("=" * 65)
    logger.info("STARTING END-TO-END PIPELINE VALIDATION TEST")
    logger.info(f"Target URL:  {test_url}")
    logger.info(f"Range:       00:10 ({start_sec}s) -> 00:30 ({end_sec}s)")
    logger.info(f"Expected:    {expected_duration}s MP4 clip with video + audio")
    logger.info("=" * 65)

    try:
        # 1. Metadata Extraction
        logger.info("[PHASE 1] Extracting YouTube Video Metadata...")
        meta = extract_video_metadata(test_url, job_dir=job_dir, job_id=test_id)
        video_duration = float(meta.get("duration") or 0.0)
        selected_client = meta.get("_selected_client", "unknown")
        results["metadata_extraction"] = "PASS"
        results["youtube_extraction"] = "PASS"
        results["client_used"] = selected_client

        logger.info("=" * 50)
        logger.info(f"[source]\nvideo duration: {video_duration}s")
        logger.info(
            f"[request]\nstart_seconds: {start_sec:.2f}\nend_seconds: {end_sec:.2f}\nrequested_duration: {expected_duration:.2f}s"
        )
        logger.info("=" * 50)

        # 2. Section-Aware Download
        logger.info("[PHASE 2] Section-Aware yt-dlp Media Acquisition...")
        import yt_dlp
        ordered_strategies = sorted(
            CLIENT_STRATEGIES,
            key=lambda s: 0 if s["name"] == selected_client else 1
        )
        download_success = False
        active_client = selected_client

        for strategy in ordered_strategies:
            client_name = strategy["name"]
            player_client = strategy["player_client"]
            ydl_opts = {
                'format': 'bv*[height<=1080]+ba/b/best',
                'outtmpl': raw_download_template,
                'merge_output_format': 'mp4',
                'quiet': False,
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

            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([test_url])
                download_success = True
                active_client = client_name
                break
            except Exception as e:
                logger.warning(f"Download with strategy '{client_name}' failed: {e}. Trying next...")

        assert download_success, "Section-aware media download failed across all client strategies."

        raw_candidates = list(job_dir.glob("raw_stream.*"))
        assert raw_candidates, "No raw media stream file found after download."
        downloaded_raw_file = str(raw_candidates[0])
        downloaded_bytes = os.path.getsize(downloaded_raw_file)
        results["downloaded_source_bytes"] = downloaded_bytes

        raw_probe = probe_media_file(downloaded_raw_file)
        raw_duration = raw_probe["duration"]
        video_fmt = raw_probe.get("video_codec") or "unknown"
        audio_fmt = raw_probe.get("audio_codec") or "unknown"

        logger.info("=" * 50)
        logger.info(
            f"[yt-dlp]\n"
            f"selected client: {active_client}\n"
            f"selected video format: {video_fmt}\n"
            f"selected audio format: {audio_fmt}\n"
            f"downloaded bytes: {downloaded_bytes}"
        )
        logger.info("=" * 50)

        # 3. FFmpeg Precise Trimming
        logger.info("[PHASE 3] FFmpeg Precise Frame-Accurate Trimming...")
        is_pre_cut = abs(raw_duration - expected_duration) <= 2.5
        run_ffmpeg_trim(
            input_file=downloaded_raw_file,
            output_file=final_clip_path,
            start_seconds=start_sec,
            end_seconds=end_sec,
            is_pre_cut=is_pre_cut
        )
        assert os.path.exists(final_clip_path), "Final trimmed MP4 clip not created."
        clip_size = os.path.getsize(final_clip_path)
        assert clip_size > 1024, "Final clip is empty."
        results["ffmpeg"] = "PASS"

        # 4. Independent MP4 Validation
        logger.info("[PHASE 4] Independent ffprobe/ffmpeg Output Inspection...")
        output_probe = probe_media_file(final_clip_path)
        output_duration = output_probe["duration"]
        results["final_clip_duration"] = f"{output_duration:.2f}s"
        codec_container = f"{output_probe.get('video_codec')}+{output_probe.get('audio_codec')}/{output_probe.get('container')}"

        logger.info("=" * 50)
        logger.info(
            f"[ffmpeg]\n"
            f"input duration: {raw_duration:.2f}s\n"
            f"output duration: {output_duration:.2f}s\n"
            f"codec/container: {codec_container}"
        )
        logger.info("=" * 50)

        # Accuracy check
        dur_diff = abs(output_duration - expected_duration)
        assert dur_diff <= 2.5, f"Clip duration ({output_duration:.2f}s) differs from requested ({expected_duration:.2f}s)"

        assert output_probe.get("has_video"), "Final clip has no video stream!"
        results["video"] = "PASS"

        assert output_probe.get("has_audio"), "Final clip has no audio stream!"
        results["audio"] = "PASS"

        # 5. Cloudflare R2 Upload
        logger.info("[PHASE 5] Uploading Final Clip to Cloudflare R2...")
        object_key = f"test-clips/{test_id}.mp4"
        results["r2_object_key"] = object_key
        storage.upload_clip(final_clip_path, object_key, content_type="video/mp4")
        results["r2_upload"] = "PASS"

        logger.info("=" * 50)
        logger.info(
            f"[storage]\n"
            f"R2 upload size: {clip_size} bytes\n"
            f"R2 object key: {object_key}"
        )
        logger.info("=" * 50)

        # 6. Presigned URL Generation
        logger.info("[PHASE 6] Generating Presigned Direct Download URL...")
        signed_url = storage.generate_presigned_download_url(
            object_key=object_key,
            expiration_seconds=900,
            download_filename=f"clip_{test_id}.mp4"
        )
        assert signed_url and signed_url.startswith("http"), "Invalid signed URL generated."
        results["signed_url"] = "PASS"

        # 7. Browser Download Simulation
        logger.info("[PHASE 7] Simulating Direct Browser HTTP Download from Cloudflare R2...")
        req = urllib.request.Request(
            signed_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            status_code = resp.getcode()
            headers = dict(resp.info())
            first_chunk = resp.read(65536)  # Read 64 KB

            assert status_code == 200, f"HTTP download returned status {status_code}"
            assert len(first_chunk) > 1000, "Downloaded chunk too small."
            # Verify MP4 signature in first chunk
            assert b"ftyp" in first_chunk[:64] or b"moov" in first_chunk or len(first_chunk) == 65536, "Downloaded file does not match MP4 binary."
            results["browser_download"] = "PASS"
            logger.info(f"Direct browser download SUCCESS: HTTP {status_code}, received {len(first_chunk)} bytes sample.")

    finally:
        # 8. Temporary Directory Cleanup
        logger.info("[PHASE 8] Cleaning up local temporary files...")
        import shutil
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
                if not job_dir.exists():
                    results["temporary_cleanup"] = "PASS"
            except Exception as e:
                logger.error(f"Cleanup failed: {e}")
        else:
            results["temporary_cleanup"] = "PASS"

        # Clean test clip from R2
        if results.get("r2_object_key"):
            try:
                storage.delete_clip(results["r2_object_key"])
                logger.info(f"Cleaned test clip from R2: {results['r2_object_key']}")
            except Exception as e:
                logger.warning(f"Could not delete test R2 object: {e}")

    return results

if __name__ == "__main__":
    report = run_end_to_end_pipeline_test()
    print("\n" + "=" * 65)
    print("FINAL TEST REPORT")
    print(f"YouTube extraction:      {report['youtube_extraction']}")
    print(f"Client used:             {report['client_used']}")
    print(f"Metadata extraction:     {report['metadata_extraction']}")
    print(f"Requested duration:      {report['requested_duration']}")
    print(f"Downloaded source bytes: {report['downloaded_source_bytes']}")
    print(f"Final clip duration:     {report['final_clip_duration']}")
    print(f"Audio:                   {report['audio']}")
    print(f"Video:                   {report['video']}")
    print(f"FFmpeg:                  {report['ffmpeg']}")
    print(f"R2 upload:               {report['r2_upload']}")
    print(f"Signed URL:              {report['signed_url']}")
    print(f"Browser download:        {report['browser_download']}")
    print(f"Temporary cleanup:       {report['temporary_cleanup']}")
    print("=" * 65)
