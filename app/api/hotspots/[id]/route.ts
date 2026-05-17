import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspots, hotspotPhotos } from '@/lib/db/schema';
import { getHotspotForUser } from '@/lib/db/queries';
import { updateHotspotSchema } from '@/lib/validators';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getHotspotForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = updateHotspotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (
      parsed.data.timestampSeconds !== undefined &&
      parsed.data.timestampSeconds > existing.video.durationSeconds
    ) {
      return NextResponse.json(
        { error: 'Timestamp exceeds video duration' },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ hotspot: existing.hotspot });
    }

    const [row] = await db
      .update(hotspots)
      .set(parsed.data)
      .where(eq(hotspots.id, id))
      .returning();
    return NextResponse.json({ hotspot: row });
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
    const existing = await getHotspotForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Collect photo paths BEFORE the cascade deletes the rows. Hard rule #10.
    const photos = await db
      .select({ storagePath: hotspotPhotos.storagePath })
      .from(hotspotPhotos)
      .where(eq(hotspotPhotos.hotspotId, id));

    await db.delete(hotspots).where(eq(hotspots.id, id));

    await Promise.all(photos.map((p) => storage.delete(p.storagePath)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
