import 'server-only';
import { clerkClient } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { count, eq } from 'drizzle-orm';
import { db } from './db/client';
import { videos, properties } from './db/schema';

// ---------- Plans ----------

export const PLAN_LIMITS = {
  trial: { maxVideos: 20 },
  pro: { maxVideos: 100 },
  past_due: { maxVideos: 0 },
  canceled: { maxVideos: 0 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export type BillingMetadata = {
  plan?: PlanName;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  trialEndsAt?: string; // ISO; set by Clerk user.created webhook
  currentPeriodEnd?: string; // ISO; set by Stripe webhooks
  lastStripeEventId?: string; // for webhook idempotency
};

// ---------- Stripe client (lazy) ----------

let cachedStripe: Stripe | null = null;

/**
 * Returns the Stripe client. Throws if STRIPE_SECRET_KEY is unset — call sites
 * should guard with `isStripeConfigured()` when running in dev without Stripe.
 */
export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  // Let the SDK pick its bundled apiVersion — don't pin.
  cachedStripe = new Stripe(key);
  return cachedStripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// ---------- Metadata read/write ----------

export async function getBilling(clerkUserId: string): Promise<BillingMetadata> {
  const client = await clerkClient();
  const user = await client.users.getUser(clerkUserId);
  return (user.publicMetadata as BillingMetadata) ?? {};
}

export async function setBilling(
  clerkUserId: string,
  patch: Partial<BillingMetadata>,
): Promise<BillingMetadata> {
  const existing = await getBilling(clerkUserId);
  const merged = { ...existing, ...patch };
  const client = await clerkClient();
  await client.users.updateUser(clerkUserId, { publicMetadata: merged });
  return merged;
}

/**
 * Resolves the user's *effective* plan. A trial whose `trialEndsAt` has passed
 * is treated as `canceled` until the user actually pays. Anything else just
 * mirrors the stored `plan`.
 */
export function effectivePlan(meta: BillingMetadata): PlanName {
  if (!meta.plan) return 'trial';
  if (meta.plan === 'trial' && meta.trialEndsAt) {
    if (new Date(meta.trialEndsAt) < new Date()) return 'canceled';
  }
  return meta.plan;
}

// ---------- Quota check ----------

export async function countUserVideos(clerkUserId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(videos)
    .innerJoin(properties, eq(videos.propertyId, properties.id))
    .where(eq(properties.clerkUserId, clerkUserId));
  return rows[0]?.n ?? 0;
}

export class BillingLimitError extends Error {
  constructor(
    public plan: PlanName,
    public current: number,
    public limit: number,
  ) {
    super(`Video limit reached: ${current}/${limit} on plan '${plan}'.`);
    this.name = 'BillingLimitError';
  }
}

export type BillingLimitResponse = {
  error: string;
  code: 'BILLING_LIMIT';
  plan: PlanName;
  current: number;
  limit: number;
};

/**
 * Throws BillingLimitError if the user has hit their video quota. Pre-flight
 * check before creating a video. Racy against concurrent uploads (worst case:
 * +1 over limit), which we accept for v1.
 *
 * In environments without Stripe configured we skip the check entirely so
 * local dev / pre-billing setups stay usable. Call sites should still treat
 * the user as on `trial`.
 */
export async function assertCanCreateVideo(clerkUserId: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const meta = await getBilling(clerkUserId);
  const plan = effectivePlan(meta);
  const limit = PLAN_LIMITS[plan].maxVideos;
  const current = await countUserVideos(clerkUserId);
  if (current >= limit) {
    throw new BillingLimitError(plan, current, limit);
  }
}

/**
 * Stays are a Pro-tier feature. Trial / past_due / canceled users see the
 * upgrade prompt instead of being able to send invitations. No metering on
 * top of plan — once you're Pro, send as many as you want.
 *
 * Like assertCanCreateVideo, this is a no-op when Stripe isn't configured.
 */
export async function assertCanCreateStay(clerkUserId: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const meta = await getBilling(clerkUserId);
  const plan = effectivePlan(meta);
  if (plan !== 'pro') {
    // We reuse BillingLimitError with limit=0 so the upgrade-dialog UI can
    // render without a special branch — it already handles "0 allowed" cleanly.
    throw new BillingLimitError(plan, 0, 0);
  }
}
