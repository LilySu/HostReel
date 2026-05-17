import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getBilling, getStripe, setBilling } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new NextResponse('Missing signature', { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new NextResponse('Server misconfigured', { status: 500 });

  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature failed', err);
    return new NextResponse('Bad signature', { status: 400 });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error('Stripe webhook handler error', { eventId: event.id, err });
    // Returning non-200 makes Stripe retry — what we want for transient errors.
    return new NextResponse('Handler error', { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  const customerId = extractCustomerId(event);
  if (!customerId) return;
  const clerkUserId = await resolveClerkUser(customerId);
  if (!clerkUserId) return;

  // Idempotency: skip if we've processed this event id for this user already.
  const meta = await getBilling(clerkUserId);
  if (meta.lastStripeEventId === event.id) return;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = session.subscription as string | undefined;
      if (!subscriptionId) return;
      const sub = await getStripe().subscriptions.retrieve(subscriptionId);
      await setBilling(clerkUserId, {
        plan: mapStatusToPlan(sub.status),
        stripeSubscriptionId: subscriptionId,
        currentPeriodEnd: extractCurrentPeriodEnd(sub),
        lastStripeEventId: event.id,
      });
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await setBilling(clerkUserId, {
        plan: mapStatusToPlan(sub.status),
        currentPeriodEnd: extractCurrentPeriodEnd(sub),
        lastStripeEventId: event.id,
      });
      break;
    }
    case 'customer.subscription.deleted': {
      await setBilling(clerkUserId, {
        plan: 'canceled',
        lastStripeEventId: event.id,
      });
      break;
    }
    default:
      // Mark unknown events as processed so Stripe doesn't retry forever.
      await setBilling(clerkUserId, { lastStripeEventId: event.id });
  }
}

function extractCustomerId(event: Stripe.Event): string | null {
  const obj = event.data.object as { customer?: string | Stripe.Customer };
  if (!obj?.customer) return null;
  return typeof obj.customer === 'string' ? obj.customer : obj.customer.id;
}

async function resolveClerkUser(customerId: string): Promise<string | null> {
  const customer = await getStripe().customers.retrieve(customerId);
  if ('deleted' in customer && customer.deleted) return null;
  return (
    (customer as Stripe.Customer).metadata?.clerkUserId as string | undefined
  ) ?? null;
}

function mapStatusToPlan(
  status: Stripe.Subscription.Status,
): 'pro' | 'past_due' | 'canceled' {
  if (status === 'active' || status === 'trialing') return 'pro';
  if (status === 'past_due' || status === 'unpaid') return 'past_due';
  return 'canceled';
}

function extractCurrentPeriodEnd(sub: Stripe.Subscription): string | undefined {
  // Not present on `incomplete` subscriptions; guard.
  const cpe = (sub as unknown as { current_period_end?: number })
    .current_period_end;
  if (typeof cpe !== 'number') return undefined;
  return new Date(cpe * 1000).toISOString();
}
