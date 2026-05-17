import Link from 'next/link';
import Image from 'next/image';
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-cream md:grid-cols-2">
      <div className="relative hidden md:block">
        <Image
          src="/images/hans-eKu4SWDa2jE-unsplash.jpg"
          alt=""
          fill
          sizes="50vw"
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 via-charcoal/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-white">
          <span className="overline text-white/80">Welcome back</span>
          <p className="mt-3 max-w-sm font-serif text-3xl font-medium leading-tight">
            Your guests are already in the door.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        <Link
          href="/"
          className="mb-8 font-serif text-2xl font-semibold tracking-wide text-gold"
        >
          Walkthrough.
        </Link>
        <SignIn
          appearance={{
            variables: {
              colorPrimary: '#C8A876',
              colorText: '#2A2723',
              colorBackground: '#FFFFFF',
              colorInputBackground: '#FFFFFF',
              colorInputText: '#2A2723',
              borderRadius: '0.5rem',
              fontFamily: 'var(--font-sans)',
            },
            elements: {
              card: 'border border-sand-light shadow-sm',
              headerTitle: 'font-serif text-2xl',
            },
          }}
        />
      </div>
    </main>
  );
}
