import requests
import time

def test_live_pipeline():
    print("Submitting live clip job to https://yt2clip-umber.vercel.app/api/jobs ...")
    res = requests.post(
        "https://yt2clip-umber.vercel.app/api/jobs",
        json={
            "url": "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "startSeconds": 2,
            "endSeconds": 7
        },
        timeout=10
    )
    print("Create Job Response:", res.status_code, res.json())
    data = res.json()
    job_id = data.get("jobId")
    if not job_id:
        print("Failed to get job ID!")
        return

    print(f"Tracking Job ID: {job_id}")
    for i in range(25):
        time.sleep(3)
        s_res = requests.get(f"https://yt2clip-umber.vercel.app/api/jobs/{job_id}", timeout=10)
        s_data = s_res.json()
        status = s_data.get("status")
        progress = s_data.get("progress")
        print(f"[{i+1}] Status: {status} | Progress: {progress}%")
        
        if status == "COMPLETED":
            print("Job COMPLETED successfully!")
            dl_res = requests.get(f"https://yt2clip-umber.vercel.app/api/jobs/{job_id}/download", timeout=10)
            print("Download Endpoint Response:", dl_res.json())
            break
        elif status == "FAILED":
            print("Job FAILED! Error:", s_data.get("errorMessage"))
            break

if __name__ == "__main__":
    test_live_pipeline()
