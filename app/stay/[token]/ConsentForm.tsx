'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ConsentForm({
  token,
  consentText,
}: {
  token: string;
  consentText: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/stay/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      setError('Could not record consent. Please try again.');
      setSubmitting(false);
      return;
    }
    router.push(`/stay/${token}/walkthrough`);
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-sand-light bg-white p-4 text-sm leading-relaxed text-charcoal">
        {consentText}
      </p>
      <label className="flex items-start gap-3 rounded-md border border-sand-light bg-white p-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-1 h-4 w-4 accent-gold"
        />
        <span className="text-charcoal">
          I&rsquo;ve read this and I&rsquo;m ready to begin.
        </span>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="button"
        disabled={!checked || submitting}
        onClick={onContinue}
        className="btn-primary"
      >
        {submitting ? 'One moment…' : 'Continue to walkthrough'}
      </button>
    </div>
  );
}
