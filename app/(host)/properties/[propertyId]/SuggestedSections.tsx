'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Most short-term rentals have the same four sections. Offering one-tap
// chips beats forcing every new host to type these out from scratch.
const TEMPLATES = [
  'Welcome',
  'Appliances',
  'Trash day',
  'Lockup',
] as const;

export function SuggestedSections({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createOne(title: string) {
    if (creating) return;
    setCreating(title);
    setError(null);
    const res = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId, title }),
    });
    setCreating(null);
    if (!res.ok) {
      setError('Could not add that section. Try again.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="surface-card space-y-3 p-5">
      <div className="space-y-1">
        <div className="overline">Suggested</div>
        <p className="text-sm text-charcoal-light">
          Most hosts start with these. Tap one to add it to this property.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t}
            type="button"
            disabled={creating !== null}
            onClick={() => createOne(t)}
            className="inline-flex items-center gap-1 rounded-full border border-sand-light bg-white px-3 py-1 text-xs font-medium text-charcoal transition-colors duration-200 hover:border-gold hover:text-gold-dark disabled:opacity-50"
          >
            {creating === t ? `Adding ${t}…` : `+ ${t}`}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
