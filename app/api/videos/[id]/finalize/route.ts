import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { videos } from '@/lib/db/schema';
import { getVideoForUser } from '@/lib/db/queries';
import { storage, isR2 } from '@/lib/storage';
import { probeVideo } from '@/lib/video/probe';
import { extractPosterFrame } from '@/lib/video/poster';
import { MAX_VIDEO_DURATION_SECONDS } from '@/lib/validators';

// Called by the browser after the presigned PUT to `storagePath` succeeds.
// We probe duration + dimensions and extract a poster frame. On R2 the object
// is streamed to a temp file first (ffmpeg can't read https URLs reliably and
// R2StorageProvider.absolutePath() throws on purpose).
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id: videoId } = await params;
    const owned = await getVideoForUser(videoId, userId);
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { video } = owned;

    if (video.status === 'ready') {
      // Idempotent: another tab already finalized
      return NextResponse.json({ video });
    }

    const key = video.storagePath;
    if (!key) {
      return failWithStatus(videoId, 400, 'No storage path on video');
    }

    let sourcePathOnDisk: string;
    let tempPathToCleanup: string | null = null;

    if (isR2) {
      const result = await storage.read(key);
      if (!result) {
        return failWithStatus(videoId, 400, 'Upload never reached storage');
      }
      const ext = path.extname(key) || '.mp4';
      tempPathToCleanup = path.join(
        os.tmpdir(),
        `hostreel-${videoId}-${Date.now()}${ext}`,
      );
      await pipeline(result.stream, fs.createWriteStream(tempPathToCleanup));
      sourcePathOnDisk = tempPathToCleanup;
    } else {
      try {
        sourcePathOnDisk = await storage.absolutePath(key);
      } catch {
        return failWithStatus(videoId, 400, 'Upload never reached storage');
      }
      if (!fs.existsSync(sourcePathOnDisk)) {
        return failWithStatus(videoId, 400, 'Upload never reached storage');
      }
    }

    try {
      let probe;
      try {
        probe = await probeVideo(sourcePathOnDisk);
      } catch {
        await storage.delete(key);
        return failWithStatus(videoId, 400, 'Could not read video file');
      }

      if (probe.durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
        await storage.delete(key);
        return failWithStatus(
          videoId,
          400,
          `Video exceeds ${MAX_VIDEO_DURATION_SECONDS}s limit`,
        );
      }

      // Poster extraction is non-fatal — the source video itself is fine
      // either way. Buffer is small (~50–200KB) so save() is safe on R2.
      const posterKey = `properties/${owned.property.id}/videos/${videoId}/poster.jpg`;
      let posterSaved: string | null = null;
      try {
        const posterBuffer = await extractPosterFrame(sourcePathOnDisk, 1);
        await storage.save(posterBuffer, posterKey, 'image/jpeg');
        posterSaved = posterKey;
      } catch (err) {
        console.warn('poster extraction failed', { videoId, err });
      }

      const [row] = await db
        .update(videos)
        .set({
          posterPath: posterSaved,
          durationSeconds: probe.durationSeconds,
          widthPx: probe.widthPx,
          heightPx: probe.heightPx,
          status: 'ready',
        })
        .where(eq(videos.id, videoId))
        .returning();

      return NextResponse.json({ video: row });
    } finally {
      if (tempPathToCleanup) {
        try {
          await fsp.unlink(tempPathToCleanup);
        } catch {
          // best-effort cleanup
        }
      }
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}

async function failWithStatus(
  videoId: string,
  httpStatus: number,
  message: string,
) {
  await db.update(videos).set({ status: 'failed' }).where(eq(videos.id, videoId));
  return NextResponse.json({ error: message }, { status: httpStatus });
}
