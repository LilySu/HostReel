import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspots, stayEvents, stays, videos } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { StaysDashboard, type DashboardData } from './StaysDashboard';

export const dynamic = 'force-dynamic';

export default async function StaysPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId } = await params;
  const property = await getPropertyForUser(propertyId, userId);
  if (!property) notFound();

  // Required hotspots for this property — defines the dashboard's columns.
  // Cells reflect historical acknowledgments, not current state — but a
  // hotspot is dropped from the column set entirely if it isn't required
  // anymore AND no stay has ever acknowledged it.
  const requiredHotspotRows = await db
    .select({
      id: hotspots.id,
      title: hotspots.title,
      icon: hotspots.icon,
      requiredAcknowledgment: hotspots.requiredAcknowledgment,
    })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .where(eq(videos.propertyId, property.id))
    .orderBy(asc(hotspots.orderIndex));

  const stayRows = await db
    .select()
    .from(stays)
    .where(eq(stays.propertyId, property.id))
    .orderBy(desc(stays.createdAt));

  // For each stay, fetch its hotspot_acknowledged events. One query for all
  // visible stays.
  const stayIds = stayRows.map((s) => s.id);
  const ackEvents = stayIds.length
    ? await db
        .select({
          stayId: stayEvents.stayId,
          hotspotId: stayEvents.hotspotId,
          occurredAt: stayEvents.occurredAt,
        })
        .from(stayEvents)
        .where(
          and(
            inArray(stayEvents.stayId, stayIds),
            eq(stayEvents.type, 'hotspot_acknowledged'),
          ),
        )
    : [];

  // Build the column set: every hotspot that's currently required + every
  // hotspot that has at least one historical ack on a visible stay.
  const ackedHotspotIds = new Set(
    ackEvents.map((e) => e.hotspotId).filter((id): id is string => !!id),
  );
  const columns = requiredHotspotRows
    .filter((h) => h.requiredAcknowledgment || ackedHotspotIds.has(h.id))
    .map((h) => ({
      id: h.id,
      title: h.title,
      icon: h.icon,
      currentlyRequired: h.requiredAcknowledgment,
    }));

  // Map stay → hotspot id → earliest ack timestamp
  const acksByStay = new Map<string, Map<string, Date>>();
  for (const e of ackEvents) {
    if (!e.hotspotId) continue;
    let inner = acksByStay.get(e.stayId);
    if (!inner) {
      inner = new Map();
      acksByStay.set(e.stayId, inner);
    }
    const prev = inner.get(e.hotspotId);
    if (!prev || e.occurredAt < prev) inner.set(e.hotspotId, e.occurredAt);
  }

  const totalRequired = requiredHotspotRows.filter(
    (h) => h.requiredAcknowledgment,
  ).length;

  const data: DashboardData = {
    propertyId: property.id,
    propertyName: property.name,
    totalRequired,
    columns,
    rows: stayRows.map((s) => {
      const ackMap = acksByStay.get(s.id) ?? new Map<string, Date>();
      const ackCount = ackMap.size;
      // Compute the effective status. A stay past its expiresAt that isn't
      // completed is functionally expired even if the DB still says pending /
      // viewed / in_progress — the host can no longer act on it, so showing
      // "Sent" would be misleading. We don't write this back; the row stays
      // historically accurate and the dashboard reflects current reality.
      const effectiveStatus =
        s.status !== 'completed' && new Date(s.expiresAt) < new Date()
          ? ('expired' as const)
          : s.status;
      return {
        id: s.id,
        guestName: s.guestName,
        guestEmail: s.guestEmail,
        checkInDate: s.checkInDate,
        status: effectiveStatus,
        createdAt: s.createdAt.toISOString(),
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        expiresAt: s.expiresAt.toISOString(),
        ackByHotspot: Object.fromEntries(
          Array.from(ackMap.entries()).map(([k, v]) => [k, v.toISOString()]),
        ),
        ackCount,
      };
    }),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/properties/${property.id}`}
          className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
        >
          ← Back to property
        </Link>
        <Link
          href={`/properties/${property.id}/stays/new`}
          className="btn-primary"
        >
          Invite guest
        </Link>
      </div>

      <div className="space-y-2">
        <div className="overline">Verified check-ins</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          Stays
        </h1>
        <p className="text-sm text-charcoal-light">
          {property.name} · {totalRequired} required{' '}
          {totalRequired === 1 ? 'item' : 'items'} per check-in
        </p>
      </div>

      <StaysDashboard data={data} />
    </div>
  );
}
