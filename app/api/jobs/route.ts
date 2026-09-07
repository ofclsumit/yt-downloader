import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { CreateJobSchema } from '@/lib/validation';
import { createClipJob } from '@/lib/db';
import { pushJobToQueue, checkRateLimit } from '@/lib/redis';
import { extractYouTubeVideoId } from '@/lib/youtube';
import { ERROR_CODES, getFriendlyErrorMessage } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';

    // 1. Rate Limiting Check
    const rateLimit = await checkRateLimit(clientIp, 15, 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorCode: ERROR_CODES.RATE_LIMITED,
          message: getFriendlyErrorMessage(ERROR_CODES.RATE_LIMITED),
        },
        { status: 429 }
      );
    }

    // 2. Validate Request Body
    const body = await req.json().catch(() => ({}));
    const parseResult = CreateJobSchema.safeParse(body);

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          errorCode: ERROR_CODES.TIMESTAMP_INVALID,
          message: issue?.message || 'Invalid job input parameters.',
        },
        { status: 400 }
      );
    }

    const { url, startSeconds, endSeconds } = parseResult.data;
    const ytResult = extractYouTubeVideoId(url);

    if (!ytResult.valid || !ytResult.videoId) {
      return NextResponse.json(
        {
          success: false,
          errorCode: ERROR_CODES.INVALID_URL,
          message: getFriendlyErrorMessage(ERROR_CODES.INVALID_URL),
        },
        { status: 400 }
      );
    }

    // 3. Create Unique Job ID & Insert into PostgreSQL
    const jobId = crypto.randomUUID();

    try {
      await createClipJob({
        id: jobId,
        youtubeUrl: url,
        youtubeVideoId: ytResult.videoId,
        startSeconds,
        endSeconds,
        clientIp,
      });
    } catch (dbErr) {
      console.error('[Jobs API] Database insertion error:', dbErr);
      return NextResponse.json(
        {
          success: false,
          errorCode: ERROR_CODES.UNKNOWN_ERROR,
          message: 'Failed to record job in database.',
        },
        { status: 500 }
      );
    }

    // 4. Enqueue Job to Upstash Redis
    try {
      await pushJobToQueue(jobId);
    } catch (queueErr) {
      console.error('[Jobs API] Redis queue error:', queueErr);
      // Even if queue fails, job is safely in DB
    }

    // 5. Immediate Response (< 150ms)
    return NextResponse.json(
      {
        success: true,
        jobId,
        status: 'QUEUED',
        message: 'Job created and enqueued for processing.',
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    console.error('[Jobs API] Unexpected error in create job:', err);
    return NextResponse.json(
      {
        success: false,
        errorCode: ERROR_CODES.UNKNOWN_ERROR,
        message: getFriendlyErrorMessage(ERROR_CODES.UNKNOWN_ERROR),
      },
      { status: 500 }
    );
  }
}
