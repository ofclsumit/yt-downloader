import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'YouTube Timestamp Clipper | Distributed Asynchronous Media System',
  description:
    'Extract and download frame-accurate video clips from any YouTube video using section-aware downloading, FFmpeg, and Cloudflare R2 storage.',
  keywords: ['YouTube Clipper', 'Video Trimmer', 'FFmpeg', 'yt-dlp', 'Render Worker', 'Cloudflare R2'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased min-h-screen flex flex-col bg-[#080c14] text-slate-100 selection:bg-indigo-500 selection:text-white">
        <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.15),rgba(255,255,255,0))] z-0" />
        <main className="relative z-10 flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
