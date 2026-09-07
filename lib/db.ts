import { Pool } from 'pg';

// Global cache for connection pool in serverless environments
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not configured.');
  }

  if (!global._pgPool) {
    global._pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    });
  }

  return global._pgPool;
}

export interface ClipJobRow {
  id: string;
  youtube_url: string;
  youtube_video_id: string;
  title: string | null;
  start_seconds: number;
  end_seconds: number;
  requested_duration: number;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  progress: number;
  error_code: string | null;
  error_message: string | null;
  r2_object_key: string | null;
  r2_bucket: string | null;
  file_size_bytes: number | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  client_ip: string | null;
}

export async function createClipJob(params: {
  id: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  startSeconds: number;
  endSeconds: number;
  clientIp?: string;
}): Promise<ClipJobRow> {
  const pool = getPool();
  const requestedDuration = params.endSeconds - params.startSeconds;

  const query = `
    INSERT INTO clip_jobs (
      id,
      youtube_url,
      youtube_video_id,
      start_seconds,
      end_seconds,
      requested_duration,
      status,
      progress,
      client_ip,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', 0, $7, NOW())
    RETURNING *;
  `;

  const values = [
    params.id,
    params.youtubeUrl,
    params.youtubeVideoId,
    params.startSeconds,
    params.endSeconds,
    requestedDuration,
    params.clientIp || null,
  ];

  const result = await pool.query<ClipJobRow>(query, values);
  return result.rows[0];
}

export async function getClipJobById(jobId: string): Promise<ClipJobRow | null> {
  const pool = getPool();
  const query = `SELECT * FROM clip_jobs WHERE id = $1;`;
  const result = await pool.query<ClipJobRow>(query, [jobId]);
  return result.rows[0] || null;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const pool = getPool();
    const res = await pool.query('SELECT 1;');
    return res.rowCount !== null && res.rowCount > 0;
  } catch {
    return false;
  }
}
