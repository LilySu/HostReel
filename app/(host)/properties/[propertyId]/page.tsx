import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { stays } from '@/lib/db/schema';
import {
  getPropertyForUser,
  listSectionsForProperty,
  listVideosForProperty,
} from '@/lib/db/queries';
import { storage } from '@/lib/storage';
import { PropertyActions } from './PropertyActions';
import { SectionsTree, type VideoListItem } from './SectionsTree';
import { SuggestedSections } from './SuggestedSections';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId } = await params;
  const property = await getPropertyForUser(propertyId, userId);
  if (!property) notFound();

  const [sections, rawVideos, stayRows] = await Promise.all([
    listSectionsForProperty(property.id),
    listVideosForProperty(property.id),
    db
      .select({
        id: stays.id,
        guestName: stays.guestName,
        status: stays.status,
        createdAt: stays.createdAt,
      })
      .from(stays)
      .where(eq(stays.propertyId, property.id))
      .orderBy(desc(stays.createdAt))
      .limit(5),
  ]);
  const stayCounts = stayRows.reduce(
    (acc, s) => {
      if (s.status === 'completed') acc.done++;
      else if (s.status === 'in_progress') acc.inProgress++;
      else if (s.status === 'pending' || s.status === 'viewed') acc.pending++;
      return acc;
    },
    { done: 0, inProgress: 0, pending: 0 },
  );

  const videos: VideoListItem[] = rawVideos.map((v) => ({
    id: v.id,
    sectionId: v.sectionId,
    title: v.title,
    description: v.description,
    orderIndex: v.orderIndex,
    durationSeconds: v.durationSeconds,
    widthPx: v.widthPx,
    heightPx: v.heightPx,
    status: v.status,
    posterUrl: v.posterPath ? storage.publicUrl(v.posterPath) : null,
  }));

  return (
    <div className="space-y-10">
      <Link
        href="/properties"
        className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
      >
        ← Properties
      </Link>

      <PropertyActions
        propertyId={property.id}
        initialName={property.name}
        published={property.published}
        shareSlug={property.shareSlug}
        coverImageUrl={
          property.coverImagePath
            ? storage.publicUrl(property.coverImagePath)
            : null
        }
      />

      {stayRows.length > 0 && (
        <section className="surface-card space-y-3 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="overline">Recent stays</div>
              <h2 className="mt-1 font-serif text-xl font-medium tracking-tight">
                {stayCounts.done} done · {stayCounts.inProgress} in progress
                {stayCounts.pending > 0 ? ` · ${stayCounts.pending} pending` : ''}
              </h2>
            </div>
            <Link
              href={`/properties/${property.id}/stays`}
              className="text-xs font-medium text-gold-dark underline-offset-2 hover:underline"
            >
              View all →
            </Link>
          </div>
          <ul className="divide-y divide-sand-light text-sm">
            {stayRows.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="truncate">{s.guestName}</span>
                <span className="text-xs text-charcoal-light capitalize">
                  {s.status === 'in_progress' ? 'in progress' : s.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="overline">Table of contents</div>
            <h2 className="mt-1 font-serif text-3xl font-medium tracking-tight">
              Sections
            </h2>
          </div>
          <Link
            href={`/properties/${property.id}/stays`}
            className="btn-secondary"
          >
            Stays
          </Link>
        </div>
        {sections.length === 0 && videos.length === 0 && (
          <SuggestedSections propertyId={property.id} />
        )}
        <SectionsTree
          propertyId={property.id}
          initialSections={sections}
          initialVideos={videos}
        />
      </section>
    </div>
  );
}
