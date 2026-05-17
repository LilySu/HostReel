import { NextResponse } from 'next/server';
import { clerkClient } from '@clerk/nextjs/server';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { getBilling, getStripe, isStripeConfigured, setBilling } from '@/lib/billing';

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
    const stripe = getStripe();

    let customerId = meta.stripeCustomerId;
    if (!customerId) {
      const client = await clerkClient();
      const user = await client.users.getUser(clerkUserId);
      const email = user.emailAddresses[0]?.emailAddress;
      const customer = await stripe.customers.create({
        email,
        metadata: { clerkUserId },
      });
      customerId = customer.id;
      await setBilling(clerkUserId, { stripeCustomerId: customerId });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    if (!priceId) {
      return NextResponse.json(
        { error: 'STRIPE_PRO_PRICE_ID is not set' },
        { status: 500 },
      );
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/billing?status=success`,
      cancel_url: `${baseUrl}/billing?status=cancel`,
      allow_promotion_codes: true,
      client_reference_id: clerkUserId,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    throw err;
  }
}
