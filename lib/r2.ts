import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'yt-clips';

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client | null {
  if (_s3Client) return _s3Client;

  if (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    return _s3Client;
  }

  return null;
}

export async function generateSignedDownloadUrl(
  objectKey: string,
  downloadFileName?: string,
  expiresInSeconds = 900 // 15 minutes
): Promise<string> {
  const client = getS3Client();
  if (!client) {
    throw new Error('Cloudflare R2 credentials are not configured on the server.');
  }

  const safeName = (downloadFileName || 'clip.mp4').replace(/["\r\n]/g, '').trim();

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: objectKey,
    ResponseContentDisposition: `attachment; filename="${safeName}"`,
  });

  return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export function isR2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}
