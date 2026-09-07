import { NextRequest, NextResponse } from 'next/server';
import { extractYouTubeVideoId, getYouTubeThumbnailUrl } from '@/lib/youtube';
import { ERROR_CODES, getFriendlyErrorMessage } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body.url;

    const ytResult = extractYouTubeVideoId(rawUrl);
    if (!ytResult.valid || !ytResult.videoId) {
      return NextResponse.json(
        {
          valid: false,
          errorCode: ERROR_CODES.INVALID_URL,
          message: ytResult.error || getFriendlyErrorMessage(ERROR_CODES.INVALID_URL),
        },
        { status: 400 }
      );
    }

    const videoId = ytResult.videoId;
    const standardThumbnail = getYouTubeThumbnailUrl(videoId, 'hq');

    // Fetch public oEmbed data for video title & author
    let title = 'YouTube Video';
    let author = 'YouTube Creator';
    let customThumbnail = standardThumbnail;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const res = await fetch(oembedUrl, {
        headers: { 'User-Agent': 'YouTubeClipBot/1.0' },
        next: { revalidate: 3600 },
      });

      if (res.ok) {
        const data = await res.json();
        title = data.title || title;
        author = data.author_name || author;
        customThumbnail = data.thumbnail_url || standardThumbnail;
      }
    } catch {
      // If oEmbed fails (network/CORS), fallback to default thumbnail & title
    }

    return NextResponse.json({
      valid: true,
      videoId,
      title,
      author,
      thumbnail: customThumbnail,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch (err) {
    console.error('[Analyze API] Error analyzing video:', err);
    return NextResponse.json(
      {
        valid: false,
        errorCode: ERROR_CODES.UNKNOWN_ERROR,
        message: 'Unable to analyze the YouTube video URL.',
      },
      { status: 500 }
    );
  }
}
