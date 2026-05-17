import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond } from 'next/font/google';
import localFont from 'next/font/local';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const serif = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

// Quattrocento Sans — humanist sans that pairs naturally with Cormorant's
// classical letterforms. Files are bundled locally so we don't depend on
// Google Fonts CDN at request time.
const sans = localFont({
  src: [
    {
      path: '../public/font/QuattrocentoSans-Regular.ttf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/font/QuattrocentoSans-Italic.ttf',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../public/font/QuattrocentoSans-Bold.ttf',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../public/font/QuattrocentoSans-BoldItalic.ttf',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'HostReel',
  description: 'Self-service check-in guides for short-term rentals',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#C8A876',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${serif.variable} ${sans.variable}`}>
        <body className="min-h-screen bg-cream font-sans text-charcoal antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
