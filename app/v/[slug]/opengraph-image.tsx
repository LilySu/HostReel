import { ImageResponse } from 'next/og';
import { getPublishedPropertyBySlug } from '@/lib/db/queries';

// Dynamic Open Graph card. Renders the property name on the Himara cream/
// gold palette so when a guest pastes the link into iMessage / Slack / a
// Twitter DM, the preview looks like a real product instead of a 404.
//
// Per the UX brief: this single render is the difference between "looks
// like a phishing link" and "looks like something the host actually made".

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const property = await getPublishedPropertyBySlug(params.slug);
  const name = property?.name ?? 'Walkthrough';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#FAF6EE',
          padding: '64px',
          fontFamily: 'serif',
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: 8,
            textTransform: 'uppercase',
            color: '#A88B5C',
            fontWeight: 500,
          }}
        >
          HostReel
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 22,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#5A554D',
            }}
          >
            Your walkthrough for
          </div>
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.05,
              color: '#2A2723',
              fontWeight: 600,
              maxWidth: 1000,
            }}
          >
            {name}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: 22,
              color: '#5A554D',
            }}
          >
            Tap to view the check-in guide
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#A88B5C',
              fontWeight: 500,
            }}
          >
            ●
          </div>
        </div>
      </div>
    ),
    size,
  );
}
