import { NextRequest } from 'next/server';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Streams media files (videos, photos, posters) from the StorageProvider.
 * Supports HTTP Range requests so the browser can seek in <video> elements.
 *
 * Public route — slugs / paths are obscure but not authenticated. Same model as
 * S3 presigned URLs would use later: knowing the path is enough.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;
  const key = pathSegments.join('/');

  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
    if (!match) {
      return new Response('Invalid Range header', { status: 416 });
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : Infinity;

    // We need the size to clamp `end` — peek via read() first
    const head = await storage.read(key);
    if (!head) return new Response('Not found', { status: 404 });
    // Release the full-file stream we just opened
    if ('destroy' in head.stream && typeof (head.stream as { destroy?: () => void }).destroy === 'function') {
      (head.stream as { destroy: () => void }).destroy();
    }

    const end = Math.min(requestedEnd, head.size - 1);
    if (start >= head.size || start > end) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${head.size}` },
      });
    }

    const range = await storage.readRange(key, start, end);
    if (!range) return new Response('Not found', { status: 404 });

    return new Response(range.stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Type': range.contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${range.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const file = await storage.read(key);
  if (!file) return new Response('Not found', { status: 404 });

  return new Response(file.stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
