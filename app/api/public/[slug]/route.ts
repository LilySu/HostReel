import { NextRequest, NextResponse } from 'next/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  hotspotPhotos,
  hotspots,
  sections,
  videos,
} from '@/lib/db/schema';
import { getPublishedPropertyBySlug } from '@/lib/db/queries';
import { storage } from '@/lib/storage';

export const runtime = 'nodejs';
// Short browser cache so a refresh works on flaky connections (per UX brief)
// without serving truly stale data after a host edits.
export const revalidate = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const property = await getPublishedPropertyBySlug(slug);
  if (!property) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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

  return NextResponse.json({
    property: {
      id: property.id,
      name: property.name,
      shareSlug: property.shareSlug,
      updatedAt: property.updatedAt.toISOString(),
    },
    sections: sectionRows.map((s) => ({
      id: s.id,
      title: s.title,
      orderIndex: s.orderIndex,
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
      orderIndex: v.orderIndex,
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
  });
}
