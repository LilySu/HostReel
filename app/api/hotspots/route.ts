import { NextRequest, NextResponse } from 'next/server';
import { eq, max } from 'drizzle-orm';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspots } from '@/lib/db/schema';
import { getVideoForUser } from '@/lib/db/queries';
import { createHotspotSchema } from '@/lib/validators';
import { newId } from '@/lib/slug';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireUser();
    const body = await req.json();
    const parsed = createHotspotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const owned = await getVideoForUser(parsed.data.videoId, userId);
    if (!owned) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (parsed.data.timestampSeconds > owned.video.durationSeconds) {
      return NextResponse.json(
        { error: 'Timestamp exceeds video duration' },
        { status: 400 },
      );
    }

    const [{ maxOrder }] = await db
      .select({ maxOrder: max(hotspots.orderIndex) })
      .from(hotspots)
      .where(eq(hotspots.videoId, parsed.data.videoId));
    const orderIndex = (maxOrder ?? -1) + 1;

    const [row] = await db
      .insert(hotspots)
      .values({
        id: newId(),
        videoId: parsed.data.videoId,
        timestampSeconds: parsed.data.timestampSeconds,
        title: parsed.data.title,
        icon: parsed.data.icon,
        instructionsMd: parsed.data.instructionsMd,
        orderIndex,
        requiredAcknowledgment: parsed.data.requiredAcknowledgment ?? false,
      })
      .returning();
    return NextResponse.json({ hotspot: row }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
