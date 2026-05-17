import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { properties, stays } from '@/lib/db/schema';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function StayDonePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rows = await db
    .select({ stay: stays, property: properties })
    .from(stays)
    .innerJoin(properties, eq(stays.propertyId, properties.id))
    .where(eq(stays.magicToken, token))
    .limit(1);
  if (rows.length === 0) notFound();
  const { stay, property } = rows[0];
  const receiptUrl = stay.receiptPdfPath
    ? storage.publicUrl(stay.receiptPdfPath)
    : null;

  return (
    <div className="min-h-screen bg-cream">
      <div className="container max-w-2xl py-20">
        <div className="surface-card space-y-5 p-8 text-center">
          <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">
            ✓
          </span>
          <div className="space-y-2">
            <div className="overline">Check-in complete</div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">
              All set, {stay.guestName.split(' ')[0]}.
            </h1>
            <p className="text-sm text-charcoal-light">
              Your acknowledgments for {property.name} are on file. A copy is
              on its way to {stay.guestEmail}.
            </p>
          </div>
          {receiptUrl && (
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Download receipt (PDF)
              </a>
            </div>
          )}
          {stay.auditHash && (
            <p className="text-[10px] font-mono text-charcoal-light/80">
              Audit hash: {stay.auditHash}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
