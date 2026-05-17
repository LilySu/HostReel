import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  hotspots,
  properties,
  stayEvents,
  stays,
  videos,
} from '@/lib/db/schema';
import { CompleteForm } from './CompleteForm';

export const dynamic = 'force-dynamic';

export default async function StayCompletePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const stayRows = await db
    .select({ stay: stays, property: properties })
    .from(stays)
    .innerJoin(properties, eq(stays.propertyId, properties.id))
    .where(eq(stays.magicToken, token))
    .limit(1);
  if (stayRows.length === 0) notFound();
  const { stay, property } = stayRows[0];

  if (new Date(stay.expiresAt) < new Date()) {
    redirect(`/stay/${token}`);
  }
  if (stay.status === 'completed') {
    redirect(`/stay/${token}/done`);
  }
  if (!stay.consentedAt) {
    redirect(`/stay/${token}`);
  }

  const requiredHotspots = await db
    .select({ id: hotspots.id, title: hotspots.title, icon: hotspots.icon })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .where(
      and(
        eq(videos.propertyId, property.id),
        eq(hotspots.requiredAcknowledgment, true),
      ),
    )
    .orderBy(asc(hotspots.orderIndex));

  const acks = requiredHotspots.length
    ? await db
        .select({
          hotspotId: stayEvents.hotspotId,
          occurredAt: stayEvents.occurredAt,
        })
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
    : [];
  const ackMap = new Map<string, Date>();
  for (const a of acks) {
    if (!a.hotspotId) continue;
    const prev = ackMap.get(a.hotspotId);
    if (!prev || a.occurredAt < prev) ackMap.set(a.hotspotId, a.occurredAt);
  }

  const missing = requiredHotspots.filter((h) => !ackMap.has(h.id));
  if (missing.length > 0) {
    redirect(`/stay/${token}/walkthrough`);
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      <div className="container max-w-2xl py-10">
        <div className="space-y-2">
          <div className="overline">Final step</div>
          <h1 className="font-serif text-4xl font-medium tracking-tight">
            Confirm your check-in
          </h1>
          <p className="text-sm leading-relaxed text-charcoal-light">
            Here&rsquo;s a summary of what you acknowledged. Type your name
            below to record it.
          </p>
        </div>

        <div className="surface-card mt-8 divide-y divide-sand-light overflow-hidden">
          {requiredHotspots.map((h) => {
            const ackAt = ackMap.get(h.id);
            return (
              <div
                key={h.id}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700">
                    ✓
                  </span>
                  <span className="text-sm font-medium">{h.title}</span>
                </div>
                <span className="font-mono text-xs text-charcoal-light">
                  {ackAt
                    ? new Date(ackAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            );
          })}
        </div>

        <CompleteForm token={token} guestName={stay.guestName} />
      </div>
    </div>
  );
}
