import { NextResponse } from 'next/server';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { getBilling, getStripe, isStripeConfigured } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST() {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Billing is not configured on this environment' },
        { status: 503 },
      );
    }
    const clerkUserId = await requireUser();
    const meta = await getBilling(clerkUserId);
    if (!meta.stripeCustomerId) {
      return NextResponse.json(
        { error: 'No Stripe customer for this user yet' },
        { status: 400 },
      );
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: meta.stripeCustomerId,
      return_url: `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
