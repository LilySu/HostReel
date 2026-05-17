import { NextRequest, NextResponse } from 'next/server';
import { eq, max, count } from 'drizzle-orm';
import { z } from 'zod';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspotPhotos } from '@/lib/db/schema';
import { getHotspotForUser } from '@/lib/db/queries';
import {
  MAX_PHOTOS_PER_HOTSPOT,
  MAX_PHOTO_FILE_BYTES,
  PHOTO_MIME_TYPES,
} from '@/lib/validators';
import { newId } from '@/lib/slug';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

const requestSchema = z.object({
  contentType: z.enum([...PHOTO_MIME_TYPES] as [string, ...string[]]),
  sizeBytes: z.number().int().positive().max(MAX_PHOTO_FILE_BYTES),
});

function extForPhoto(t: string): '.jpg' | '.png' | '.webp' {
  if (t === 'image/png') return '.png';
  if (t === 'image/webp') return '.webp';
  return '.jpg';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id: hotspotId } = await params;
    const owned = await getHotspotForUser(hotspotId, userId);
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [{ n }] = await db
      .select({ n: count() })
      .from(hotspotPhotos)
      .where(eq(hotspotPhotos.hotspotId, hotspotId));
    if (n >= MAX_PHOTOS_PER_HOTSPOT) {
      return NextResponse.json(
        { error: `Max ${MAX_PHOTOS_PER_HOTSPOT} photos per hotspot` },
        { status: 400 },
      );
    }

    const [{ maxOrder }] = await db
      .select({ maxOrder: max(hotspotPhotos.orderIndex) })
      .from(hotspotPhotos)
      .where(eq(hotspotPhotos.hotspotId, hotspotId));
    const orderIndex = (maxOrder ?? -1) + 1;

    const photoId = newId();
    const ext = extForPhoto(parsed.data.contentType);
    const key = `properties/${owned.property.id}/videos/${owned.video.id}/hotspots/${hotspotId}/photo-${photoId}${ext}`;

    const [row] = await db
      .insert(hotspotPhotos)
      .values({
        id: photoId,
        hotspotId,
        storagePath: key,
        orderIndex,
      })
      .returning();

    const { url, headers } = await storage.presignedUpload(
      key,
      parsed.data.contentType,
      900,
    );
    return NextResponse.json(
      { photo: row, uploadUrl: url, uploadHeaders: headers },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
