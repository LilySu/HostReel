'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Pencil,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  createSectionSchema,
  updateSectionSchema,
  VIDEO_MIME_TYPES,
  MAX_VIDEO_FILE_BYTES,
  type CreateSectionInput,
  type UpdateSectionInput,
} from '@/lib/validators';
import type { Section } from '@/lib/db/schema';

export type VideoListItem = {
  id: string;
  sectionId: string | null;
  title: string;
  description: string | null;
  orderIndex: number;
  durationSeconds: number;
  widthPx: number | null;
  heightPx: number | null;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
  posterUrl: string | null;
};

export function SectionsTree({
  propertyId,
  initialSections,
  initialVideos,
}: {
  propertyId: string;
  initialSections: Section[];
  initialVideos: VideoListItem[];
}) {
  const unsorted = initialVideos.filter((v) => v.sectionId === null);

  return (
    <div className="space-y-4">
      {initialSections.length === 0 && unsorted.length === 0 ? (
        <div className="surface-card flex flex-col items-center px-6 py-14 text-center">
          <div className="overline">Empty walkthrough</div>
          <h3 className="mt-3 font-serif text-2xl font-medium">
            Start with a section
          </h3>
          <p className="mt-2 max-w-md text-sm text-charcoal-light">
            Sections group your videos by topic. Most hosts start with a Check-in
            section and add Weekly chores once that&rsquo;s covered.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {initialSections.map((section, index) => (
            <SectionCard
              key={section.id}
              propertyId={propertyId}
              section={section}
              allSections={initialSections}
              videos={initialVideos.filter((v) => v.sectionId === section.id)}
              canMoveUp={index > 0}
              canMoveDown={index < initialSections.length - 1}
              prevSection={index > 0 ? initialSections[index - 1] : null}
              nextSection={
                index < initialSections.length - 1
                  ? initialSections[index + 1]
                  : null
              }
            />
          ))}
          {unsorted.length > 0 && (
            <UnsortedBucket
              propertyId={propertyId}
              allSections={initialSections}
              videos={unsorted}
            />
          )}
        </ul>
      )}
      <NewSectionForm propertyId={propertyId} />
    </div>
  );
}

function SectionCard({
  propertyId,
  section,
  allSections,
  videos,
  canMoveUp,
  canMoveDown,
  prevSection,
  nextSection,
}: {
  propertyId: string;
  section: Section;
  allSections: Section[];
  videos: VideoListItem[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  prevSection: Section | null;
  nextSection: Section | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reordering, setReordering] = useState(false);

  async function swapWith(neighbor: Section) {
    if (reordering) return;
    setReordering(true);
    // Fire both PATCHes in parallel — Drizzle handles them as independent
    // statements. Worst-case partial failure on a network blip leaves the
    // list briefly misordered until the next refresh; acceptable for v1.
    const [a, b] = await Promise.all([
      fetch(`/api/sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIndex: neighbor.orderIndex }),
      }),
      fetch(`/api/sections/${neighbor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIndex: section.orderIndex }),
      }),
    ]);
    setReordering(false);
    if (a.ok && b.ok) router.refresh();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<UpdateSectionInput>({
    resolver: zodResolver(updateSectionSchema),
    defaultValues: { title: section.title },
  });

  async function onRename(values: UpdateSectionInput) {
    const res = await fetch(`/api/sections/${section.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title }),
    });
    if (!res.ok) {
      setError('title', { message: 'Could not rename. Try again.' });
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/sections/${section.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setDeleting(false);
      setConfirmingDelete(false);
      return;
    }
    router.refresh();
  }

  return (
    <li className="surface-card overflow-hidden">
      {editing ? (
        <form
          onSubmit={handleSubmit(onRename)}
          className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start"
        >
          <div className="flex-1 space-y-1.5">
            <input
              type="text"
              autoFocus
              maxLength={60}
              className="field-input"
              {...register('title')}
            />
            {errors.title?.message && (
              <p className="text-xs text-red-700">{errors.title.message}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                reset({ title: section.title });
                setEditing(false);
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between border-b border-sand-light px-6 py-4">
          <h3 className="font-serif text-xl font-medium tracking-tight">
            {section.title}
          </h3>
          <div className="flex items-center gap-1">
            {canMoveUp && prevSection && (
              <IconButton
                label="Move section up"
                onClick={() => swapWith(prevSection)}
                icon={<ChevronUp size={16} />}
                disabled={reordering}
              />
            )}
            {canMoveDown && nextSection && (
              <IconButton
                label="Move section down"
                onClick={() => swapWith(nextSection)}
                icon={<ChevronDown size={16} />}
                disabled={reordering}
              />
            )}
            <IconButton
              label="Rename section"
              onClick={() => setEditing(true)}
              icon={<Pencil size={16} />}
            />
            <IconButton
              label="Delete section"
              onClick={() => setConfirmingDelete(true)}
              icon={<Trash2 size={16} />}
              variant="danger"
            />
          </div>
        </div>
      )}

      <div className="space-y-5 bg-cream/40 px-6 py-6">
        {videos.length === 0 ? (
          <p className="text-sm text-charcoal-light">
            No videos in this section yet.
          </p>
        ) : (
          <VideoGrid
            propertyId={propertyId}
            allSections={allSections}
            videos={videos}
          />
        )}
        <AddVideoForm propertyId={propertyId} sectionId={section.id} />
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete this section?"
          description={
            <>
              <span className="font-medium text-charcoal">{section.title}</span>{' '}
              will be removed. Any videos in this section will move to Unsorted —
              they won&rsquo;t be deleted.
            </>
          }
          confirmLabel="Delete section"
          destructive
          pending={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </li>
  );
}

function UnsortedBucket({
  propertyId,
  allSections,
  videos,
}: {
  propertyId: string;
  allSections: Section[];
  videos: VideoListItem[];
}) {
  return (
    <li className="surface-card overflow-hidden border-dashed">
      <div className="flex items-center justify-between border-b border-sand-light px-6 py-4">
        <div>
          <div className="overline">Unsorted</div>
          <h3 className="mt-1 font-serif text-xl font-medium tracking-tight">
            {videos.length} {videos.length === 1 ? 'video' : 'videos'} without a section
          </h3>
        </div>
      </div>
      <div className="bg-cream/40 px-6 py-6">
        <VideoGrid
          propertyId={propertyId}
          allSections={allSections}
          videos={videos}
        />
      </div>
    </li>
  );
}

function VideoGrid({
  propertyId,
  allSections,
  videos,
}: {
  propertyId: string;
  allSections: Section[];
  videos: VideoListItem[];
}) {
  // The list is sorted by orderIndex coming from the server. We need a stable
  // "index inside this bucket" so the up/down buttons know which neighbor to
  // swap with. orderIndex itself may be non-contiguous after section moves,
  // so derive ordinals from array position here.
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v, index) => (
        <VideoCard
          key={v.id}
          propertyId={propertyId}
          allSections={allSections}
          video={v}
          neighborBefore={index > 0 ? videos[index - 1] : null}
          neighborAfter={
            index < videos.length - 1 ? videos[index + 1] : null
          }
        />
      ))}
    </div>
  );
}

const videoDetailsSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});
type VideoDetailsInput = z.infer<typeof videoDetailsSchema>;

function VideoCard({
  propertyId,
  allSections,
  video,
  neighborBefore,
  neighborAfter,
}: {
  propertyId: string;
  allSections: Section[];
  video: VideoListItem;
  neighborBefore: VideoListItem | null;
  neighborAfter: VideoListItem | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [reordering, setReordering] = useState(false);

  async function reorder(direction: 'up' | 'down') {
    const neighbor = direction === 'up' ? neighborBefore : neighborAfter;
    if (!neighbor || reordering) return;
    setReordering(true);
    // Swap orderIndex with the adjacent video in the same bucket.
    // PATCHes fire in parallel; partial failure briefly desyncs the list
    // until the next refresh — acceptable for v1.
    await Promise.all([
      fetch(`/api/videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIndex: neighbor.orderIndex }),
      }),
      fetch(`/api/videos/${neighbor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIndex: video.orderIndex }),
      }),
    ]);
    setReordering(false);
    router.refresh();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<VideoDetailsInput>({
    resolver: zodResolver(videoDetailsSchema),
    defaultValues: {
      title: video.title,
      description: video.description ?? '',
    },
  });

  const isVertical =
    video.widthPx && video.heightPx && video.heightPx > video.widthPx;
  const aspectClass = isVertical ? 'aspect-[9/16]' : 'aspect-video';

  async function onSaveDetails(values: VideoDetailsInput) {
    const description = values.description?.trim() ? values.description.trim() : null;
    const res = await fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title, description }),
    });
    if (!res.ok) {
      setError('title', { message: 'Could not save. Try again.' });
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/videos/${video.id}`, { method: 'DELETE' });
    if (!res.ok) {
      setDeleting(false);
      setConfirmingDelete(false);
      return;
    }
    router.refresh();
  }

  async function onMove(target: string) {
    if (moving) return;
    // "" represents Unsorted (sectionId = null)
    const nextSectionId = target === '' ? null : target;
    if (nextSectionId === (video.sectionId ?? null)) return;
    setMoving(true);
    const res = await fetch(`/api/videos/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId: nextSectionId }),
    });
    setMoving(false);
    if (!res.ok) return;
    router.refresh();
  }

  const thumb = (
    <div className={`relative ${aspectClass} w-full bg-sand-light`}>
      {video.posterUrl && (
        // User-uploaded media — plain <img> keeps the StorageProvider contract.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {video.status === 'uploading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-cream/80 text-charcoal-light">
          {/* Branded loading state — gif intentionally not optimized by
              next/image since it would lose its animation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/loading-video.gif"
            alt=""
            className="h-10 w-10"
          />
          <span className="text-[10px] uppercase tracking-wider">
            Processing
          </span>
        </div>
      )}
      {video.status === 'failed' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/90 text-red-700">
          <AlertCircle size={20} />
          <span className="mt-1 text-xs font-medium">Upload failed</span>
        </div>
      )}
      {video.status === 'ready' && (
        <div className="absolute bottom-2 right-2 rounded-md bg-charcoal/70 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.durationSeconds)}
        </div>
      )}
    </div>
  );

  return (
    // File-folder treatment: a wide gold tab at the bottom of the card acts
    // as the note label, showing either the description or a "Click to add
    // a note" CTA. Card itself bordered in solid gold with a manila-tinted
    // interior.
    <article className="overflow-hidden rounded-lg border-2 border-gold bg-cream-dark/30 shadow-sm transition-shadow duration-200 hover:shadow-md">
      {video.status === 'ready' ? (
        <Link
          href={`/properties/${propertyId}/videos/${video.id}`}
          className="group block transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
          aria-label={`Play ${video.title}`}
        >
          {thumb}
        </Link>
      ) : (
        thumb
      )}

      <div className="space-y-3 p-4">
        {editing ? (
          <form
            onSubmit={handleSubmit(onSaveDetails)}
            className="space-y-3"
          >
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">Title</label>
              <input
                type="text"
                autoFocus
                maxLength={60}
                className="field-input"
                {...register('title')}
              />
              {errors.title?.message && (
                <p className="text-xs text-red-700">{errors.title.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-charcoal">
                Description <span className="text-charcoal-light">(optional)</span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                placeholder="What guests should know about this video."
                className="field-input resize-y"
                {...register('description')}
              />
              {errors.description?.message && (
                <p className="text-xs text-red-700">{errors.description.message}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  reset({
                    title: video.title,
                    description: video.description ?? '',
                  });
                  setEditing(false);
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <h4 className="font-serif text-base font-medium tracking-tight">
            {video.title}
          </h4>
        )}

        {!editing && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`move-${video.id}`}>
              Move to section
            </label>
            <select
              id={`move-${video.id}`}
              value={video.sectionId ?? ''}
              onChange={(e) => onMove(e.target.value)}
              disabled={moving}
              className="min-w-0 flex-1 rounded-md border border-sand-light bg-white px-2 py-1.5 text-xs text-charcoal focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/30"
            >
              {allSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
              <option value="">Unsorted</option>
            </select>
            {neighborBefore && (
              <IconButton
                label="Move video up"
                onClick={() => reorder('up')}
                icon={<ChevronUp size={14} />}
                disabled={reordering}
              />
            )}
            {neighborAfter && (
              <IconButton
                label="Move video down"
                onClick={() => reorder('down')}
                icon={<ChevronDown size={14} />}
                disabled={reordering}
              />
            )}
            <IconButton
              label="Edit details"
              onClick={() => setEditing(true)}
              icon={<Pencil size={14} />}
            />
            <IconButton
              label="Delete video"
              onClick={() => setConfirmingDelete(true)}
              icon={<Trash2 size={14} />}
              variant="danger"
            />
          </div>
        )}
      </div>

      {!editing && (
        // Wide bottom "tab" — solid gold label that runs the full card
        // width with white text + a pen icon for the edit affordance.
        // Shows the description when one is set, otherwise the
        // "Click to add a note" CTA. Clicking either flips the card into
        // edit mode so the host can fill in the description inline.
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex w-full items-center gap-2 bg-gold px-4 py-2.5 text-left text-xs text-white transition-colors duration-200 hover:bg-gold-dark focus-visible:outline-none focus-visible:bg-gold-dark"
        >
          <Pencil size={13} className="flex-none" />
          {video.description ? (
            <span className="line-clamp-2 flex-1">{video.description}</span>
          ) : (
            <span className="flex-1 italic">Click to add a note</span>
          )}
        </button>
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Delete this video?"
          description={
            <>
              <span className="font-medium text-charcoal">{video.title}</span>{' '}
              will be removed, along with its hotspots and photos. This
              can&rsquo;t be undone.
            </>
          }
          confirmLabel="Delete video"
          destructive
          pending={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </article>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const addVideoSchema = z.object({
  title: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().or(z.literal('')),
});
type AddVideoInput = z.infer<typeof addVideoSchema>;

type BillingLimitInfo = { plan: string; current: number; limit: number };

function AddVideoForm({
  propertyId,
  sectionId,
}: {
  propertyId: string;
  sectionId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  // Phase tracks which step of the three-step upload flow is in flight so the
  // UI can show a distinct message for each. `progress` is the 0–1 PUT
  // progress fraction during the 'uploading' phase only.
  const [phase, setPhase] = useState<
    'creating' | 'uploading' | 'processing' | null
  >(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [billingLimit, setBillingLimit] = useState<BillingLimitInfo | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AddVideoInput>({
    resolver: zodResolver(addVideoSchema),
    defaultValues: { title: '', description: '' },
  });

  async function onSubmit(values: AddVideoInput) {
    setError(null);
    if (!file) {
      setError('Pick a video file first.');
      return;
    }
    if (file.size > MAX_VIDEO_FILE_BYTES) {
      setError('File too large. Max 500 MB.');
      return;
    }
    if (!(VIDEO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setError('Only .mp4 and .mov are supported.');
      return;
    }

    const description = values.description?.trim() ? values.description.trim() : null;

    // Step 1: create the row + get a presigned upload URL.
    setPhase('creating');
    const createRes = await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        sectionId,
        title: values.title,
        description,
        contentType: file.type,
        sizeBytes: file.size,
      }),
    });
    if (createRes.status === 402) {
      setPhase(null);
      try {
        const body = (await createRes.json()) as {
          code?: string;
          plan: string;
          current: number;
          limit: number;
        };
        if (body.code === 'BILLING_LIMIT') {
          setBillingLimit({
            plan: body.plan,
            current: body.current,
            limit: body.limit,
          });
          return;
        }
      } catch {}
      setError('Billing limit reached.');
      return;
    }
    if (!createRes.ok) {
      setPhase(null);
      setError('Could not create video record.');
      return;
    }
    const { video, uploadUrl, uploadHeaders } = (await createRes.json()) as {
      video: { id: string };
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
    };

    // Step 2: PUT the bytes directly to storage (R2 or local upload route).
    setPhase('uploading');
    setProgress(0);
    try {
      await putWithProgress(uploadUrl, uploadHeaders, file, setProgress);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setPhase(null);
      return;
    }

    // Step 3: finalize — server-side probe + poster + status=ready.
    // For longer videos this can take 20–60s (ffmpeg has to read the whole
    // file to extract a poster), so the UI needs an indeterminate state
    // here — otherwise it looks frozen at "100%".
    setPhase('processing');
    const finalizeRes = await fetch(`/api/videos/${video.id}/finalize`, {
      method: 'POST',
    });
    if (!finalizeRes.ok) {
      let msg = 'Could not process video.';
      try {
        const body = (await finalizeRes.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {}
      setError(msg);
      setPhase(null);
      return;
    }

    reset({ title: '', description: '' });
    setFile(null);
    setPhase(null);
    setProgress(0);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-sand bg-transparent px-6 py-4 text-sm font-medium text-charcoal-light transition-colors duration-200 hover:border-gold hover:bg-cream-dark/30 hover:text-charcoal"
      >
        <Upload size={16} />
        Add a video
      </button>
    );
  }

  const submitting = isSubmitting || phase !== null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-sand-light bg-white p-5"
    >
      <div className="space-y-2">
        <label className="text-sm font-medium text-charcoal">Title</label>
        <input
          type="text"
          autoFocus
          maxLength={60}
          placeholder="e.g. How to start the dishwasher"
          className="field-input"
          {...register('title')}
        />
        {errors.title?.message && (
          <p className="text-xs text-red-700">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-charcoal">
          Description <span className="text-charcoal-light">(optional)</span>
        </label>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="A short note guests will see under the video — links, passwords, reminders."
          className="field-input resize-y"
          {...register('description')}
        />
        {errors.description?.message && (
          <p className="text-xs text-red-700">{errors.description.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-charcoal">Video file</label>
        <input
          type="file"
          accept="video/mp4,video/quicktime,.mp4,.mov"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-charcoal-light file:mr-4 file:rounded-md file:border file:border-sand file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-charcoal hover:file:bg-cream-dark"
        />
        <p className="text-xs text-charcoal-light">
          .mp4 or .mov, up to 5 minutes, 500 MB max. Both vertical and horizontal
          footage are supported.
        </p>
      </div>

      {phase !== null && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-xs font-medium text-charcoal-light">
            <span>
              {phase === 'creating' && 'Getting ready…'}
              {phase === 'uploading' && 'Uploading…'}
              {phase === 'processing' &&
                'Almost there — generating the cover frame'}
            </span>
            {phase === 'uploading' && (
              <span className="font-mono">{Math.round(progress * 100)}%</span>
            )}
          </div>
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-sand-light">
            {phase === 'uploading' ? (
              <div
                className="h-full bg-gold transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            ) : (
              // Indeterminate slider for the "creating" and "processing" phases.
              // ffmpeg has to read the entire video to grab a poster, so this
              // can take 20–60s on a 5-minute file — long enough that a static
              // 100% bar reads as "stuck".
              <div className="absolute inset-y-0 h-full w-1/3 animate-indeterminate-bar rounded-full bg-gold" />
            )}
          </div>
          {phase === 'processing' && (
            <p className="text-[11px] leading-relaxed text-charcoal-light/80">
              Hang tight — longer videos take a few extra seconds. The page
              will refresh as soon as it&rsquo;s ready.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Uploading…' : 'Upload video'}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => {
            reset({ title: '', description: '' });
            setFile(null);
            setPhase(null);
            setProgress(0);
            setError(null);
            setOpen(false);
          }}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>

      {billingLimit && (
        <BillingLimitDialog
          info={billingLimit}
          onClose={() => setBillingLimit(null)}
        />
      )}
    </form>
  );
}

function BillingLimitDialog({
  info,
  onClose,
}: {
  info: BillingLimitInfo;
  onClose: () => void;
}) {
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
        <div className="overline">Plan limit reached</div>
        <h3 className="font-serif text-2xl font-medium tracking-tight">
          You&rsquo;ve hit your {info.plan} limit.
        </h3>
        <p className="text-sm leading-relaxed text-charcoal-light">
          {info.current} of {info.limit} videos used on the{' '}
          <span className="font-medium text-charcoal">{info.plan}</span> plan.
          Upgrade to Pro to keep adding videos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/billing" className="btn-primary">
            Upgrade to Pro
          </Link>
          <button type="button" onClick={onClose} className="btn-secondary">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [k, v] of Object.entries(headers)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

function NewSectionForm({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<CreateSectionInput>({
    resolver: zodResolver(createSectionSchema),
    defaultValues: { propertyId, title: '' },
  });

  async function onSubmit(values: CreateSectionInput) {
    const res = await fetch('/api/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setError('title', { message: 'Could not create section. Try again.' });
      return;
    }
    reset({ propertyId, title: '' });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-sand bg-transparent px-6 py-5 text-sm font-medium text-charcoal-light transition-colors duration-200 hover:border-gold hover:bg-cream-dark/30 hover:text-charcoal"
      >
        <Plus size={16} />
        Add a section
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-start"
    >
      <input type="hidden" {...register('propertyId')} value={propertyId} />
      <div className="flex-1 space-y-1.5">
        <input
          type="text"
          autoFocus
          maxLength={60}
          placeholder="e.g. Check-in, Weekly chores, Emergency"
          className="field-input"
          {...register('title')}
        />
        {errors.title?.message && (
          <p className="text-xs text-red-700">{errors.title.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Adding…' : 'Add section'}
        </button>
        <button
          type="button"
          onClick={() => {
            reset({ propertyId, title: '' });
            setOpen(false);
          }}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  variant = 'default',
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={
        variant === 'danger'
          ? 'inline-flex h-8 w-8 items-center justify-center rounded-md text-charcoal-light transition-colors duration-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:cursor-not-allowed disabled:opacity-40'
          : 'inline-flex h-8 w-8 items-center justify-center rounded-md text-charcoal-light transition-colors duration-200 hover:bg-cream-dark hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-40'
      }
    >
      {icon}
    </button>
  );
}
