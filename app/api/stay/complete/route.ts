import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db/client';
import {
  hotspots,
  properties,
  stayEvents,
  stays,
  videos,
} from '@/lib/db/schema';
import { getStaySession } from '@/lib/stays/session';
import { computeAuditHash, hashHotspotContent } from '@/lib/stays/hash';
import { generateReceiptPdf, type PdfAcknowledgment } from '@/lib/stays/pdf';
import { sendStayCompletion } from '@/lib/stays/email';
import { completeStaySchema } from '@/lib/validators';
import { newId } from '@/lib/slug';
import { clientIp, userAgent } from '@/lib/stays/request';
import { storage } from '@/lib/storage';
import { CONSENT_TEXT } from '@/lib/stays/copy';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const stay = await getStaySession();
  if (!stay) {
    return NextResponse.json({ error: 'No active stay' }, { status: 401 });
  }
  if (stay.status === 'completed') {
    return NextResponse.json({ error: 'Already completed' }, { status: 409 });
  }

  const parsed = completeStaySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'A name is required (≥ 2 characters)' },
      { status: 400 },
    );
  }

  // Resolve property + host email + all required hotspots in one go.
  const property = await db
    .select()
    .from(properties)
    .where(eq(properties.id, stay.propertyId))
    .limit(1);
  if (property.length === 0) {
    return NextResponse.json({ error: 'Property gone' }, { status: 410 });
  }
  const prop = property[0];

  const requiredHotspots = await db
    .select({
      id: hotspots.id,
      title: hotspots.title,
      instructionsMd: hotspots.instructionsMd,
    })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .where(
      and(
        eq(videos.propertyId, prop.id),
        eq(hotspots.requiredAcknowledgment, true),
      ),
    );

  const ackEvents = requiredHotspots.length
    ? await db
        .select()
        .from(stayEvents)
        .where(
          and(
            eq(stayEvents.stayId, stay.id),
            eq(stayEvents.type, 'hotspot_acknowledged'),
            inArray(
              stayEvents.hotspotId,
              requiredHotspots.map((h) => h.id),
            ),
          ),
        )
        .orderBy(asc(stayEvents.occurredAt))
    : [];

  const ackByHotspotId = new Map<string, (typeof ackEvents)[number]>();
  for (const e of ackEvents) {
    if (!e.hotspotId) continue;
    if (!ackByHotspotId.has(e.hotspotId)) ackByHotspotId.set(e.hotspotId, e);
  }
  const missing = requiredHotspots.filter((h) => !ackByHotspotId.has(h.id));
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Acknowledge all required items first (${missing.length} remaining).`,
      },
      { status: 400 },
    );
  }

  const ip = clientIp(req);
  const ua = userAgent(req);
  const now = new Date();

  // Append signature_typed + completed events, then compute audit hash over
  // the full event chain.
  const sigId = newId();
  const completedId = newId();
  await db.insert(stayEvents).values([
    {
      id: sigId,
      stayId: stay.id,
      type: 'signature_typed',
      ip,
      userAgent: ua,
      occurredAt: now,
    },
    {
      id: completedId,
      stayId: stay.id,
      type: 'completed',
      ip,
      userAgent: ua,
      occurredAt: now,
    },
  ]);

  const allEvents = await db
    .select()
    .from(stayEvents)
    .where(eq(stayEvents.stayId, stay.id))
    .orderBy(asc(stayEvents.occurredAt));
  const auditHash = computeAuditHash(
    allEvents.map((e) => ({
      type: e.type,
      occurredAt: e.occurredAt,
      hotspotContentHash: e.hotspotContentHash,
    })),
  );

  // Build PDF input. For each required hotspot, look up the current text and
  // compare its hash against the recorded one — flag drift if different.
  const hostFirstName = await (async () => {
    try {
      const c = await clerkClient();
      const user = await c.users.getUser(prop.clerkUserId);
      return user.firstName ?? null;
    } catch {
      return null;
    }
  })();

  const acknowledgments: PdfAcknowledgment[] = requiredHotspots.map((h) => {
    const e = ackByHotspotId.get(h.id);
    const currentHash = hashHotspotContent(h.title, h.instructionsMd);
    const recordedHash = e?.hotspotContentHash ?? '';
    // Prefer the snapshot stored at acknowledgment time. Older stays from
    // before the snapshot columns existed will fall back to current text —
    // hash drift in the PDF makes it clear when that happens.
    const titleAtAck = e?.hotspotTitleAtAck ?? h.title;
    const instructionsAtAck = e?.hotspotInstructionsAtAck ?? h.instructionsMd;
    return {
      title: titleAtAck,
      instructionsAtAckTime: instructionsAtAck,
      contentHash: recordedHash,
      contentDriftedSinceAck: !!recordedHash && recordedHash !== currentHash,
      acknowledgedAt: e?.occurredAt ?? now,
      ip: e?.ip ?? null,
    };
  });

  const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const verificationUrl = `${baseUrl}/verify/${stay.id}`;

  const pdfBuffer = await generateReceiptPdf({
    propertyName: prop.name,
    hostName: hostFirstName,
    guestName: stay.guestName,
    guestEmail: stay.guestEmail,
    consentText: CONSENT_TEXT,
    consentedAt: stay.consentedAt ?? now,
    consentedIp: stay.consentedIp,
    acknowledgments,
    typedSignature: parsed.data.typedSignature,
    signedAt: now,
    signatureIp: ip,
    stayId: stay.id,
    auditHash,
    verificationUrl,
  });

  const pdfKey = `stays/${stay.id}/receipt.pdf`;
  await storage.save(pdfBuffer, pdfKey, 'application/pdf');

  await db
    .update(stays)
    .set({
      status: 'completed',
      completedAt: now,
      typedSignature: parsed.data.typedSignature,
      signatureIp: ip,
      receiptPdfPath: pdfKey,
      auditHash,
      updatedAt: now,
    })
    .where(eq(stays.id, stay.id));

  // Resolve host email for the completion notification CC.
  const hostEmail = await (async () => {
    try {
      const c = await clerkClient();
      const user = await c.users.getUser(prop.clerkUserId);
      return user.emailAddresses[0]?.emailAddress ?? null;
    } catch {
      return null;
    }
  })();

  const receiptLink = `${baseUrl}/${storage.publicUrl(pdfKey).replace(/^\//, '')}`;
  // storage.publicUrl already starts with '/' for LocalStorageProvider and
  // is a full URL for R2 — normalize so both cases produce an absolute URL.
  const normalizedReceipt = storage.publicUrl(pdfKey).startsWith('http')
    ? storage.publicUrl(pdfKey)
    : `${baseUrl}${storage.publicUrl(pdfKey)}`;

  await sendStayCompletion({
    toEmail: stay.guestEmail,
    ccHostEmail: hostEmail,
    guestName: stay.guestName,
    propertyName: prop.name,
    receiptLink: normalizedReceipt,
  });

  void receiptLink; // suppress unused — kept for log debugging

  return NextResponse.json({
    ok: true,
    receiptUrl: normalizedReceipt,
    auditHash,
  });
}
