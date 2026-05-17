import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { stays, stayEvents, properties } from '@/lib/db/schema';
import { newId } from '@/lib/slug';
import { ConsentForm } from './ConsentForm';
import { CONSENT_TEXT } from '@/lib/stays/copy';

export const dynamic = 'force-dynamic';

export default async function StayEntryPage({
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

  if (new Date(stay.expiresAt) < new Date()) {
    return (
      <ExpiredOrDone
        title="This link has expired"
        body="Ask your host to send a fresh invitation."
      />
    );
  }

  if (stay.status === 'completed') {
    redirect(`/stay/${token}/done`);
  }

  // Audit log: every page load records a link_opened event (best-effort).
  // We avoid double-counting bots by gating on status changes elsewhere.
  const h = await headers();
  await db.insert(stayEvents).values({
    id: newId(),
    stayId: stay.id,
    type: 'link_opened',
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent') ?? null,
  });

  if (stay.status === 'pending') {
    await db
      .update(stays)
      .set({ status: 'viewed', updatedAt: new Date() })
      .where(eq(stays.id, stay.id));
  }

  // Already consented (host paused mid-flow) → go straight to walkthrough.
  if (stay.consentedAt) {
    redirect(`/stay/${token}/walkthrough`);
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="container max-w-2xl py-16">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="overline">Welcome, {stay.guestName.split(' ')[0]}</div>
            <h1 className="font-serif text-4xl font-medium tracking-tight">
              Your walkthrough for {property.name}
            </h1>
            <p className="text-sm leading-relaxed text-charcoal-light">
              Before you watch, please take a moment to read this and confirm.
            </p>
          </div>
          <ConsentForm token={token} consentText={CONSENT_TEXT} />
        </div>
      </div>
    </div>
  );
}

function ExpiredOrDone({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-cream">
      <div className="container max-w-md py-20 text-center">
        <div className="surface-card space-y-3 p-8">
          <h1 className="font-serif text-2xl font-medium tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-charcoal-light">{body}</p>
        </div>
      </div>
    </div>
  );
}
