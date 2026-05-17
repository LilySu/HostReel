import Link from 'next/link';
import { NewPropertyForm } from './NewPropertyForm';

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-md space-y-8">
      <div>
        <Link
          href="/properties"
          className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
        >
          ← Properties
        </Link>
        <div className="mt-4 overline">A new listing</div>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">
          New property
        </h1>
        <p className="mt-2 text-sm text-charcoal-light">
          Start with a name. You can add a walkthrough video next.
        </p>
      </div>
      <NewPropertyForm />
    </div>
  );
}
