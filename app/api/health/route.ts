import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/db';
import { pingRedis } from '@/lib/redis';
import { isR2Configured } from '@/lib/r2';

export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    pingDatabase().catch(() => false),
    pingRedis().catch(() => false),
  ]);
  const r2Ok = isR2Configured();

  const isHealthy = dbOk && redisOk && r2Ok;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      services: {
        database: dbOk ? 'connected' : 'disconnected',
        redis: redisOk ? 'connected' : 'disconnected',
        storage_r2: r2Ok ? 'configured' : 'missing_credentials',
      },
      architecture: {
        frontend: 'Next.js App Router on Vercel',
        worker: 'Python Background Worker on Render',
        mediaProcessor: 'yt-dlp (section-aware) + FFmpeg',
        queue: 'Upstash Redis',
        storage: 'Cloudflare R2 Object Storage',
      },
      timestamp: new Date().toISOString(),
    },
    { status: isHealthy ? 200 : 207 }
  );
}
