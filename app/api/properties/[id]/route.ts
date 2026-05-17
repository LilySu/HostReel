import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties, videos, hotspots, hotspotPhotos } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { updatePropertySchema } from '@/lib/validators';
import { storage } from '@/lib/storage';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getPropertyForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = updatePropertySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const [row] = await db
      .update(properties)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(properties.id, id))
      .returning();
    return NextResponse.json({ property: row });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getPropertyForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Collect every file path tied to this property BEFORE the DB cascade
    // removes the rows. Hard rule #10: cascade deletes must clean up disk.
    const propertyVideos = await db
      .select({ storagePath: videos.storagePath, posterPath: videos.posterPath })
      .from(videos)
      .where(eq(videos.propertyId, id));
    const photoRows = await db
      .select({ storagePath: hotspotPhotos.storagePath })
      .from(hotspotPhotos)
      .innerJoin(hotspots, eq(hotspotPhotos.hotspotId, hotspots.id))
      .innerJoin(videos, eq(hotspots.videoId, videos.id))
      .where(eq(videos.propertyId, id));

    await db.delete(properties).where(eq(properties.id, id));

    const filePaths: string[] = [];
    for (const v of propertyVideos) {
      filePaths.push(v.storagePath);
      if (v.posterPath) filePaths.push(v.posterPath);
    }
    for (const p of photoRows) filePaths.push(p.storagePath);
    await Promise.all(filePaths.map((p) => storage.delete(p)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
