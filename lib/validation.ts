import { z } from 'zod';
import { extractYouTubeVideoId } from './youtube';

const MAX_CLIP_DURATION = parseInt(process.env.MAX_CLIP_DURATION_SECONDS || '300', 10);

export const CreateJobSchema = z.object({
  url: z.string().trim().min(1, 'YouTube URL is required').refine((val) => {
    const res = extractYouTubeVideoId(val);
    return res.valid;
  }, {
    message: 'Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.'
  }),
  startSeconds: z.number().min(0, 'Start timestamp cannot be negative'),
  endSeconds: z.number().min(0.1, 'End timestamp must be greater than zero'),
  quality: z.string().optional().default('1080'),
}).refine((data) => data.endSeconds > data.startSeconds, {
  message: 'End timestamp must be strictly greater than start timestamp',
  path: ['endSeconds'],
}).refine((data) => (data.endSeconds - data.startSeconds) <= MAX_CLIP_DURATION, {
  message: `Clip duration exceeds maximum limit of ${MAX_CLIP_DURATION} seconds (${Math.round(MAX_CLIP_DURATION / 60)} minutes)`,
  path: ['endSeconds'],
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
