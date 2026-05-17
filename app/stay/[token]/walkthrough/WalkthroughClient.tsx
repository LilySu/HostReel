'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  Check,
  type LucideIcon,
} from 'lucide-react';
import type { HotspotIcon } from '@/lib/validators';
import type { VideoJsPlayer } from '@/components/video/types';

const VideoJSWithAnnotations = dynamic(
  () =>
    import('@/components/video/VideoJSWithAnnotations').then(
      (m) => m.VideoJSWithAnnotations,
    ),
  { ssr: false },
);

export type StayWalkthroughData = {
  stayId: string;
  token: string;
  guestName: string;
  propertyName: string;
  sections: { id: string; title: string }[];
  videos: {
    id: string;
    sectionId: string | null;
    title: string;
    description: string | null;
    durationSeconds: number;
    widthPx: number | null;
    heightPx: number | null;
    sourceUrl: string;
    posterUrl: string | null;
  }[];
  hotspots: {
    id: string;
    videoId: string;
    timestampSeconds: number;
    title: string;
    icon: HotspotIcon;
    instructionsMd: string;
    requiredAcknowledgment: boolean;
    photos: { id: string; url: string }[];
  }[];
  initiallyAcknowledged: string[];
};

const ICON_BY_NAME: Record<HotspotIcon, LucideIcon> = {
  wifi: Wifi,
  appliance: WashingMachine,
  outdoor: TreePine,
  trash: Trash,
  key: KeyRound,
  parking: Car,
  other: CircleDot,
};

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function WalkthroughClient({ data }: { data: StayWalkthroughData }) {
  const firstVideoId = data.videos[0]?.id ?? null;
  const [activeVideoId, setActiveVideoId] = useState<string | null>(firstVideoId);
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(
    () => new Set(data.initiallyAcknowledged),
  );
  const [acking, setAcking] = useState<string | null>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);

  const activeVideo = useMemo(
    () => data.videos.find((v) => v.id === activeVideoId) ?? null,
    [data.videos, activeVideoId],
  );
  const activeHotspots = useMemo(
    () =>
      activeVideo
        ? data.hotspots.filter((h) => h.videoId === activeVideo.id)
        : [],
    [data.hotspots, activeVideo],
  );
  const requiredIds = useMemo(
    () => data.hotspots.filter((h) => h.requiredAcknowledgment).map((h) => h.id),
    [data.hotspots],
  );
  const activeRequiredHotspotIds = useMemo(
    () => new Set(activeHotspots.filter((h) => h.requiredAcknowledgment).map((h) => h.id)),
    [activeHotspots],
  );
  const totalRequired = requiredIds.length;
  const acknowledgedRequired = useMemo(
    () => requiredIds.filter((id) => acknowledged.has(id)).length,
    [requiredIds, acknowledged],
  );
  const allDone =
    totalRequired > 0 && acknowledgedRequired >= totalRequired;

  function seekTo(t: number) {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime(Math.max(0, t));
    player.play()?.catch?.(() => {});
  }

  async function recordEvent(
    type:
      | 'video_played'
      | 'video_paused'
      | 'hotspot_viewed'
      | 'hotspot_acknowledged',
    extra: { hotspotId?: string; videoId?: string; videoTimeSeconds?: number } = {},
  ): Promise<boolean> {
    const res = await fetch('/api/stay/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...extra }),
    });
    return res.ok;
  }

  async function acknowledge(hotspotId: string) {
    if (acknowledged.has(hotspotId) || acking) return;
    setAcking(hotspotId);
    const tRaw = playerRef.current?.currentTime();
    const t = typeof tRaw === 'number' ? tRaw : undefined;
    const ok = await recordEvent('hotspot_acknowledged', {
      hotspotId,
      videoId: activeVideo?.id,
      videoTimeSeconds: t !== undefined ? Math.floor(t) : undefined,
    });
    setAcking(null);
    if (ok) {
      setAcknowledged((set) => {
        const next = new Set(set);
        next.add(hotspotId);
        return next;
      });
    }
  }

  const isVertical = activeVideo
    ? activeVideo.widthPx &&
      activeVideo.heightPx &&
      activeVideo.heightPx > activeVideo.widthPx
    : false;

  return (
    <div className="min-h-screen bg-cream pb-32">
      <header className="border-b border-sand bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/80">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <h1 className="font-serif text-xl font-medium tracking-tight">
              {data.propertyName}
            </h1>
            <p className="text-xs text-charcoal-light">
              Welcome, {data.guestName.split(' ')[0]} · review your walkthrough
              below
            </p>
          </div>
          {totalRequired > 0 && (
            <div className="text-right">
              <div className="font-mono text-sm font-medium text-charcoal">
                {acknowledgedRequired} / {totalRequired}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-charcoal-light">
                Acknowledged
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="container py-6 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {activeVideo && (
              <>
                <div
                  className={`mx-auto overflow-hidden rounded-lg border border-sand-light bg-charcoal ${
                    isVertical ? 'max-w-[40vh]' : 'w-full'
                  }`}
                >
                  <VideoJSWithAnnotations
                    src={activeVideo.sourceUrl}
                    poster={activeVideo.posterUrl}
                    hotspots={activeHotspots.map((h) => ({
                      id: h.id,
                      timestampSeconds: h.timestampSeconds,
                      title: h.title,
                      icon: h.icon,
                      instructionsMd: h.instructionsMd,
                    }))}
                    hostName="Host"
                    mode="guest"
                    requiredHotspotIds={activeRequiredHotspotIds}
                    onHotspotOpened={(id) => {
                      setOpenHotspotId(id);
                      const h = activeHotspots.find((x) => x.id === id);
                      if (h) {
                        void recordEvent('hotspot_viewed', {
                          hotspotId: h.id,
                          videoId: h.videoId,
                          videoTimeSeconds: Math.floor(h.timestampSeconds),
                        });
                      }
                    }}
                    onPlayerReady={(player) => {
                      playerRef.current = player;
                      player.on('play', () => {
                        const raw = player.currentTime();
                        const t = typeof raw === 'number' ? raw : 0;
                        void recordEvent('video_played', {
                          videoId: activeVideo.id,
                          videoTimeSeconds: Math.floor(t),
                        });
                      });
                      player.on('pause', () => {
                        const raw = player.currentTime();
                        const t = typeof raw === 'number' ? raw : 0;
                        void recordEvent('video_paused', {
                          videoId: activeVideo.id,
                          videoTimeSeconds: Math.floor(t),
                        });
                      });
                    }}
                  />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-medium tracking-tight">
                    {activeVideo.title}
                  </h2>
                  {activeVideo.description && (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-charcoal-light">
                      {activeVideo.description}
                    </p>
                  )}
                </div>
              </>
            )}

            {data.videos.length > 1 && (
              <nav className="space-y-3">
                <div className="overline">All videos</div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.videos.map((v) => {
                    const active = v.id === activeVideoId;
                    return (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveVideoId(v.id);
                            setOpenHotspotId(null);
                          }}
                          className={`block w-full overflow-hidden rounded-md border text-left transition-colors duration-200 ${
                            active
                              ? 'border-gold ring-1 ring-gold/30'
                              : 'border-sand-light hover:border-gold/50'
                          }`}
                        >
                          <div className="relative aspect-video bg-sand-light">
                            {v.posterUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={v.posterUrl}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                              />
                            )}
                          </div>
                          <div className="space-y-0.5 px-2 py-1.5">
                            <div className="truncate text-xs font-medium">
                              {v.title}
                            </div>
                            <div className="font-mono text-[10px] text-charcoal-light">
                              {formatTime(v.durationSeconds)}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>

          <aside>
            <div className="surface-card overflow-hidden">
              <div className="border-b border-sand-light px-5 py-3">
                <div className="overline">In this video</div>
                <h3 className="mt-1 font-serif text-xl font-medium tracking-tight">
                  {activeHotspots.length}{' '}
                  {activeHotspots.length === 1 ? 'item' : 'items'}
                </h3>
              </div>
              {activeHotspots.length === 0 ? (
                <p className="px-5 py-6 text-sm text-charcoal-light">
                  Just press play.
                </p>
              ) : (
                <ul className="divide-y divide-sand-light">
                  {activeHotspots.map((h) => (
                    <WalkthroughHotspot
                      key={h.id}
                      hotspot={h}
                      expanded={openHotspotId === h.id}
                      acknowledged={acknowledged.has(h.id)}
                      acking={acking === h.id}
                      onToggle={() => {
                        setOpenHotspotId(
                          openHotspotId === h.id ? null : h.id,
                        );
                        seekTo(h.timestampSeconds);
                        if (openHotspotId !== h.id) {
                          void recordEvent('hotspot_viewed', {
                            hotspotId: h.id,
                            videoId: h.videoId,
                            videoTimeSeconds: Math.floor(h.timestampSeconds),
                          });
                        }
                      }}
                      onAcknowledge={() => acknowledge(h.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>

      {totalRequired > 0 && (
        <div
          className={`fixed inset-x-0 bottom-0 border-t border-sand bg-cream/95 backdrop-blur transition-opacity duration-200 ${
            allDone ? 'opacity-100' : 'opacity-100'
          }`}
        >
          <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-sm text-charcoal-light">
              {allDone
                ? 'All required items acknowledged.'
                : `${totalRequired - acknowledgedRequired} required ${
                    totalRequired - acknowledgedRequired === 1 ? 'item' : 'items'
                  } remaining.`}
            </div>
            {allDone ? (
              <Link
                href={`/stay/${data.token}/complete`}
                className="btn-primary"
              >
                Complete check-in
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="btn-primary cursor-not-allowed opacity-50"
              >
                Complete check-in
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WalkthroughHotspot({
  hotspot,
  expanded,
  acknowledged,
  acking,
  onToggle,
  onAcknowledge,
}: {
  hotspot: StayWalkthroughData['hotspots'][number];
  expanded: boolean;
  acknowledged: boolean;
  acking: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
}) {
  const Icon = ICON_BY_NAME[hotspot.icon];
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-200 hover:bg-cream-dark/40"
      >
        <span
          className={`inline-flex h-9 w-9 flex-none items-center justify-center rounded-full ${
            acknowledged
              ? 'bg-green-100 text-green-700'
              : 'bg-cream-dark text-charcoal-light'
          }`}
        >
          {acknowledged ? <Check size={16} /> : <Icon size={16} />}
        </span>
        <span className="flex-1 truncate text-sm font-medium">
          {hotspot.title}
        </span>
        {hotspot.requiredAcknowledgment && !acknowledged && (
          <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-dark">
            Required
          </span>
        )}
        <span className="font-mono text-xs text-charcoal-light">
          {formatTime(hotspot.timestampSeconds)}
        </span>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-sand-light bg-cream/40 px-5 py-4 text-sm leading-relaxed">
          {hotspot.instructionsMd.trim() ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {hotspot.instructionsMd}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="text-xs italic text-charcoal-light">
              No instructions on this one.
            </p>
          )}
          {hotspot.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {hotspot.photos.map((p) => (
                <li
                  key={p.id}
                  className="relative aspect-square overflow-hidden rounded-md border border-sand-light"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
          {hotspot.requiredAcknowledgment && (
            <div className="flex justify-end">
              <button
                type="button"
                disabled={acknowledged || acking}
                onClick={onAcknowledge}
                className={
                  acknowledged
                    ? 'btn-secondary cursor-default opacity-60'
                    : 'btn-primary'
                }
              >
                {acknowledged
                  ? 'Acknowledged'
                  : acking
                    ? 'Saving…'
                    : 'Acknowledge'}
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
