import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties, stayEvents, stays } from '@/lib/db/schema';

export const runtime = 'nodejs';

const patchSchema = z.object({
  action: z.enum(['expire']),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const rows = await db
      .select({ stay: stays })
      .from(stays)
      .innerJoin(properties, eq(stays.propertyId, properties.id))
      .where(and(eq(stays.id, id), eq(properties.clerkUserId, userId)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const events = await db
      .select()
      .from(stayEvents)
      .where(eq(stayEvents.stayId, id))
      .orderBy(asc(stayEvents.occurredAt));
    return NextResponse.json({
      stay: { ...rows[0].stay, magicToken: undefined },
      // Magic URL is exposed only to the auth'd host who created the
      // invitation — this is the same person who already got the link in
      // their outbox, so showing it here is no new information disclosure.
      magicUrl: `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/stay/${rows[0].stay.magicToken}`,
      events,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await requireUser();
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const rows = await db
      .select({ stay: stays })
      .from(stays)
      .innerJoin(properties, eq(stays.propertyId, properties.id))
      .where(and(eq(stays.id, id), eq(properties.clerkUserId, userId)))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const stay = rows[0].stay;

    if (parsed.data.action === 'expire') {
      if (stay.status === 'completed') {
        return NextResponse.json(
          { error: 'Cannot expire a completed stay' },
          { status: 400 },
        );
      }
      await db
        .update(stays)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(stays.id, id));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
