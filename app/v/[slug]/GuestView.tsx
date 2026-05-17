'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
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
  Share2,
  X,
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

export type GuestData = {
  property: {
    name: string;
    updatedAt: string;
    hostFirstName: string | null;
  };
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
    photos: { id: string; url: string }[];
  }[];
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

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return '1 month ago';
  return `${months} months ago`;
}

export function GuestView({ data }: { data: GuestData }) {
  // Default to the first video. The guest can switch via the TOC.
  const firstVideoId = data.videos[0]?.id ?? null;
  const [activeVideoId, setActiveVideoId] = useState<string | null>(firstVideoId);
  const [openHotspotId, setOpenHotspotId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{
    id: string;
    title: string;
    icon: HotspotIcon;
  } | null>(null);
  const lastTimeRef = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredRef = useRef<Record<string, number>>({});
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

  // Group videos by section for the TOC. Unsorted goes at the end.
  const groups = useMemo(() => {
    const out: { id: string | null; title: string; videos: GuestData['videos'] }[] = [];
    for (const s of data.sections) {
      const vids = data.videos.filter((v) => v.sectionId === s.id);
      if (vids.length === 0) continue;
      out.push({ id: s.id, title: s.title, videos: vids });
    }
    const unsorted = data.videos.filter((v) => v.sectionId === null);
    if (unsorted.length > 0) {
      out.push({ id: null, title: 'More', videos: unsorted });
    }
    return out;
  }, [data.sections, data.videos]);

  // Reset crossing tracker when the active video changes — otherwise jumping
  // to a new video would replay all of its earlier toasts.
  useEffect(() => {
    lastTimeRef.current = 0;
    lastFiredRef.current = {};
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, [activeVideoId]);

  // Listen to the player's time updates and surface a toast when playback
  // crosses a hotspot timestamp (forward, monotonic). Auto-dismiss in 4s per
  // the UX brief; never auto-open the detail panel.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    function onTime() {
      const p = playerRef.current;
      if (!p) return;
      const t = p.currentTime();
      const now = typeof t === 'number' ? t : 0;
      const prev = lastTimeRef.current;
      lastTimeRef.current = now;
      // Only fire on monotonic forward progress — skip seeks backward.
      if (now < prev) return;
      for (const h of activeHotspots) {
        if (prev < h.timestampSeconds && now >= h.timestampSeconds) {
          // Re-arm the same hotspot only after a substantial gap (10s) so a
          // tiny seek-and-replay doesn't double-fire.
          const lastFired = lastFiredRef.current[h.id];
          if (lastFired && now - lastFired < 10) continue;
          lastFiredRef.current[h.id] = now;
          setToast({ id: h.id, title: h.title, icon: h.icon });
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastTimerRef.current = setTimeout(() => setToast(null), 4000);
          break; // one toast at a time
        }
      }
    }
    player.on('timeupdate', onTime);
    return () => {
      player.off('timeupdate', onTime);
    };
  }, [activeHotspots, activeVideoId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function seekTo(t: number) {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime(Math.max(0, t));
    player.play()?.catch?.(() => {});
  }

  async function onShare() {
    const url = window.location.href;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: data.property.name,
          text: `Walkthrough for ${data.property.name}`,
          url,
        });
        return;
      } catch {
        // user dismissed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }

  const isVertical = activeVideo
    ? activeVideo.widthPx &&
      activeVideo.heightPx &&
      activeVideo.heightPx > activeVideo.widthPx
    : false;

  return (
    <div className="min-h-screen bg-cream pb-16">
      <header className="border-b border-sand bg-cream/95 backdrop-blur supports-[backdrop-filter]:bg-cream/80">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              {data.property.name}
            </h1>
            <p className="mt-0.5 text-xs text-charcoal-light">
              {data.property.hostFirstName ? (
                <>hosted by {data.property.hostFirstName} · </>
              ) : null}
              updated {formatRelative(data.property.updatedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="btn-secondary inline-flex items-center gap-2"
          >
            <Share2 size={14} />
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>
      </header>

      <main className="container py-6 lg:py-10">
        {data.videos.length === 0 ? (
          <div className="surface-card mx-auto max-w-md p-8 text-center">
            <div className="overline">No videos yet</div>
            <p className="mt-2 text-sm text-charcoal-light">
              Your host hasn&rsquo;t posted any walkthrough videos yet. Check back
              after check-in.
            </p>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* Video player + description */}
            <div className="space-y-4">
              {activeVideo && (
                <>
                  <div
                    className={`relative mx-auto overflow-hidden rounded-lg border border-sand-light bg-charcoal ${
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
                      hostName={data.property.hostFirstName ?? 'Host'}
                      mode="guest"
                      onHotspotOpened={(id) => setOpenHotspotId(id)}
                      onPlayerReady={(player) => {
                        playerRef.current = player;
                      }}
                    />
                    {toast && (
                      <button
                        type="button"
                        onClick={() => {
                          setOpenHotspotId(toast.id);
                          setToast(null);
                        }}
                        className="absolute right-3 top-3 inline-flex max-w-[16rem] animate-fade-in items-center gap-2 rounded-full border border-white/30 bg-charcoal/85 px-3 py-1.5 text-xs text-white shadow-sm backdrop-blur transition-opacity duration-200 hover:bg-charcoal"
                        aria-label={`Open ${toast.title}`}
                      >
                        {(() => {
                          const Icon = ICON_BY_NAME[toast.icon];
                          return <Icon size={14} />;
                        })()}
                        <span className="truncate font-medium">
                          {toast.title}
                        </span>
                        <span className="text-white/70">tap to view</span>
                      </button>
                    )}
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

              {groups.length > 1 || (groups[0]?.videos.length ?? 0) > 1 ? (
                <nav className="space-y-4">
                  <div className="overline">All videos</div>
                  {groups.map((g) => (
                    <div key={g.id ?? 'unsorted'} className="space-y-2">
                      <div className="text-sm font-medium text-charcoal">
                        {g.title}
                      </div>
                      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {g.videos.map((v) => {
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
                    </div>
                  ))}
                </nav>
              ) : null}
            </div>

            {/* Hotspot list is the headline — per UX guidance */}
            <aside>
              <div className="surface-card overflow-hidden">
                <div className="border-b border-sand-light px-5 py-3">
                  <div className="overline">In this video</div>
                  <h3 className="mt-1 font-serif text-xl font-medium tracking-tight">
                    {activeHotspots.length}{' '}
                    {activeHotspots.length === 1 ? 'tip' : 'tips'}
                  </h3>
                </div>
                {activeHotspots.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-charcoal-light">
                    Just press play. The host hasn&rsquo;t pinned any details on
                    this one.
                  </p>
                ) : (
                  <ul className="divide-y divide-sand-light">
                    {activeHotspots.map((h) => (
                      <HotspotListItem
                        key={h.id}
                        hotspot={h}
                        expanded={openHotspotId === h.id}
                        onToggle={() => {
                          setOpenHotspotId(
                            openHotspotId === h.id ? null : h.id,
                          );
                          seekTo(h.timestampSeconds);
                        }}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function HotspotListItem({
  hotspot,
  expanded,
  onToggle,
}: {
  hotspot: GuestData['hotspots'][number];
  expanded: boolean;
  onToggle: () => void;
}) {
  const Icon = ICON_BY_NAME[hotspot.icon];
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-200 hover:bg-cream-dark/40"
        aria-expanded={expanded}
      >
        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-cream-dark text-charcoal-light">
          <Icon size={16} />
        </span>
        <span className="flex-1 truncate text-sm font-medium">
          {hotspot.title}
        </span>
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
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onToggle}
              aria-label="Close"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-charcoal-light transition-colors duration-200 hover:bg-cream-dark hover:text-charcoal"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
