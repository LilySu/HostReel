import Link from 'next/link';
import Image from 'next/image';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { properties, videos } from '@/lib/db/schema';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// Curated collage shown in the page hero — independent of the user's data so
// the page never feels empty. Picked from the Image Registry in CLAUDE.md.
const COLLAGE = {
  large: {
    src: '/images/kelcie-papp-YVGtHXF6qZg-unsplash.jpg',
    alt: 'Window view from a guest room',
  },
  topSmall: {
    src: '/images/adrian-schwarz--QQwV-lU2_4-unsplash.jpg',
    alt: 'Covered porch with a single chair',
  },
  bottomSmall: {
    src: '/images/jon-tyson-XS_o-Iuf9Go-unsplash.jpg',
    alt: '"Be our guest" doormat at a front door',
  },
};

export default async function PropertiesPage() {
  const userId = await requireUser();
  const rows = await db
    .select()
    .from(properties)
    .where(eq(properties.clerkUserId, userId))
    .orderBy(desc(properties.createdAt));

  const propertyIds = rows.map((r) => r.id);
  const posterByProperty = new Map<string, string>();
  const videoCountByProperty = new Map<string, number>();
  if (propertyIds.length > 0) {
    // First ready poster per property — drives the row thumbnail.
    const vids = await db
      .select({
        propertyId: videos.propertyId,
        posterPath: videos.posterPath,
      })
      .from(videos)
      .where(
        and(
          inArray(videos.propertyId, propertyIds),
          eq(videos.status, 'ready'),
          isNotNull(videos.posterPath),
        ),
      )
      .orderBy(asc(videos.orderIndex), asc(videos.createdAt));
    for (const v of vids) {
      if (v.posterPath && !posterByProperty.has(v.propertyId)) {
        posterByProperty.set(v.propertyId, storage.publicUrl(v.posterPath));
      }
    }
    // Total video count (any status) per property — drives the "1 video" badge.
    const counts = await db
      .select({
        propertyId: videos.propertyId,
        n: sql<number>`count(*)::int`,
      })
      .from(videos)
      .where(inArray(videos.propertyId, propertyIds))
      .groupBy(videos.propertyId);
    for (const c of counts) videoCountByProperty.set(c.propertyId, c.n);
  }

  return (
    <div className="space-y-10">
      <section className="grid items-stretch gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col justify-between gap-8">
          <div>
            <div className="overline">Your portfolio</div>
            <h1 className="mt-2 font-serif text-4xl font-medium tracking-tight sm:text-5xl">
              Properties
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-charcoal-light">
              One link per place. Sections inside — Welcome, Appliances, Trash
              day — keep the walkthrough easy to scan when a guest is at the
              door.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/properties/new" className="btn-primary">
              New property
            </Link>
            <span className="text-xs uppercase tracking-[0.18em] text-charcoal-light">
              {rows.length === 0
                ? 'Nothing here yet'
                : `${rows.length} ${rows.length === 1 ? 'listing' : 'listings'}`}
            </span>
          </div>
        </div>
        <div className="grid h-72 grid-cols-3 gap-3 sm:h-80 lg:h-[22rem]">
          <div className="relative col-span-2 overflow-hidden rounded-lg border border-sand-light">
            <Image
              src={COLLAGE.large.src}
              alt={COLLAGE.large.alt}
              fill
              sizes="(min-width: 1024px) 32vw, (min-width: 640px) 50vw, 66vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative flex-1 overflow-hidden rounded-lg border border-sand-light">
              <Image
                src={COLLAGE.topSmall.src}
                alt={COLLAGE.topSmall.alt}
                fill
                sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                className="object-cover"
              />
            </div>
            <div className="relative flex-1 overflow-hidden rounded-lg border border-sand-light">
              <Image
                src={COLLAGE.bottomSmall.src}
                alt={COLLAGE.bottomSmall.alt}
                fill
                sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 33vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <div className="surface-card grid overflow-hidden md:grid-cols-2">
          <div className="relative h-64 md:h-auto">
            <Image
              src="/images/zoshua-colah-q1lknm19EtU-unsplash.jpg"
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center gap-4 p-10 sm:p-12">
            <div className="overline">Nothing here yet</div>
            <h2 className="font-serif text-3xl font-medium tracking-tight">
              Add your first property.
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-charcoal-light">
              Give it a name. Organize a walkthrough into sections — Welcome,
              Appliances, Trash day. Share one link.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/properties/new" className="btn-primary">
                Create property
              </Link>
              <Link
                href="/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                See a sample tour
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <ul className="surface-card divide-y divide-sand-light overflow-hidden">
          {rows.map((p) => {
            // Prefer the host-uploaded cover; fall back to the first video's
            // poster; if neither, show the "No video" placeholder.
            const coverUrl = p.coverImagePath
              ? storage.publicUrl(p.coverImagePath)
              : null;
            const posterUrl = coverUrl ?? posterByProperty.get(p.id) ?? null;
            const videoCount = videoCountByProperty.get(p.id) ?? 0;
            const videoLabel =
              videoCount === 0
                ? 'No videos yet'
                : `${videoCount} ${videoCount === 1 ? 'video' : 'videos'}`;
            return (
              <li key={p.id}>
                <Link
                  href={`/properties/${p.id}`}
                  className="flex items-center gap-5 px-5 py-4 transition-colors duration-200 hover:bg-cream-dark/40"
                >
                  <div className="relative h-20 w-32 flex-none overflow-hidden rounded-md border border-sand-light bg-sand-light">
                    {posterUrl ? (
                      // User-uploaded poster — bypass next/image optimizer to
                      // keep the StorageProvider contract intact.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={posterUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-charcoal-light">
                        No video
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-serif text-xl font-medium tracking-tight">
                      {p.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-charcoal-light">
                      {p.published ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                          Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-sand" />
                          Draft
                        </span>
                      )}
                      <span aria-hidden className="text-sand">·</span>
                      <span>{videoLabel}</span>
                    </div>
                  </div>
                  <span className="font-serif text-gold" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
