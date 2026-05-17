import { notFound, redirect } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  hotspotPhotos,
  hotspots,
  properties,
  sections,
  stayEvents,
  stays,
  videos,
} from '@/lib/db/schema';
import { storage } from '@/lib/storage';
import { WalkthroughClient, type StayWalkthroughData } from './WalkthroughClient';

export const dynamic = 'force-dynamic';

export default async function StayWalkthroughPage({
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

  const [sectionRows, videoRows] = await Promise.all([
    db
      .select()
      .from(sections)
      .where(eq(sections.propertyId, property.id))
      .orderBy(asc(sections.orderIndex), asc(sections.createdAt)),
    db
      .select()
      .from(videos)
      .where(eq(videos.propertyId, property.id))
      .orderBy(asc(videos.orderIndex), asc(videos.createdAt)),
  ]);
  const readyVideos = videoRows.filter((v) => v.status === 'ready');
  const videoIds = readyVideos.map((v) => v.id);
  const hotspotRows = videoIds.length
    ? await db
        .select()
        .from(hotspots)
        .where(inArray(hotspots.videoId, videoIds))
        .orderBy(asc(hotspots.timestampSeconds), asc(hotspots.orderIndex))
    : [];
  const photoRows = hotspotRows.length
    ? await db
        .select()
        .from(hotspotPhotos)
        .where(
          inArray(
            hotspotPhotos.hotspotId,
            hotspotRows.map((h) => h.id),
          ),
        )
        .orderBy(asc(hotspotPhotos.orderIndex))
    : [];

  const ackRows = await db
    .select({ hotspotId: stayEvents.hotspotId })
    .from(stayEvents)
    .where(eq(stayEvents.stayId, stay.id));
  const acknowledgedIds = new Set(
    ackRows
      .filter((r) => r.hotspotId)
      .map((r) => r.hotspotId as string),
  );

  const data: StayWalkthroughData = {
    stayId: stay.id,
    token,
    guestName: stay.guestName,
    propertyName: property.name,
    sections: sectionRows.map((s) => ({ id: s.id, title: s.title })),
    videos: readyVideos.map((v) => ({
      id: v.id,
      sectionId: v.sectionId,
      title: v.title,
      description: v.description,
      durationSeconds: v.durationSeconds,
      widthPx: v.widthPx,
      heightPx: v.heightPx,
      sourceUrl: storage.publicUrl(v.storagePath),
      posterUrl: v.posterPath ? storage.publicUrl(v.posterPath) : null,
    })),
    hotspots: hotspotRows.map((h) => ({
      id: h.id,
      videoId: h.videoId,
      timestampSeconds: h.timestampSeconds,
      title: h.title,
      icon: h.icon,
      instructionsMd: h.instructionsMd,
      requiredAcknowledgment: h.requiredAcknowledgment,
      photos: photoRows
        .filter((p) => p.hotspotId === h.id)
        .map((p) => ({ id: p.id, url: storage.publicUrl(p.storagePath) })),
    })),
    initiallyAcknowledged: Array.from(acknowledgedIds),
  };

  return <WalkthroughClient data={data} />;
}
