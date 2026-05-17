'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FRAME_STEP_SECONDS,
  KEYBOARD_SHORTCUTS,
  isTypingTarget,
  QUICK_ADD_TEMPLATES,
} from './editor-config';
import {
  Plus,
  Trash2,
  ImagePlus,
  Play,
  Wifi,
  Trash,
  KeyRound,
  WashingMachine,
  TreePine,
  Car,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { HOTSPOT_ICONS, type HotspotIcon } from '@/lib/validators';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { VideoJsPlayer } from '@/components/video/types';
import {
  ChapterTrack,
  InVideoOverlay,
  computeOverlayState,
} from '@/components/video/HotspotOverlays';

// Video.js touches window on import; keep the wrapper client-only.
const VideoJSWithAnnotations = dynamic(
  () =>
    import('@/components/video/VideoJSWithAnnotations').then(
      (m) => m.VideoJSWithAnnotations,
    ),
  { ssr: false },
);

export type EditorVideo = {
  id: string;
  propertyId: string;
  title: string;
  durationSeconds: number;
  widthPx: number | null;
  heightPx: number | null;
  sourceUrl: string;
  posterUrl: string | null;
};

export type EditorHotspot = {
  id: string;
  timestampSeconds: number;
  title: string;
  icon: HotspotIcon;
  instructionsMd: string;
  requiredAcknowledgment: boolean;
  photos: { id: string; url: string }[];
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

function parseTime(input: string): number | null {
  const m = /^(\d+):(\d{1,2})$/.exec(input.trim());
  if (m) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    if (sec >= 60) return null;
    return min * 60 + sec;
  }
  const asNum = Number(input);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.floor(asNum);
  return null;
}

export function HotspotEditor({
  video,
  initialHotspots,
}: {
  video: EditorVideo;
  initialHotspots: EditorHotspot[];
}) {
  const router = useRouter();
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const [hotspots, setHotspots] = useState<EditorHotspot[]>(initialHotspots);
  const [currentTime, setCurrentTime] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const markSaved = useCallback(() => setLastSavedAt(Date.now()), []);

  const isVertical =
    video.widthPx && video.heightPx && video.heightPx > video.widthPx;

  const handlePlayerReady = useCallback((player: VideoJsPlayer) => {
    playerRef.current = player;
    const onTime = () => {
      const t = player.currentTime();
      if (typeof t === 'number') setCurrentTime(t);
    };
    player.on('timeupdate', onTime);
  }, []);

  const seekTo = useCallback(
    (t: number) => {
      const player = playerRef.current;
      if (!player) return;
      const clamped = Math.max(0, Math.min(t, video.durationSeconds));
      player.currentTime(clamped);
      setCurrentTime(clamped);
    },
    [video.durationSeconds],
  );

  // Seek + start playback. Used by the per-hotspot "Play from here" button so
  // the action has a visible effect — seeking alone just moves the playhead,
  // which the host won't notice if they were looking at the form.
  const playFrom = useCallback(
    (t: number) => {
      const player = playerRef.current;
      if (!player) return;
      const clamped = Math.max(0, Math.min(t, video.durationSeconds));
      player.currentTime(clamped);
      setCurrentTime(clamped);
      player.play()?.catch?.(() => {});
    },
    [video.durationSeconds],
  );

  const createHotspot = useCallback(
    async (template?: {
      title: string;
      icon: HotspotIcon;
      instructionsMd: string;
    }) => {
      if (creating) return;
      setCreating(true);
      const playerTime = playerRef.current?.currentTime();
      const t = Math.floor(typeof playerTime === 'number' ? playerTime : 0);
      const body = {
        videoId: video.id,
        timestampSeconds: t,
        title: template?.title ?? 'Untitled hotspot',
        icon: template?.icon ?? 'other',
        instructionsMd: template?.instructionsMd ?? '',
      };
      const res = await fetch('/api/hotspots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setCreating(false);
      if (!res.ok) return;
      const { hotspot } = (await res.json()) as {
        hotspot: Omit<EditorHotspot, 'photos'>;
      };
      const newRow: EditorHotspot = {
        ...hotspot,
        requiredAcknowledgment: hotspot.requiredAcknowledgment ?? false,
        photos: [],
      };
      setHotspots((list) =>
        [...list, newRow].sort((a, b) => a.timestampSeconds - b.timestampSeconds),
      );
      setOpenId(newRow.id);
      markSaved();
    },
    [creating, markSaved, video.id],
  );

  async function addHotspotAtCurrent() {
    await createHotspot();
  }

  // Global keyboard shortcuts. Skip when host is typing in an input so the
  // chord doesn't fight with form entry. Bindings mirror KEYBOARD_SHORTCUTS in
  // editor-config.ts — keep them in sync.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const player = playerRef.current;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (openId !== null) setOpenId(null);
        return;
      }
      if (e.key === ' ' && player) {
        e.preventDefault();
        if (player.paused()) player.play()?.catch?.(() => {});
        else player.pause();
        return;
      }
      const skip = e.shiftKey ? 1 : 5;
      const now = (player?.currentTime() as number | undefined) ?? 0;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekTo(now - skip);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekTo(now + skip);
        return;
      }
      // Frame-stepping. Real video editors use comma/period — power users
      // who know the convention will reach for this immediately.
      if (e.key === ',') {
        e.preventDefault();
        if (player && !player.paused()) player.pause();
        seekTo(now - FRAME_STEP_SECONDS);
        return;
      }
      if (e.key === '.') {
        e.preventDefault();
        if (player && !player.paused()) player.pause();
        seekTo(now + FRAME_STEP_SECONDS);
        return;
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        void createHotspot();
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (hotspots.length === 0) return;
        e.preventDefault();
        const idx = openId
          ? hotspots.findIndex((h) => h.id === openId)
          : -1;
        const next = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
        if (next < 0 || next >= hotspots.length) return;
        const target = hotspots[next];
        setOpenId(target.id);
        seekTo(target.timestampSeconds);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [createHotspot, hotspots, openId, seekTo, shortcutsOpen]);

  function updateHotspotLocal(id: string, patch: Partial<EditorHotspot>) {
    setHotspots((list) =>
      list
        .map((h) => (h.id === id ? { ...h, ...patch } : h))
        .sort((a, b) => a.timestampSeconds - b.timestampSeconds),
    );
  }

  function removeHotspotLocal(id: string) {
    setHotspots((list) => list.filter((h) => h.id !== id));
    if (openId === id) setOpenId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="overline">Hotspot editor</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            {video.title}
          </h1>
          <p className="text-sm text-charcoal-light">
            {video.durationSeconds > 0
              ? `${formatTime(video.durationSeconds)} · ${hotspots.length} ${hotspots.length === 1 ? 'hotspot' : 'hotspots'}`
              : `${hotspots.length} hotspots`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-charcoal-light">
          <SaveIndicator lastSavedAt={lastSavedAt} />
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="rounded-md border border-sand-light bg-white px-2 py-1 font-mono transition-colors duration-200 hover:border-gold/50"
          >
            ? shortcuts
          </button>
        </div>
      </div>

      <QuickAddRow
        onPick={(t) =>
          createHotspot({
            title: t.title,
            icon: t.icon,
            instructionsMd: t.instructionsMd,
          })
        }
        disabled={creating}
      />

      {hotspots.length > 0 && <BulkRequiredToggle
        hotspots={hotspots}
        onLocalUpdate={(nextRequired) => {
          setHotspots((list) =>
            list.map((h) => ({ ...h, requiredAcknowledgment: nextRequired })),
          );
          markSaved();
          router.refresh();
        }}
      />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Player + timeline */}
        <div className="space-y-3">
          <div
            className={`relative mx-auto overflow-hidden rounded-lg border border-sand-light bg-charcoal ${
              // Vertical clips: explicit dimensions. h-[55vh] w-[31vh] is
              // a clean 9:16 (31/55 ≈ 0.5636) at ~half the viewport height.
              // Tried aspect-ratio + max-h earlier — w-auto on a block
              // fills the parent, so max-h alone never pulled the width
              // down to match. Explicit vh values are deterministic.
              // .vertical-player-cap class in globals.css disables Video.js's
              // padding-top fluid trick so the player fills the box instead
              // of dictating its own height from the source aspect.
              isVertical
                ? 'vertical-player-cap h-[55vh] w-[31vh]'
                : 'w-full'
            }`}
          >
            <VideoJSWithAnnotations
              src={video.sourceUrl}
              poster={video.posterUrl}
              hotspots={hotspots.map((h) => ({
                id: h.id,
                timestampSeconds: h.timestampSeconds,
                title: h.title,
                icon: h.icon,
                instructionsMd: h.instructionsMd,
              }))}
              hostName="Host"
              mode="editor"
              onHotspotOpened={(id) => setOpenId(id)}
              onPlayerReady={handlePlayerReady}
            />
            <InVideoOverlay
              state={computeOverlayState(hotspots, currentTime)}
              onOpenActive={(id) => setOpenId(id)}
              onSeekToUpcoming={(t) => seekTo(t)}
            />
          </div>
          <ChapterTrack
            hotspots={hotspots}
            durationSeconds={video.durationSeconds}
            onPick={(h) => {
              seekTo(h.timestampSeconds);
              setOpenId(h.id);
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-charcoal-light">
              <span className="font-mono">
                {formatTime(currentTime)} / {formatTime(video.durationSeconds)}
              </span>
            </div>
            <button
              type="button"
              onClick={addHotspotAtCurrent}
              disabled={creating}
              className="btn-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Hotspot at {formatTime(currentTime)}
              </span>
            </button>
          </div>
        </div>

        {/* Hotspot list */}
        <div className="space-y-3">
          {hotspots.length === 0 ? (
            <div className="surface-card flex flex-col items-center px-6 py-10 text-center">
              <div className="overline">No hotspots yet</div>
              <p className="mt-2 max-w-xs text-sm text-charcoal-light">
                Play the video. When you reach an interesting moment, pause and
                add a hotspot for it.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Hotspot list">
              {hotspots.map((h) => (
                <HotspotRow
                  key={h.id}
                  hotspot={h}
                  expanded={openId === h.id}
                  onSelect={() => {
                    setOpenId(openId === h.id ? null : h.id);
                    seekTo(h.timestampSeconds);
                  }}
                  onSeek={(t) => seekTo(t)}
                  onPlayFrom={(t) => playFrom(t)}
                  videoDuration={video.durationSeconds}
                  onLocalPatch={(patch) => updateHotspotLocal(h.id, patch)}
                  onLocalRemove={() => removeHotspotLocal(h.id)}
                  onSaved={markSaved}
                  onRefresh={() => router.refresh()}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {shortcutsOpen && (
        <ShortcutsCheatSheet onClose={() => setShortcutsOpen(false)} />
      )}
    </div>
  );
}

function SaveIndicator({ lastSavedAt }: { lastSavedAt: number | null }) {
  // Tick the relative-time label every 5 seconds so "Saved 2s ago" updates.
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    if (!lastSavedAt) return;
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [lastSavedAt]);
  if (!lastSavedAt) {
    return <span className="text-charcoal-light/70">Saves automatically</span>;
  }
  const ago = Math.max(0, Math.floor((Date.now() - lastSavedAt) / 1000));
  const label =
    ago < 5 ? 'just now' : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
  return (
    <span className="inline-flex items-center gap-1.5 text-charcoal-light">
      <span className="h-1.5 w-1.5 rounded-full bg-gold" />
      Saved {label}
    </span>
  );
}

function InlineSaveStatus({
  status,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (status === 'idle') return null;
  const palette =
    status === 'error'
      ? 'border-red-300 bg-red-50 text-red-700'
      : status === 'saving'
        ? 'border-sand-light bg-cream-dark/60 text-charcoal-light'
        : 'border-gold/30 bg-gold/10 text-gold-dark';
  const dot =
    status === 'saved'
      ? 'bg-gold'
      : status === 'saving'
        ? 'bg-charcoal-light/50 animate-pulse'
        : 'bg-red-500';
  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Not saved';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${palette}`}
      role="status"
      aria-live="polite"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function BulkRequiredToggle({
  hotspots,
  onLocalUpdate,
}: {
  hotspots: EditorHotspot[];
  onLocalUpdate: (nextRequired: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const allRequired = hotspots.every((h) => h.requiredAcknowledgment);
  const noneRequired = hotspots.every((h) => !h.requiredAcknowledgment);
  const counted = hotspots.filter((h) => h.requiredAcknowledgment).length;

  async function setAll(value: boolean) {
    if (busy) return;
    setBusy(true);
    // Fire all PATCHes in parallel — Stays only really pays off once a host
    // marks a handful of hotspots; the round-trip count matches the count of
    // affected hotspots, which is fine for v1.
    const targets = hotspots.filter(
      (h) => h.requiredAcknowledgment !== value,
    );
    await Promise.all(
      targets.map((h) =>
        fetch(`/api/hotspots/${h.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requiredAcknowledgment: value }),
        }),
      ),
    );
    setBusy(false);
    onLocalUpdate(value);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-sand-light bg-white px-4 py-2 text-xs">
      <span className="font-medium text-charcoal">
        {counted} of {hotspots.length} required for Stays
      </span>
      <span className="text-charcoal-light">·</span>
      <button
        type="button"
        disabled={busy || allRequired}
        onClick={() => setAll(true)}
        className="font-medium text-gold-dark underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
      >
        Mark all required
      </button>
      <button
        type="button"
        disabled={busy || noneRequired}
        onClick={() => setAll(false)}
        className="font-medium text-charcoal-light underline-offset-2 hover:underline hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
      >
        Clear all
      </button>
    </div>
  );
}

function QuickAddRow({
  onPick,
  disabled,
}: {
  onPick: (template: (typeof QUICK_ADD_TEMPLATES)[number]) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-sand bg-cream-dark/30 px-3 py-2">
      <span className="overline mr-1 hidden sm:inline">Quick add</span>
      {QUICK_ADD_TEMPLATES.map((t) => (
        <button
          key={t.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(t)}
          className="inline-flex items-center gap-1 rounded-full border border-sand-light bg-white px-3 py-1 text-xs font-medium text-charcoal transition-colors duration-200 hover:border-gold hover:text-gold-dark disabled:opacity-50"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ShortcutsCheatSheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4"
      onClick={onClose}
    >
      <div
        className="surface-card max-w-md space-y-4 p-6 shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overline">Keyboard shortcuts</div>
        <h3 className="font-serif text-2xl font-medium tracking-tight">
          Move faster with the keyboard
        </h3>
        <dl className="space-y-2 text-sm">
          {KEYBOARD_SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4">
              <dt className="text-charcoal-light">{s.description}</dt>
              <dd className="rounded-md border border-sand-light bg-cream-dark/40 px-2 py-0.5 font-mono text-xs">
                {s.keys}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function HotspotRow({
  hotspot,
  expanded,
  onSelect,
  onSeek,
  onPlayFrom,
  videoDuration,
  onLocalPatch,
  onLocalRemove,
  onSaved,
  onRefresh,
}: {
  hotspot: EditorHotspot;
  expanded: boolean;
  onSelect: () => void;
  onSeek: (t: number) => void;
  onPlayFrom: (t: number) => void;
  videoDuration: number;
  onLocalPatch: (patch: Partial<EditorHotspot>) => void;
  onLocalRemove: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const Icon = ICON_BY_NAME[hotspot.icon];

  return (
    <li className="surface-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="flex flex-1 items-center gap-3 text-left transition-colors duration-200 hover:text-gold-dark"
        >
          <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-cream-dark text-charcoal-light">
            <Icon size={16} />
          </span>
          <span className="flex-1 truncate text-sm font-medium">
            {hotspot.title || 'Untitled'}
          </span>
          {hotspot.requiredAcknowledgment && (
            <span className="inline-flex items-center rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-dark">
              Required
            </span>
          )}
          <span className="font-mono text-xs text-charcoal-light">
            {formatTime(hotspot.timestampSeconds)}
          </span>
        </button>
      </div>
      {expanded && (
        <HotspotDetails
          hotspot={hotspot}
          onSeek={onSeek}
          onPlayFrom={onPlayFrom}
          videoDuration={videoDuration}
          onLocalPatch={onLocalPatch}
          onLocalRemove={onLocalRemove}
          onSaved={onSaved}
          onRefresh={onRefresh}
        />
      )}
    </li>
  );
}

function HotspotDetails({
  hotspot,
  onSeek,
  onPlayFrom,
  videoDuration,
  onLocalPatch,
  onLocalRemove,
  onSaved,
  onRefresh,
}: {
  hotspot: EditorHotspot;
  onSeek: (t: number) => void;
  onPlayFrom: (t: number) => void;
  videoDuration: number;
  onLocalPatch: (patch: Partial<EditorHotspot>) => void;
  onLocalRemove: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState(hotspot.title);
  const [icon, setIcon] = useState<HotspotIcon>(hotspot.icon);
  const [instructions, setInstructions] = useState(hotspot.instructionsMd);
  const [timeStr, setTimeStr] = useState(formatTime(hotspot.timestampSeconds));
  const [previewMode, setPreviewMode] = useState(hotspot.instructionsMd.length > 0);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Save-on-blur feedback shown inside this open hotspot panel — the global
  // "Saved Xs ago" header sits too far from the form fields, so a host
  // editing a field doesn't notice it. This mirrors the same state inline.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function patch(body: Record<string, unknown>) {
    setSaveStatus('saving');
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    const res = await fetch(`/api/hotspots/${hotspot.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setSaveStatus('error');
      return;
    }
    setSaveStatus('saved');
    savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
    onSaved();
    onRefresh();
  }

  async function onTitleBlur() {
    const t = title.trim();
    if (!t || t === hotspot.title) return;
    onLocalPatch({ title: t });
    await patch({ title: t });
  }

  async function onIconChange(next: HotspotIcon) {
    setIcon(next);
    onLocalPatch({ icon: next });
    await patch({ icon: next });
  }

  async function onInstructionsBlur() {
    if (instructions === hotspot.instructionsMd) return;
    onLocalPatch({ instructionsMd: instructions });
    await patch({ instructionsMd: instructions });
  }

  async function onTimeCommit() {
    const parsed = parseTime(timeStr);
    if (parsed === null || parsed > videoDuration) {
      setTimeStr(formatTime(hotspot.timestampSeconds));
      return;
    }
    if (parsed === hotspot.timestampSeconds) return;
    onLocalPatch({ timestampSeconds: parsed });
    onSeek(parsed);
    await patch({ timestampSeconds: parsed });
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/hotspots/${hotspot.id}`, { method: 'DELETE' });
    setDeleting(false);
    setConfirming(false);
    if (!res.ok) return;
    onLocalRemove();
    onSaved();
    onRefresh();
  }

  async function onUploadPhoto(file: File) {
    setPhotoError(null);
    if (uploadingPhoto) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Only JPEG, PNG, or WebP photos.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Max 5 MB per photo.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const createRes = await fetch(`/api/hotspots/${hotspot.id}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? 'Could not start upload');
      }
      const { photo, uploadUrl, uploadHeaders } = (await createRes.json()) as {
        photo: { id: string; storagePath: string };
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
      };
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      });
      if (!putRes.ok) throw new Error(`PUT failed (${putRes.status})`);
      onLocalPatch({
        photos: [
          ...hotspot.photos,
          { id: photo.id, url: `/api/media/${photo.storagePath}` },
        ],
      });
      onSaved();
      onRefresh();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : 'Photo upload failed.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function onDeletePhoto(photoId: string) {
    const res = await fetch(`/api/hotspot-photos/${photoId}`, { method: 'DELETE' });
    if (!res.ok) return;
    onLocalPatch({ photos: hotspot.photos.filter((p) => p.id !== photoId) });
    onSaved();
    onRefresh();
  }

  // Drag-drop image upload: dropping a file anywhere on this form attaches it
  // to the hotspot. Per UX brief — no "click to browse" friction on the second
  // photo and beyond.
  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files?.length) return;
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void onUploadPhoto(f);
  }

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative space-y-4 border-t border-sand-light bg-cream/40 px-4 py-4 ${
        dragOver ? 'ring-2 ring-gold/40 ring-offset-2 ring-offset-cream' : ''
      }`}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-gold/10 text-sm font-medium text-gold-dark">
          Drop image to attach
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-charcoal">Time</label>
        <input
          type="text"
          value={timeStr}
          onChange={(e) => setTimeStr(e.target.value)}
          onBlur={onTimeCommit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur();
            }
          }}
          className="w-20 rounded-md border border-sand-light bg-white px-2 py-1 font-mono text-xs"
          placeholder="0:00"
        />
        <button
          type="button"
          onClick={() => onPlayFrom(hotspot.timestampSeconds)}
          className="inline-flex items-center gap-1 rounded-md border border-sand-light bg-white px-2 py-1 text-xs font-medium text-charcoal-light transition-colors duration-200 hover:border-gold/50 hover:text-gold-dark"
          title={`Play video from ${formatTime(hotspot.timestampSeconds)}`}
        >
          <Play size={12} />
          Play from here
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <InlineSaveStatus status={saveStatus} />
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-charcoal-light transition-colors duration-200 hover:bg-red-50 hover:text-red-700"
            aria-label="Delete hotspot"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <p className="text-[11px] text-charcoal-light">
        Changes save automatically when you click out of a field.
      </p>

      <div className="space-y-1">
        <label className="text-xs font-medium text-charcoal">Title</label>
        <input
          type="text"
          value={title}
          maxLength={40}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={onTitleBlur}
          className="field-input"
        />
      </div>

      <label className="flex items-start gap-2 rounded-md border border-sand-light bg-white p-3 text-xs text-charcoal-light">
        <input
          type="checkbox"
          checked={hotspot.requiredAcknowledgment}
          onChange={async (e) => {
            const next = e.target.checked;
            onLocalPatch({ requiredAcknowledgment: next });
            await patch({ requiredAcknowledgment: next });
          }}
          className="mt-0.5 h-4 w-4 accent-gold"
        />
        <span>
          <span className="font-medium text-charcoal">
            Required acknowledgment
          </span>
          <br />
          On a Stay invite, the guest must explicitly tap Acknowledge on this
          hotspot before they can complete check-in.
        </span>
      </label>

      <div className="space-y-1">
        <label className="text-xs font-medium text-charcoal">Icon</label>
        <div className="flex flex-wrap gap-2">
          {HOTSPOT_ICONS.map((name) => {
            const I = ICON_BY_NAME[name];
            const active = icon === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onIconChange(name)}
                aria-label={name}
                className={
                  active
                    ? 'inline-flex h-9 w-9 items-center justify-center rounded-md border border-gold bg-gold/10 text-gold-dark'
                    : 'inline-flex h-9 w-9 items-center justify-center rounded-md border border-sand-light bg-white text-charcoal-light transition-colors duration-200 hover:border-gold/50 hover:text-charcoal'
                }
              >
                <I size={16} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-medium text-charcoal">Instructions</label>
          <div className="flex gap-0.5 rounded-md border border-sand-light bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setPreviewMode(false)}
              className={
                previewMode
                  ? 'rounded px-2 py-0.5 text-charcoal-light'
                  : 'rounded bg-cream-dark px-2 py-0.5 text-charcoal'
              }
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode(true)}
              className={
                previewMode
                  ? 'rounded bg-cream-dark px-2 py-0.5 text-charcoal'
                  : 'rounded px-2 py-0.5 text-charcoal-light'
              }
            >
              Preview
            </button>
          </div>
        </div>
        {previewMode ? (
          <div className="markdown-body min-h-[6rem] rounded-md border border-sand-light bg-white p-3 text-sm leading-relaxed">
            {instructions.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {instructions}
              </ReactMarkdown>
            ) : (
              <p className="text-xs italic text-charcoal-light">
                No instructions yet. Guests will see an empty card.
              </p>
            )}
          </div>
        ) : (
          <textarea
            rows={5}
            maxLength={2000}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={onInstructionsBlur}
            placeholder="Markdown supported. Example: **Wifi**: Network = HomeNet, Password = ..."
            className="field-input font-mono text-sm"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-xs font-medium text-charcoal">
            Photos ({hotspot.photos.length}/3)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-sand-light bg-white px-2 py-1 text-xs font-medium text-charcoal-light transition-colors duration-200 hover:border-gold/50 hover:text-charcoal">
            <ImagePlus size={14} />
            Add photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadingPhoto || hotspot.photos.length >= 3}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadPhoto(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {photoError && <p className="text-xs text-red-700">{photoError}</p>}
        {hotspot.photos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {hotspot.photos.map((p) => (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-md border border-sand-light">
                {/* user-uploaded image — plain <img> per StorageProvider contract */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onDeletePhoto(p.id)}
                  className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-red-700 shadow-sm transition-colors duration-200 hover:bg-red-50"
                  aria-label="Delete photo"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sand-light pt-3">
        <p className="text-[11px] text-charcoal-light">
          Fields autosave when you click out. Use Save to commit everything at
          once.
        </p>
        <button
          type="button"
          onClick={async () => {
            // Commit every field the host might have edited, in one PATCH.
            // The local-state values are the source of truth for "what the
            // user typed but might not have blurred yet".
            const body: Record<string, unknown> = {};
            const cleanTitle = title.trim();
            if (cleanTitle && cleanTitle !== hotspot.title)
              body.title = cleanTitle;
            if (icon !== hotspot.icon) body.icon = icon;
            if (instructions !== hotspot.instructionsMd)
              body.instructionsMd = instructions;
            const parsedTime = parseTime(timeStr);
            if (
              parsedTime !== null &&
              parsedTime <= videoDuration &&
              parsedTime !== hotspot.timestampSeconds
            ) {
              body.timestampSeconds = parsedTime;
              onLocalPatch({ timestampSeconds: parsedTime });
              onSeek(parsedTime);
            }
            // Patch even if body is empty so the host gets a visible "Saved"
            // confirmation — otherwise clicking Save twice in a row would
            // show nothing the second time, which reads as broken.
            if (Object.keys(body).length > 0) {
              if (body.title) onLocalPatch({ title: body.title as string });
              if (body.icon) onLocalPatch({ icon: body.icon as HotspotIcon });
              if (body.instructionsMd !== undefined)
                onLocalPatch({ instructionsMd: body.instructionsMd as string });
              await patch(body);
            } else {
              // Nothing actually changed — just flash the confirmation pill.
              setSaveStatus('saved');
              if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
              savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2500);
            }
          }}
          disabled={saveStatus === 'saving'}
          className="btn-primary"
        >
          {saveStatus === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          title="Delete this hotspot?"
          description={
            <>
              <span className="font-medium text-charcoal">
                {hotspot.title || 'Untitled'}
              </span>{' '}
              and its photos will be removed.
            </>
          }
          confirmLabel="Delete hotspot"
          destructive
          pending={deleting}
          onCancel={() => setConfirming(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}
