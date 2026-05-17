'use client';

import { useState } from 'react';
import type { PlanName } from '@/lib/billing';

export function BillingActions({
  plan,
  stripeOn,
}: {
  plan: PlanName;
  stripeOn: boolean;
}) {
  const [pending, setPending] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(target: 'checkout' | 'portal') {
    setError(null);
    setPending(target);
    try {
      const res = await fetch(`/api/stripe/${target}`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string };
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open Stripe.');
      setPending(null);
    }
  }

  if (!stripeOn) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(plan === 'trial' || plan === 'canceled') && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => go('checkout')}
            className="btn-primary"
          >
            {pending === 'checkout' ? 'Opening Stripe…' : 'Upgrade to Pro'}
          </button>
        )}
        {(plan === 'pro' || plan === 'past_due') && (
          <button
            type="button"
            disabled={pending !== null}
            onClick={() => go('portal')}
            className="btn-primary"
          >
            {pending === 'portal'
              ? 'Opening portal…'
              : plan === 'past_due'
                ? 'Update payment method'
                : 'Manage subscription'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
