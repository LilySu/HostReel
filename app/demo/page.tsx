import Link from 'next/link';
import { DemoView, type DemoData } from './DemoView';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sample walkthrough — HostReel',
  description:
    'A sample short-term-rental walkthrough showing how guests use HostReel at check-in.',
  robots: { index: false, follow: false },
};

// All-static demo data. The video player slot is replaced with a poster image
// (DemoView doesn't ship a real <video> because there's no source MP4 to
// host) — guests see real video on actual published properties. The point of
// this page is to give a brand-new host the shape of the product in one click
// before they upload anything themselves.
const DEMO: DemoData = {
  property: {
    name: 'Cozy Mountain Cabin',
    hostFirstName: 'Sarah',
    updatedLabel: '2 days ago',
  },
  video: {
    title: 'Welcome — kitchen, wifi, and trash day',
    posterUrl: '/images/aes-a7Cf-p-ShfA-unsplash.jpg',
    duration: '3:47',
    description:
      'Quick tour of the kitchen, where the wifi card lives, and the bin schedule. Watch this before check-in.',
  },
  hotspots: [
    {
      id: 'demo-wifi',
      title: 'Wifi',
      icon: 'wifi',
      time: '0:12',
      instructions:
        '**Network:** MountainCabin-2.4\n**Password:** alpenglow1899\n\nIf wifi drops, hold the button on the back of the router for 10 seconds and let it boot back up.',
    },
    {
      id: 'demo-dishwasher',
      title: 'Dishwasher',
      icon: 'appliance',
      time: '1:08',
      instructions:
        'Pods under the sink. Run **Normal** on cold for most loads. The detergent door snaps shut — make sure it clicks before you start the cycle.',
      photoSrc: '/images/julia-shypka-ua1pO52YKDA-unsplash.jpg',
    },
    {
      id: 'demo-trash',
      title: 'Trash day',
      icon: 'trash',
      time: '2:14',
      instructions:
        '**Pickup:** Tuesday and Friday before 7am.\n**Bins:** out by the cedar at the foot of the driveway. Rinse recycling.',
      photoSrc: '/images/brandon-griggs-khAgMiA7duA-unsplash.jpg',
    },
    {
      id: 'demo-thermostat',
      title: 'Thermostat',
      icon: 'other',
      time: '2:51',
      instructions:
        'Comfortable range: 68–72°F. Please don\'t set below 65°F in winter (pipes). It\'s the small unit in the hallway.',
    },
    {
      id: 'demo-checkout',
      title: 'Check-out',
      icon: 'key',
      time: '3:30',
      instructions:
        'Check-out by **11:00 AM**. Strip the sheets and leave them on the bed. Lock the door behind you — it auto-locks but please double-check.',
    },
  ],
};

export default function DemoPage() {
  return (
    <>
      <div className="border-b border-gold/30 bg-gold/10">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
          <span className="text-charcoal">
            <span className="font-medium">Sample tour.</span> This is what a
            guest sees on a HostReel walkthrough — yours will be your own
            video and your own notes.
          </span>
          <Link href="/sign-up" className="btn-primary inline-flex">
            Make my own
          </Link>
        </div>
      </div>
      <DemoView data={DEMO} />
    </>
  );
}
