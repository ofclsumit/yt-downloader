import { NextRequest, NextResponse } from 'next/server';
import { getClipJobById } from '@/lib/db';
import { generateSignedDownloadUrl } from '@/lib/r2';
import { ERROR_CODES, getFriendlyErrorMessage } from '@/lib/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
    if (!id || !isUuid) {
      return NextResponse.json({ error: 'A valid UUID job ID is required' }, { status: 400 });
    }

    const job = await getClipJobById(id);
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Validate job completion
    if (job.status !== 'COMPLETED') {
      return NextResponse.json(
        {
          error: 'Clip processing is not completed yet.',
          status: job.status,
          progress: job.progress,
        },
        { status: 400 }
      );
    }

    // Validate expiration
    if (job.expires_at && new Date(job.expires_at) < new Date()) {
      return NextResponse.json(
        {
          error: 'This clip has expired and has been deleted according to the retention policy.',
          status: 'EXPIRED',
        },
        { status: 410 }
      );
    }

    if (!job.r2_object_key) {
      return NextResponse.json(
        {
          errorCode: ERROR_CODES.STORAGE_FAILED,
          message: getFriendlyErrorMessage(ERROR_CODES.STORAGE_FAILED),
        },
        { status: 500 }
      );
    }

    // Generate safe download filename
    const cleanTitle = (job.title || 'youtube_clip')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const startSec = Math.floor(job.start_seconds);
    const endSec = Math.floor(job.end_seconds);
    const filename = `${cleanTitle}_${startSec}s_${endSec}s.mp4`;

    // Generate Cloudflare R2 short-lived signed URL (15 minutes)
    const signedDownloadUrl = await generateSignedDownloadUrl(
      job.r2_object_key,
      filename,
      900
    );

    // Check if client requested a direct redirect or JSON
    const wantsRedirect = req.nextUrl.searchParams.get('redirect') === 'true';
    if (wantsRedirect) {
      return NextResponse.redirect(signedDownloadUrl, 302);
    }

    return NextResponse.json({
      success: true,
      jobId: job.id,
      downloadUrl: signedDownloadUrl,
      fileName: filename,
      expiresInSeconds: 900,
    });
  } catch (err) {
    console.error('[Download API] Error generating signed download URL:', err);
    return NextResponse.json(
      {
        errorCode: ERROR_CODES.STORAGE_FAILED,
        message: 'Could not generate secure download link.',
      },
      { status: 500 }
    );
  }
}
