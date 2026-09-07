import { NextRequest, NextResponse } from 'next/server';
import { getClipJobById } from '@/lib/db';
import { getFriendlyErrorMessage } from '@/lib/errors';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
    if (!id || !isUuid) {
      return NextResponse.json(
        { error: 'A valid UUID job ID is required' },
        { status: 400 }
      );
    }

    const job = await getClipJobById(id);
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check expiration
    const isExpired =
      job.status === 'EXPIRED' ||
      (job.expires_at && new Date(job.expires_at) < new Date());

    const currentStatus = isExpired ? 'EXPIRED' : job.status;

    return NextResponse.json({
      jobId: job.id,
      status: currentStatus,
      progress: job.progress,
      title: job.title || 'YouTube Clip',
      startSeconds: job.start_seconds,
      endSeconds: job.end_seconds,
      requestedDuration: job.requested_duration,
      downloadAvailable: currentStatus === 'COMPLETED',
      errorCode: job.error_code,
      errorMessage: job.error_code
        ? getFriendlyErrorMessage(job.error_code, job.error_message)
        : null,
      fileSizeBytes: job.file_size_bytes,
      createdAt: job.created_at,
      completedAt: job.completed_at,
      expiresAt: job.expires_at,
    });
  } catch (err) {
    console.error('[Jobs Status API] Error fetching job:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve job status' },
      { status: 500 }
    );
  }
}
