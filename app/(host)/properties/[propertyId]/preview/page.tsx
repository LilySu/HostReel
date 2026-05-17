import { notFound } from 'next/navigation';
import Link from 'next/link';
import { asc, eq, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db/client';
import {
  hotspotPhotos,
  hotspots,
  sections,
  videos,
} from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { storage } from '@/lib/storage';
import { GuestView, type GuestData } from '@/app/v/[slug]/GuestView';

export const dynamic = 'force-dynamic';

// Host-only preview. Renders the same component the guest will see, but the
// route requires Clerk auth and property ownership — no token needed, no
// audit log written. Lets hosts QA before publishing.
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId } = await params;
  const property = await getPropertyForUser(propertyId, userId);
  if (!property) notFound();

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

  let hostFirstName: string | null = null;
  try {
    const c = await clerkClient();
    const user = await c.users.getUser(userId);
    hostFirstName = user.firstName ?? null;
  } catch {
    hostFirstName = null;
  }

  const data: GuestData = {
    property: {
      name: property.name,
      updatedAt: property.updatedAt.toISOString(),
      hostFirstName,
    },
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
      photos: photoRows
        .filter((p) => p.hotspotId === h.id)
        .map((p) => ({ id: p.id, url: storage.publicUrl(p.storagePath) })),
    })),
  };

  return (
    <div className="relative">
      <div className="container py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-xs">
          <span className="font-medium text-charcoal">
            Preview mode — this is what a guest sees. Nothing is recorded.
          </span>
          <Link
            href={`/properties/${property.id}`}
            className="font-medium text-gold-dark underline-offset-2 hover:underline"
          >
            ← Back to property
          </Link>
        </div>
      </div>
      <GuestView data={data} />
    </div>
  );
}
