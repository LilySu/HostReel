import { notFound } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  hotspots,
  properties,
  stayEvents,
  stays,
  videos,
} from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ stayId: string }>;
}) {
  const { stayId } = await params;
  const rows = await db
    .select({ stay: stays, property: properties })
    .from(stays)
    .innerJoin(properties, eq(stays.propertyId, properties.id))
    .where(eq(stays.id, stayId))
    .limit(1);
  if (rows.length === 0) notFound();
  const { stay, property } = rows[0];

  // Required hotspots at the time of completion. We don't snapshot this, so
  // we just take the current set — drift is reported per-item below via the
  // PDF, not on this public page.
  const requiredHotspotRows = await db
    .select({ id: hotspots.id, title: hotspots.title })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .where(
      and(
        eq(videos.propertyId, property.id),
        eq(hotspots.requiredAcknowledgment, true),
      ),
    );
  const ackRows = requiredHotspotRows.length
    ? await db
        .select({ hotspotId: stayEvents.hotspotId })
        .from(stayEvents)
        .where(
          and(
            eq(stayEvents.stayId, stay.id),
            eq(stayEvents.type, 'hotspot_acknowledged'),
            inArray(
              stayEvents.hotspotId,
              requiredHotspotRows.map((h) => h.id),
            ),
          ),
        )
        .orderBy(asc(stayEvents.occurredAt))
    : [];
  const acknowledged = new Set(
    ackRows.map((r) => r.hotspotId).filter((id): id is string => !!id),
  );

  const guestFirstName = stay.guestName.split(' ')[0] ?? stay.guestName;

  return (
    <div className="min-h-screen bg-cream">
      <div className="container max-w-xl py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="overline">Acknowledgment record</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              {property.name}
            </h1>
            <p className="text-sm text-charcoal-light">
              Guest {guestFirstName}{' '}
              {stay.status === 'completed' && stay.completedAt ? (
                <>
                  · completed{' '}
                  {new Date(stay.completedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </>
              ) : (
                `· status: ${stay.status}`
              )}
            </p>
          </div>

          <div className="surface-card space-y-3 p-5">
            <div className="overline">Status</div>
            {stay.status === 'completed' ? (
              <p className="text-sm text-charcoal">
                ✓ This stay has been completed. The PDF receipt issued to the
                parties is the authoritative document; this page only confirms
                that the record exists in our system.
              </p>
            ) : (
              <p className="text-sm text-charcoal-light">
                This stay is in progress.
              </p>
            )}
          </div>

          {requiredHotspotRows.length > 0 && (
            <div className="surface-card overflow-hidden">
              <div className="border-b border-sand-light px-5 py-3">
                <div className="overline">Required items</div>
              </div>
              <ul className="divide-y divide-sand-light">
                {requiredHotspotRows.map((h) => {
                  const done = acknowledged.has(h.id);
                  return (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                    >
                      <span>{h.title}</span>
                      {done ? (
                        <span className="text-xs font-medium text-green-700">
                          Acknowledged ✓
                        </span>
                      ) : (
                        <span className="text-xs text-charcoal-light">
                          Not acknowledged
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {stay.auditHash && (
            <div className="space-y-1.5">
              <div className="overline">Audit hash</div>
              <code className="block break-all rounded-md border border-sand-light bg-white p-3 font-mono text-[10px] text-charcoal-light">
                {stay.auditHash}
              </code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
