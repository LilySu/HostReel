'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Wifi,
  Trash,
  KeyRound,
  WashingMachine,
  TreePine,
  Car,
  CircleDot,
  Play,
  type LucideIcon,
} from 'lucide-react';

export type DemoIcon =
  | 'wifi'
  | 'appliance'
  | 'outdoor'
  | 'trash'
  | 'key'
  | 'parking'
  | 'other';

export type DemoData = {
  property: {
    name: string;
    hostFirstName: string;
    updatedLabel: string;
  };
  video: {
    title: string;
    posterUrl: string;
    duration: string;
    description: string;
  };
  hotspots: Array<{
    id: string;
    title: string;
    icon: DemoIcon;
    time: string;
    instructions: string;
    photoSrc?: string;
  }>;
};

const ICON_BY_NAME: Record<DemoIcon, LucideIcon> = {
  wifi: Wifi,
  appliance: WashingMachine,
  outdoor: TreePine,
  trash: Trash,
  key: KeyRound,
  parking: Car,
  other: CircleDot,
};

export function DemoView({ data }: { data: DemoData }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-cream pb-16">
      <header className="border-b border-sand bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/80">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              {data.property.name}
            </h1>
            <p className="mt-0.5 text-xs text-charcoal-light">
              hosted by {data.property.hostFirstName} · updated{' '}
              {data.property.updatedLabel}
            </p>
          </div>
        </div>
      </header>

      <main className="container py-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="relative mx-auto w-full overflow-hidden rounded-lg border border-sand-light bg-charcoal">
              {/* Static poster — the demo doesn't carry a real video file.
                  A small play icon hints at the affordance without lying that
                  the placeholder is interactive. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.video.posterUrl}
                alt=""
                className="block aspect-video h-auto w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-charcoal shadow-sm">
                  <Play size={28} className="ml-1" />
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-charcoal/70 px-1.5 py-0.5 text-xs font-medium text-white">
                {data.video.duration}
              </div>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-medium tracking-tight">
                {data.video.title}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal-light">
                {data.video.description}
              </p>
            </div>
          </div>

          <aside>
            <div className="surface-card overflow-hidden">
              <div className="border-b border-sand-light px-5 py-3">
                <div className="overline">In this video</div>
                <h3 className="mt-1 font-serif text-xl font-medium tracking-tight">
                  {data.hotspots.length} tips
                </h3>
              </div>
              <ul className="divide-y divide-sand-light">
                {data.hotspots.map((h) => {
                  const Icon = ICON_BY_NAME[h.icon];
                  const expanded = openId === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenId(expanded ? null : h.id)
                        }
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-200 hover:bg-cream-dark/40"
                      >
                        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-cream-dark text-charcoal-light">
                          <Icon size={16} />
                        </span>
                        <span className="flex-1 truncate text-sm font-medium">
                          {h.title}
                        </span>
                        <span className="font-mono text-xs text-charcoal-light">
                          {h.time}
                        </span>
                      </button>
                      {expanded && (
                        <div className="space-y-3 border-t border-sand-light bg-cream/40 px-5 py-4 text-sm leading-relaxed">
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {h.instructions}
                            </ReactMarkdown>
                          </div>
                          {h.photoSrc && (
                            <div className="relative aspect-video w-2/3 overflow-hidden rounded-md border border-sand-light">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={h.photoSrc}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
