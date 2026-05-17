import Image from 'next/image';
import Link from 'next/link';
import { SignedIn, SignedOut } from '@clerk/nextjs';

const sampleSections = [
  {
    title: 'Welcome',
    body: 'A short hello at the front door, key code, and how to find the wifi card.',
    image: '/images/jon-tyson-XS_o-Iuf9Go-unsplash.jpg',
  },
  {
    title: 'Appliances',
    body: 'How to start the dishwasher, what soap to use, where the lint trap lives.',
    image: '/images/julia-shypka-ua1pO52YKDA-unsplash.jpg',
  },
  {
    title: 'Trash day',
    body: 'Which bin is which, which day pickup happens, and where to leave them.',
    image: '/images/brandon-griggs-khAgMiA7duA-unsplash.jpg',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="container flex h-20 items-center justify-between">
          <Link
            href="/"
            className="font-serif text-2xl font-semibold tracking-wide text-gold transition-colors duration-200 hover:text-gold-dark"
          >
            HostReel
          </Link>
          <nav className="flex items-center gap-3">
            <SignedOut>
              <Link href="/sign-in" className="hidden text-sm font-medium text-white/90 hover:text-white sm:inline">
                Sign in
              </Link>
              <Link href="/sign-up" className="btn-primary">
                Get started
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/properties" className="btn-primary">
                Your properties
              </Link>
            </SignedIn>
          </nav>
        </div>
      </header>

      <section className="relative h-screen max-h-[820px] min-h-[640px] w-full overflow-hidden">
        <Image
          src="/images/aes-a7Cf-p-ShfA-unsplash.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/70 via-charcoal/40 to-transparent" />

        <div className="container relative flex h-full items-center">
          <div className="max-w-xl space-y-6 text-white">
            <span className="overline text-white/80">For short-term rental hosts</span>
            <h1 className="font-serif text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Walkthroughs <br /> your guests <em className="text-gold not-italic">actually</em> watch.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-white/85">
              Upload one short video of your rental. Pin instructions to the moments
              that matter — wifi, washer, deck, trash day. Share one link. No app, no
              account for your guests.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <SignedOut>
                <Link href="/sign-up" className="btn-primary">
                  Get started
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/20"
                >
                  See a sample tour →
                </Link>
                <Link
                  href="/sign-in"
                  className="hidden items-center justify-center rounded-full px-3 py-2.5 text-sm font-medium text-white/80 transition-colors duration-200 hover:text-white sm:inline-flex"
                >
                  Sign in
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/properties" className="btn-primary">
                  Go to your properties
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="grid gap-12 md:grid-cols-3">
          {[
            {
              eyebrow: 'Step one',
              title: 'Record a walkthrough',
              body: 'Five minutes or less. Phone in portrait or landscape — both work.',
            },
            {
              eyebrow: 'Step two',
              title: 'Pin the instructions',
              body: 'Drop a hotspot at the right moment. Add notes, photos, a few lines of markdown.',
            },
            {
              eyebrow: 'Step three',
              title: 'Share one link',
              body: 'Guests tap to play, tap a hotspot to expand. No download, no account.',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-3">
              <div className="overline">{item.eyebrow}</div>
              <h3 className="font-serif text-2xl font-medium">{item.title}</h3>
              <p className="text-sm leading-relaxed text-charcoal-light">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-sand bg-cream-dark/30 py-20">
        <div className="container">
          <div className="mb-12 max-w-2xl">
            <div className="overline">What&rsquo;s inside a walkthrough</div>
            <h2 className="mt-2 font-serif text-4xl font-medium tracking-tight">
              The little things guests always ask about.
            </h2>
            <p className="mt-3 text-base text-charcoal-light">
              Organize one video — or a handful of short clips — into sections that
              answer the questions you&rsquo;d otherwise be texting at 11pm.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {sampleSections.map((item) => (
              <article key={item.title} className="surface-card overflow-hidden">
                <div className="relative aspect-[4/5] w-full overflow-hidden bg-sand-light">
                  <Image
                    src={item.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover transition-opacity duration-300"
                  />
                </div>
                <div className="space-y-2 p-6">
                  <div className="overline">Section</div>
                  <h3 className="font-serif text-2xl font-medium tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-charcoal-light">
                    {item.body}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-sand py-10">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="font-serif text-lg text-gold">Walkthrough.</span>
          <p className="text-xs text-charcoal-light">
            Photography by various contributors via Unsplash.
          </p>
        </div>
      </footer>
    </div>
  );
}
