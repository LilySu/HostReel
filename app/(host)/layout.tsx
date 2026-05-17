import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import {
  effectivePlan,
  getBilling,
  isStripeConfigured,
} from '@/lib/billing';

export default async function HostLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  let trialAlmostUp = false;
  let pastDue = false;
  if (userId && isStripeConfigured()) {
    const meta = await getBilling(userId);
    const plan = effectivePlan(meta);
    if (plan === 'past_due') pastDue = true;
    if (plan === 'trial' && meta.trialEndsAt) {
      const daysLeft = Math.ceil(
        (new Date(meta.trialEndsAt).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24),
      );
      if (daysLeft <= 3) trialAlmostUp = true;
    }
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-sand bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/80">
        <div className="container flex h-16 items-center justify-between">
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-wide text-gold transition-colors duration-200 hover:text-gold-dark"
          >
            HostReel
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/properties"
              className="text-sm font-medium text-charcoal-light transition-colors duration-200 hover:text-charcoal"
            >
              Properties
            </Link>
            <Link
              href="/billing"
              className="relative text-sm font-medium text-charcoal-light transition-colors duration-200 hover:text-charcoal"
            >
              Billing
              {(trialAlmostUp || pastDue) && (
                <span
                  aria-label={pastDue ? 'Payment past due' : 'Trial ending soon'}
                  className={`absolute -right-2 -top-1 h-2 w-2 rounded-full ${
                    pastDue ? 'bg-red-600' : 'bg-gold'
                  }`}
                />
              )}
            </Link>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'h-9 w-9 ring-1 ring-sand',
                },
              }}
            />
          </nav>
        </div>
      </header>
      <main className="container py-10">{children}</main>
    </div>
  );
}
