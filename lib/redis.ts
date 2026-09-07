import { Redis } from '@upstash/redis';

const QUEUE_KEY = process.env.REDIS_QUEUE_KEY || 'yt_clip_jobs';

let _redisInstance: Redis | null = null;

function getRedisClient(): Redis | null {
  if (_redisInstance) return _redisInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    _redisInstance = new Redis({ url, token });
    return _redisInstance;
  }

  return null;
}

export async function pushJobToQueue(jobId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    console.warn('[Queue Warning] Upstash Redis credentials not configured. Job stored in DB only.');
    return false;
  }

  try {
    await redis.rpush(QUEUE_KEY, jobId);
    return true;
  } catch (err) {
    console.error(`[Queue Error] Failed to push job ${jobId} to Redis queue:`, err);
    throw new Error('Failed to enqueue clip processing job.');
  }
}

export async function checkRateLimit(
  clientIp: string,
  maxRequests = 10,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedisClient();
  if (!redis) {
    // If Redis is not configured, allow requests in local development
    return { allowed: true, remaining: maxRequests };
  }

  const key = `ratelimit:${clientIp}`;
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - current);
    return {
      allowed: current <= maxRequests,
      remaining,
    };
  } catch (err) {
    console.error('[RateLimit Error] Redis error checking rate limit:', err);
    // Fail open if Redis is temporarily unreachable so users aren't blocked
    return { allowed: true, remaining: 1 };
  }
}

export async function pingRedis(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch {
    return false;
  }
}
