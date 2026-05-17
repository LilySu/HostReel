import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { hotspots, stayEvents, stays, videos } from '@/lib/db/schema';
import { getStaySession } from '@/lib/stays/session';
import { hashHotspotContent } from '@/lib/stays/hash';
import { stayEventSchema } from '@/lib/validators';
import { newId } from '@/lib/slug';
import { clientIp, userAgent } from '@/lib/stays/request';

export const runtime = 'nodejs';

// Stay-session-authenticated. Hard rule 23: never call requireUser() here.
// Hard rule 21: the server computes contentHash + IP + UA; the client only
// supplies which hotspot/video the event refers to.
export async function POST(req: NextRequest) {
  const stay = await getStaySession();
  if (!stay) {
    return NextResponse.json({ error: 'No active stay' }, { status: 401 });
  }
  if (stay.status === 'completed') {
    return NextResponse.json({ error: 'Stay already completed' }, { status: 409 });
  }

  const parsed = stayEventSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  let hotspotContentHash: string | null = null;
  let hotspotTitleAtAck: string | null = null;
  let hotspotInstructionsAtAck: string | null = null;
  if (parsed.data.hotspotId) {
    // Verify the hotspot belongs to a video on this stay's property — guests
    // can't poke at hotspots on other properties via this endpoint.
    const owned = await db
      .select({ hotspot: hotspots })
      .from(hotspots)
      .innerJoin(videos, eq(hotspots.videoId, videos.id))
      .where(
        and(
          eq(hotspots.id, parsed.data.hotspotId),
          eq(videos.propertyId, stay.propertyId),
        ),
      )
      .limit(1);
    if (owned.length === 0) {
      return NextResponse.json(
        { error: 'Hotspot does not belong to this stay' },
        { status: 400 },
      );
    }
    const h = owned[0].hotspot;
    hotspotContentHash = hashHotspotContent(h.title, h.instructionsMd);
    // Only snapshot the human-readable copy on acknowledgments — other events
    // (viewed, etc.) just need the hash. Keeps the audit log lean.
    if (parsed.data.type === 'hotspot_acknowledged') {
      hotspotTitleAtAck = h.title;
      hotspotInstructionsAtAck = h.instructionsMd;
    }
  }

  const ip = clientIp(req);
  const ua = userAgent(req);

  await db.insert(stayEvents).values({
    id: newId(),
    stayId: stay.id,
    type: parsed.data.type,
    hotspotId: parsed.data.hotspotId ?? null,
    hotspotContentHash,
    hotspotTitleAtAck,
    hotspotInstructionsAtAck,
    videoId: parsed.data.videoId ?? null,
    videoTimeSeconds: parsed.data.videoTimeSeconds ?? null,
    ip,
    userAgent: ua,
  });

  // First acknowledgment flips the stay to in_progress.
  if (
    parsed.data.type === 'hotspot_acknowledged' &&
    (stay.status === 'viewed' || stay.status === 'pending')
  ) {
    await db
      .update(stays)
      .set({ status: 'in_progress', updatedAt: new Date() })
      .where(eq(stays.id, stay.id));
  }

  return NextResponse.json({ ok: true });
}
