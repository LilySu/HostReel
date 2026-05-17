import { requireUser } from '@/lib/auth';
import {
  countUserVideos,
  effectivePlan,
  getBilling,
  isStripeConfigured,
  PLAN_LIMITS,
} from '@/lib/billing';
import { BillingActions } from './BillingActions';

export const dynamic = 'force-dynamic';

export default async function BillingPage() {
  const userId = await requireUser();
  const stripeOn = isStripeConfigured();
  const meta = stripeOn ? await getBilling(userId) : {};
  const plan = effectivePlan(meta);
  const limit = PLAN_LIMITS[plan].maxVideos;
  const current = await countUserVideos(userId);

  const trialDaysLeft =
    plan === 'trial' && meta.trialEndsAt
      ? Math.max(
          0,
          Math.ceil(
            (new Date(meta.trialEndsAt).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : null;

  const periodEndDate = meta.currentPeriodEnd
    ? new Date(meta.currentPeriodEnd)
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <div className="overline">Account</div>
        <h1 className="mt-1 font-serif text-4xl font-medium tracking-tight">
          Billing
        </h1>
      </div>

      {!stripeOn && (
        <div className="surface-card space-y-2 p-6">
          <div className="overline">Billing disabled in this environment</div>
          <p className="text-sm text-charcoal-light">
            Stripe isn&rsquo;t configured here, so the video quota gate is
            disabled. Set <code className="font-mono">STRIPE_SECRET_KEY</code>{' '}
            and the other Stripe / Clerk-webhook vars in <code>.env</code> to
            enable the trial + Pro plan.
          </p>
        </div>
      )}

      <section className="surface-card space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="overline">Current plan</div>
            <h2 className="mt-1 font-serif text-2xl font-medium capitalize">
              {plan === 'past_due' ? 'Past due' : plan}
            </h2>
          </div>
          <span
            className={
              plan === 'pro'
                ? 'inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold-dark'
                : plan === 'past_due'
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700'
                  : 'inline-flex items-center gap-1.5 rounded-full bg-sand/40 px-3 py-1 text-xs font-medium text-charcoal-light'
            }
          >
            {plan === 'trial' && trialDaysLeft !== null
              ? `${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left`
              : plan === 'pro' && periodEndDate
                ? `Renews ${periodEndDate.toLocaleDateString()}`
                : plan === 'past_due'
                  ? 'Payment needed'
                  : plan === 'canceled'
                    ? 'Canceled'
                    : ''}
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-sm text-charcoal-light">
            <span>Video usage</span>
            <span className="font-medium text-charcoal">
              {current} / {limit}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-light">
            <div
              className="h-full bg-gold"
              style={{
                width: `${limit === 0 ? 0 : Math.min(100, Math.round((current / limit) * 100))}%`,
              }}
            />
          </div>
        </div>

        {plan === 'past_due' && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            Your last payment failed. Update your payment method to keep your
            account active.
          </p>
        )}

        <BillingActions plan={plan} stripeOn={stripeOn} />
      </section>
    </div>
  );
}
