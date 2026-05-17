import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="surface-card space-y-4 p-8">
          <div className="overline">Not found</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            We couldn&rsquo;t find that page.
          </h1>
          <p className="text-sm leading-relaxed text-charcoal-light">
            The link may be wrong or the page may have moved.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/" className="btn-primary">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
