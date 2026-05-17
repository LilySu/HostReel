import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { hotspots, videos } from '@/lib/db/schema';
import { getPropertyForUser } from '@/lib/db/queries';
import { NewStayForm } from './NewStayForm';

export const dynamic = 'force-dynamic';

export default async function NewStayPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId } = await params;
  const property = await getPropertyForUser(propertyId, userId);
  if (!property) notFound();

  const [{ n }] = await db
    .select({ n: count() })
    .from(hotspots)
    .innerJoin(videos, eq(hotspots.videoId, videos.id))
    .where(
      and(
        eq(videos.propertyId, property.id),
        eq(hotspots.requiredAcknowledgment, true),
      ),
    );

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <Link
        href={`/properties/${property.id}/stays`}
        className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
      >
        ← Back to stays
      </Link>

      <div className="space-y-2">
        <div className="overline">Verified check-in</div>
        <h1 className="font-serif text-3xl font-medium tracking-tight">
          Invite a guest
        </h1>
        <p className="text-sm text-charcoal-light">
          They&rsquo;ll get a magic link to walk through {property.name} and
          acknowledge the items you marked required. You&rsquo;ll get a
          PDF record of everything they confirmed.
        </p>
      </div>

      {n === 0 ? (
        <div className="surface-card space-y-3 p-6">
          <div className="overline">Nothing to acknowledge</div>
          <h2 className="font-serif text-xl font-medium tracking-tight">
            Mark at least one hotspot as required first
          </h2>
          <p className="text-sm text-charcoal-light">
            Open the hotspot editor for any video on this property and toggle
            &ldquo;Required acknowledgment&rdquo; on the items the guest must
            confirm — wifi, trash day, lockup, etc.
          </p>
          <div>
            <Link href={`/properties/${property.id}`} className="btn-primary">
              Go to property
            </Link>
          </div>
        </div>
      ) : (
        <NewStayForm
          propertyId={property.id}
          requiredCount={n}
        />
      )}
    </div>
  );
}
