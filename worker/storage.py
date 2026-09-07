"""
Cloudflare R2 Object Storage client.
Uses boto3 with S3-compatible API to upload clips, generate presigned URLs, and delete expired files.
"""
import logging
from pathlib import Path
from typing import Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from worker import config

logger = logging.getLogger("worker.storage")

_s3_client = None

def get_s3_client():
    global _s3_client
    if _s3_client is None:
        if not config.R2_ACCOUNT_ID or not config.R2_ACCESS_KEY_ID or not config.R2_SECRET_ACCESS_KEY:
            logger.warning("Cloudflare R2 credentials are incomplete. Storage operations will fail.")
        
        _s3_client = boto3.client(
            "s3",
            endpoint_url=config.R2_ENDPOINT_URL,
            aws_access_key_id=config.R2_ACCESS_KEY_ID,
            aws_secret_access_key=config.R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto"
        )
    return _s3_client

def upload_clip(local_file_path: str, object_key: str, content_type: str = "video/mp4") -> str:
    """
    Uploads a media clip from local disk to Cloudflare R2.
    Returns the object key.
    """
    s3 = get_s3_client()
    path = Path(local_file_path)
    if not path.exists() or path.stat().st_size == 0:
        raise ValueError(f"File at '{local_file_path}' does not exist or is empty.")
    
    logger.info(f"Uploading {local_file_path} ({path.stat().st_size} bytes) to r2://{config.R2_BUCKET_NAME}/{object_key}")
    
    extra_args = {
        "ContentType": content_type,
        "CacheControl": "public, max-age=3600"
    }
    
    s3.upload_file(
        Filename=str(path),
        Bucket=config.R2_BUCKET_NAME,
        Key=object_key,
        ExtraArgs=extra_args
    )
    logger.info(f"Successfully uploaded {object_key}")
    return object_key

def generate_presigned_download_url(
    object_key: str,
    expiration_seconds: int = 900,
    download_filename: Optional[str] = None
) -> str:
    """
    Generates a short-lived (default 15 minutes) signed URL directly from Cloudflare R2.
    Optionally sets Content-Disposition header with friendly filename.
    """
    s3 = get_s3_client()
    params = {
        "Bucket": config.R2_BUCKET_NAME,
        "Key": object_key
    }
    if download_filename:
        # Sanitize filename for header
        safe_name = download_filename.replace('"', '').strip()
        params["ResponseContentDisposition"] = f'attachment; filename="{safe_name}"'
    
    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params=params,
        ExpiresIn=expiration_seconds
    )
    return url

def delete_clip(object_key: str) -> bool:
    """Deletes an object from Cloudflare R2."""
    s3 = get_s3_client()
    try:
        logger.info(f"Deleting expired object from R2: {object_key}")
        s3.delete_object(Bucket=config.R2_BUCKET_NAME, Key=object_key)
        return True
    except ClientError as e:
        logger.error(f"Failed to delete {object_key} from R2: {e}")
        return False
