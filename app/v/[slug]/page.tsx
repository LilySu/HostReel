import { notFound } from 'next/navigation';
import { asc, eq, inArray } from 'drizzle-orm';
import { clerkClient } from '@clerk/nextjs/server';
import { db } from '@/lib/db/client';
import {
  hotspotPhotos,
  hotspots,
  sections,
  videos,
} from '@/lib/db/schema';
import { getPublishedPropertyBySlug } from '@/lib/db/queries';
import { storage } from '@/lib/storage';
import { GuestView, type GuestData } from './GuestView';
import type { Metadata } from 'next';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublishedPropertyBySlug(slug);
  if (!property) return { title: 'Not found' };
  return {
    title: `${property.name} — HostReel`,
    description: `Walkthrough guide for ${property.name}.`,
    openGraph: {
      title: property.name,
      description: `Walkthrough guide for ${property.name}.`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: property.name,
    },
    robots: { index: false, follow: false },
  };
}

export default async function GuestPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPublishedPropertyBySlug(slug);
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

  // Trust signals per UX brief — surface the host's first name + last edit.
  let hostFirstName: string | null = null;
  try {
    const c = await clerkClient();
    const user = await c.users.getUser(property.clerkUserId);
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
    sections: sectionRows.map((s) => ({
      id: s.id,
      title: s.title,
    })),
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

  return <GuestView data={data} />;
}
