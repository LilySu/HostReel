import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { stayEvents, stays } from '@/lib/db/schema';
import { newId } from '@/lib/slug';
import { startStaySession } from '@/lib/stays/session';
import { clientIp, userAgent } from '@/lib/stays/request';

export const runtime = 'nodejs';

const bodySchema = z.object({ token: z.string().min(1) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const rows = await db
    .select()
    .from(stays)
    .where(eq(stays.magicToken, parsed.data.token))
    .limit(1);
  const stay = rows[0];
  if (!stay) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (new Date(stay.expiresAt) < new Date()) {
    return NextResponse.json({ error: 'Expired' }, { status: 410 });
  }
  if (stay.status === 'completed') {
    return NextResponse.json({ error: 'Already completed' }, { status: 409 });
  }

  const ip = clientIp(req);
  const ua = userAgent(req);
  const now = new Date();

  if (!stay.consentedAt) {
    await db
      .update(stays)
      .set({
        consentedAt: now,
        consentedIp: ip,
        consentedUserAgent: ua,
        status: stay.status === 'pending' ? 'viewed' : stay.status,
        updatedAt: now,
      })
      .where(eq(stays.id, stay.id));
    await db.insert(stayEvents).values({
      id: newId(),
      stayId: stay.id,
      type: 'consent_given',
      ip,
      userAgent: ua,
    });
  }

  await startStaySession(stay.id, new Date(stay.expiresAt));
  return NextResponse.json({ ok: true });
}
