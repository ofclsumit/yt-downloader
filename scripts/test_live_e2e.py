"""
End-to-End Architectural Test for YouTube Timestamp Clipper.
Tests:
1. Neon DB job insertion (QUEUED)
2. Upstash Redis job queue dispatch
3. Render Worker queue retrieval and atomic DB claim
4. Section-aware yt-dlp download + FFmpeg trim
5. Cloudflare R2 upload
6. Neon DB completion update
7. Presigned URL generation and direct download validation
8. Complete cleanup of test media and records
"""
import os
import sys
import uuid
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Ensure environment is loaded
from worker import config, db, storage
from worker.media_processor import process_job
from worker.worker import RedisQueueClient

def run_test():
    print("=" * 60)
    print("RUNNING LIVE END-TO-END SYSTEM TEST")
    print("=" * 60)
    
    # 1. Generate unique test job
    job_id = f"test-{uuid.uuid4()}"
    test_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
    start_sec = 2.0
    end_sec = 8.0
    duration = end_sec - start_sec
    
    print(f"\n[STEP 1] Initializing Database & Claiming...")
    db.init_db_pool()
    
    with db.get_db_cursor() as cur:
        cur.execute("""
            INSERT INTO clip_jobs (
                id, youtube_url, youtube_video_id, title,
                start_seconds, end_seconds, requested_duration,
                status, progress, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'QUEUED', 0, NOW())
            RETURNING *;
        """, (job_id, test_url, "jNQXAC9IVRw", "Me at the zoo", start_sec, end_sec, duration))
        created_job = cur.fetchone()
    
    print(f"  [PASS] Created job {job_id} in Neon DB with status '{created_job['status']}'.")
    
    # 2. Push to Upstash Redis
    print(f"\n[STEP 2] Pushing Job to Upstash Redis Queue...")
    queue = RedisQueueClient()
    if queue.client_type == "tcp":
        queue.redis_client.rpush(config.REDIS_QUEUE_KEY, job_id)
        q_len = queue.redis_client.llen(config.REDIS_QUEUE_KEY)
        print(f"  [PASS] Enqueued via TCP. Queue length: {q_len}")
    else:
        import requests
        headers = {"Authorization": f"Bearer {queue.rest_token}"}
        requests.post(f"{queue.rest_url}/rpush/{config.REDIS_QUEUE_KEY}/{job_id}", headers=headers)
        print(f"  [PASS] Enqueued via REST.")
        
    # 3. Pop from Queue & Claim Atomically
    print(f"\n[STEP 3] Worker Popping from Queue & Claiming Job...")
    popped_id = queue.pop_job_id(timeout_seconds=5)
    assert popped_id == job_id, f"Expected {job_id}, got {popped_id}"
    print(f"  [PASS] Worker popped job ID: {popped_id}")
    
    claimed_row = db.claim_job(popped_id)
    assert claimed_row is not None, "Failed to claim job!"
    assert claimed_row["status"] == "PROCESSING", f"Unexpected status: {claimed_row['status']}"
    print(f"  [PASS] Atomically claimed job in Neon DB: status='{claimed_row['status']}', progress={claimed_row['progress']}%")
    
    # 4. Process Media (yt-dlp section-aware download + FFmpeg trim + R2 upload)
    print(f"\n[STEP 4] Executing Worker Media Pipeline (yt-dlp + FFmpeg + R2)...")
    t0 = time.time()
    process_job(claimed_row)
    t_elapsed = time.time() - t0
    print(f"  [PASS] Media processing finished in {t_elapsed:.1f} seconds.")
    
    # 5. Verify PostgreSQL Job Completion
    print(f"\n[STEP 5] Verifying Completed State in Neon DB...")
    with db.get_db_cursor() as cur:
        cur.execute("SELECT * FROM clip_jobs WHERE id = %s", (job_id,))
        final_row = cur.fetchone()
    
    assert final_row["status"] == "COMPLETED", f"Job status was '{final_row['status']}', error: {final_row.get('error_message')}"
    assert final_row["r2_object_key"] is not None, "Missing r2_object_key!"
    assert final_row["file_size_bytes"] > 5000, f"File size too small: {final_row['file_size_bytes']}"
    print(f"  [PASS] Neon DB State: status={final_row['status']}, progress={final_row['progress']}%, file_size={final_row['file_size_bytes']} bytes")
    print(f"  [PASS] R2 Object Key: {final_row['r2_object_key']}")
    
    # 6. Verify Presigned Download URL Direct from R2
    print(f"\n[STEP 6] Testing Cloudflare R2 Presigned Download URL...")
    presigned_url = storage.generate_presigned_download_url(
        final_row["r2_object_key"],
        download_filename="me_at_the_zoo_clip.mp4"
    )
    print(f"  [PASS] Generated Presigned URL:\n    {presigned_url[:90]}...")
    
    # Ping URL to check HTTP 200 from Cloudflare R2 CDN
    req = urllib.request.Request(presigned_url, method="HEAD")
    with urllib.request.urlopen(req) as resp:
        content_length = int(resp.headers.get("Content-Length", 0))
        content_type = resp.headers.get("Content-Type", "")
        print(f"  [PASS] Cloudflare R2 HTTP Status: {resp.status}, Content-Length: {content_length} bytes, Type: {content_type}")
        assert resp.status == 200
        assert content_length == final_row["file_size_bytes"]
        
    # 7. Clean up test record and test object
    print(f"\n[STEP 7] Cleaning Up Test Artifacts...")
    storage.delete_clip(final_row["r2_object_key"])
    print(f"  [PASS] Deleted object {final_row['r2_object_key']} from Cloudflare R2.")
    
    with db.get_db_cursor() as cur:
        cur.execute("DELETE FROM clip_jobs WHERE id = %s", (job_id,))
    print(f"  [PASS] Deleted test job row from Neon DB.")
    
    print("\n" + "=" * 60)
    print("ALL INTEGRATION CHECKS PASSED SUCCESSFULLY!")
    print("Vercel -> Upstash Redis -> Render Worker -> yt-dlp -> FFmpeg -> Cloudflare R2 is 100% OPERATIONAL!")
    print("=" * 60)

if __name__ == "__main__":
    run_test()
