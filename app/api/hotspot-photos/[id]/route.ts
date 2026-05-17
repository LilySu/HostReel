import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspotPhotos, hotspots, videos, properties } from '@/lib/db/schema';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;

    // Single query to verify ownership of this photo's hotspot's video's property.
    const rows = await db
      .select({ photo: hotspotPhotos })
      .from(hotspotPhotos)
      .innerJoin(hotspots, eq(hotspotPhotos.hotspotId, hotspots.id))
      .innerJoin(videos, eq(hotspots.videoId, videos.id))
      .innerJoin(properties, eq(videos.propertyId, properties.id))
      .where(
        and(
          eq(hotspotPhotos.id, id),
          eq(properties.clerkUserId, userId),
        ),
      )
      .limit(1);
    const owned = rows[0];
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const storagePath = owned.photo.storagePath;
    await db.delete(hotspotPhotos).where(eq(hotspotPhotos.id, id));
    await storage.delete(storagePath);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
