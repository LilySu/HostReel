import 'server-only';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { db } from './client';
import { properties, sections, videos, hotspots, hotspotPhotos } from './schema';

/**
 * Returns a property if it belongs to the given Clerk user, else null.
 * ALL host routes that touch a property must funnel through this (or a
 * helper that uses it). Do not query `properties` by id alone in routes.
 */
export async function getPropertyForUser(propertyId: string, clerkUserId: string) {
  const rows = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.clerkUserId, clerkUserId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns a section + its property if the property belongs to the given user.
 * Used by section routes to authorize in one query.
 */
export async function getSectionForUser(sectionId: string, clerkUserId: string) {
  const rows = await db
    .select({ section: sections, property: properties })
    .from(sections)
    .innerJoin(properties, eq(sections.propertyId, properties.id))
    .where(
      and(eq(sections.id, sectionId), eq(properties.clerkUserId, clerkUserId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Lists all sections for a property, ordered by orderIndex. Caller must verify
 * property ownership first via getPropertyForUser.
 */
export async function listSectionsForProperty(propertyId: string) {
  return db
    .select()
    .from(sections)
    .where(eq(sections.propertyId, propertyId))
    .orderBy(asc(sections.orderIndex), asc(sections.createdAt));
}

/**
 * Lists all videos for a property, ordered by orderIndex. Caller must verify
 * property ownership first.
 */
export async function listVideosForProperty(propertyId: string) {
  return db
    .select()
    .from(videos)
    .where(eq(videos.propertyId, propertyId))
    .orderBy(asc(videos.orderIndex), asc(videos.createdAt));
}

/**
 * Returns a video + its property if the property belongs to the given user.
 * Used by video and hotspot routes to authorize in one query.
 */
export async function getVideoForUser(videoId: string, clerkUserId: string) {
  const rows = await db
    .select({ video: videos, property: properties })
    .from(videos)
    .innerJoin(properties, eq(videos.propertyId, properties.id))
    .where(
      and(eq(videos.id, videoId), eq(properties.clerkUserId, clerkUserId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Returns a hotspot + its video + property if the property belongs to the user.
 */
export async function getHotspotForUser(hotspotId: string, clerkUserId: string) {
  const rows = await db
    .select({
      hotspot: hotspots,
      video: videos,
      property: properties,
    })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .innerJoin(properties, eq(videos.propertyId, properties.id))
    .where(
      and(eq(hotspots.id, hotspotId), eq(properties.clerkUserId, clerkUserId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Lists hotspots for a video ordered by timestamp. Caller must verify video
 * ownership first.
 */
export async function listHotspotsForVideo(videoId: string) {
  return db
    .select()
    .from(hotspots)
    .where(eq(hotspots.videoId, videoId))
    .orderBy(asc(hotspots.timestampSeconds), asc(hotspots.orderIndex));
}

/**
 * Lists photos for many hotspots at once, keyed by hotspotId.
 */
export async function listPhotosForHotspots(hotspotIds: string[]) {
  if (hotspotIds.length === 0) return [];
  return db
    .select()
    .from(hotspotPhotos)
    .where(inArray(hotspotPhotos.hotspotId, hotspotIds))
    .orderBy(asc(hotspotPhotos.orderIndex));
}

/**
 * Returns a published property by share slug, for guest views. No auth.
 * Returns null if the property is unpublished — guests get 404.
 */
export async function getPublishedPropertyBySlug(slug: string) {
  const rows = await db
    .select()
    .from(properties)
    .where(and(eq(properties.shareSlug, slug), eq(properties.published, true)))
    .limit(1);
  return rows[0] ?? null;
}
