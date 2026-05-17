'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function HostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[host] error boundary caught', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <div className="surface-card space-y-4 p-8">
        <div className="overline">Something went wrong</div>
        <h1 className="font-serif text-2xl font-medium tracking-tight">
          That page didn&rsquo;t load.
        </h1>
        <p className="text-sm leading-relaxed text-charcoal-light">
          A glitch on our end. Try again — and if it keeps happening, send the
          digest below to support.
        </p>
        {error.digest && (
          <code className="block break-all rounded-md border border-sand-light bg-cream-dark/30 p-2 font-mono text-[10px] text-charcoal-light">
            {error.digest}
          </code>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/properties" className="btn-secondary">
            Back to properties
          </Link>
        </div>
      </div>
    </div>
  );
}
