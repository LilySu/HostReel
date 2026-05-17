import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, max } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspotPhotos, hotspots, videos } from '@/lib/db/schema';
import { getSectionForUser, getVideoForUser } from '@/lib/db/queries';
import { updateVideoSchema } from '@/lib/validators';
import { storage } from '@/lib/storage';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const existing = await getVideoForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    const parsed = updateVideoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description;
    }

    // Section change: validate ownership + same property. If caller didn't
    // also send an explicit orderIndex, place at end of the destination bucket
    // so the moved video doesn't collide with an existing one.
    const movingSection = parsed.data.sectionId !== undefined;
    if (movingSection) {
      const newSectionId = parsed.data.sectionId ?? null;
      if (newSectionId !== null) {
        const section = await getSectionForUser(newSectionId, userId);
        if (!section || section.property.id !== existing.property.id) {
          return NextResponse.json(
            { error: 'Invalid section' },
            { status: 400 },
          );
        }
      }
      updates.sectionId = newSectionId;
      if (parsed.data.orderIndex === undefined) {
        const [{ maxOrder }] = await db
          .select({ maxOrder: max(videos.orderIndex) })
          .from(videos)
          .where(
            and(
              eq(videos.propertyId, existing.property.id),
              newSectionId
                ? eq(videos.sectionId, newSectionId)
                : isNull(videos.sectionId),
            ),
          );
        updates.orderIndex = (maxOrder ?? -1) + 1;
      }
    }
    if (parsed.data.orderIndex !== undefined) {
      updates.orderIndex = parsed.data.orderIndex;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ video: existing.video });
    }

    const [row] = await db
      .update(videos)
      .set(updates)
      .where(eq(videos.id, id))
      .returning();
    return NextResponse.json({ video: row });
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
    const existing = await getVideoForUser(id, userId);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Collect file paths BEFORE the cascade removes rows. Hard rule #10.
    const photoRows = await db
      .select({ storagePath: hotspotPhotos.storagePath })
      .from(hotspotPhotos)
      .innerJoin(hotspots, eq(hotspotPhotos.hotspotId, hotspots.id))
      .where(eq(hotspots.videoId, id));

    await db.delete(videos).where(eq(videos.id, id));

    const filePaths: string[] = [];
    if (existing.video.storagePath) filePaths.push(existing.video.storagePath);
    if (existing.video.posterPath) filePaths.push(existing.video.posterPath);
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
