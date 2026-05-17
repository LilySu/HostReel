'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CompleteForm({
  token,
  guestName,
}: {
  token: string;
  guestName: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (typed.trim().length < 2 || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/stay/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ typedSignature: typed.trim() }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Could not complete check-in.');
      setSubmitting(false);
      return;
    }
    router.push(`/stay/${token}/done`);
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-charcoal">
          Type your full name
        </label>
        <input
          type="text"
          autoComplete="name"
          maxLength={80}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={guestName}
          className="field-input font-serif text-lg"
        />
      </div>
      <p className="text-xs leading-relaxed text-charcoal-light">
        Your typed name above serves as your electronic signature confirming
        the acknowledgments above.
      </p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting || typed.trim().length < 2}
          className="btn-primary"
        >
          {submitting ? 'Finalizing…' : 'Sign and complete'}
        </button>
      </div>
    </form>
  );
}
