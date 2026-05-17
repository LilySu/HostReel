'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ShareSheet } from '@/components/ShareSheet';

const renameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});
type RenameInput = z.infer<typeof renameSchema>;

export function PropertyActions({
  propertyId,
  initialName,
  published,
  shareSlug,
  coverImageUrl,
}: {
  propertyId: string;
  initialName: string;
  published: boolean;
  shareSlug: string;
  coverImageUrl: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  async function onUploadCover(file: File) {
    if (uploadingCover) return;
    setCoverError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCoverError('Pick a JPEG, PNG, or WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setCoverError('Max 5 MB.');
      return;
    }
    setUploadingCover(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!res.ok) throw new Error('Could not start upload');
      const { uploadUrl, uploadHeaders } = (await res.json()) as {
        uploadUrl: string;
        uploadHeaders: Record<string, string>;
      };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      });
      if (!put.ok) throw new Error(`PUT failed (${put.status})`);
      router.refresh();
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadingCover(false);
    }
  }

  async function onRemoveCover() {
    if (uploadingCover) return;
    setUploadingCover(true);
    setCoverError(null);
    try {
      await fetch(`/api/properties/${propertyId}/cover`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setUploadingCover(false);
    }
  }

  // Defer the window.location read until after hydration so the first client
  // render matches the server (where window is undefined). A direct read
  // during render caused a hydration mismatch when `published` was true —
  // the server emitted the fallback panel, the client tried to render
  // <ShareSheet>, and the trees didn't line up.
  const [shareUrl, setShareUrl] = useState<string>('');
  useEffect(() => {
    setShareUrl(`${window.location.origin}/v/${shareSlug}`);
  }, [shareSlug]);

  async function onTogglePublish() {
    if (publishing) return;
    setPublishing(true);
    const res = await fetch(`/api/properties/${propertyId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !published }),
    });
    setPublishing(false);
    if (!res.ok) return;
    router.refresh();
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setError,
  } = useForm<RenameInput>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name },
  });

  async function onRename(values: RenameInput) {
    const res = await fetch(`/api/properties/${propertyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setError('name', { message: 'Could not rename. Try again.' });
      return;
    }
    setName(values.name);
    setEditing(false);
    router.refresh();
  }

  async function onDelete() {
    setDeleting(true);
    const res = await fetch(`/api/properties/${propertyId}`, { method: 'DELETE' });
    if (!res.ok) {
      setDeleting(false);
      setConfirmingDelete(false);
      return;
    }
    router.push('/properties');
    router.refresh();
  }

  if (editing) {
    return (
      <form
        onSubmit={handleSubmit(onRename)}
        className="surface-card flex flex-col gap-3 p-5 sm:flex-row sm:items-start"
      >
        <div className="flex-1 space-y-1.5">
          <input
            type="text"
            autoFocus
            maxLength={80}
            className="field-input"
            {...register('name')}
          />
          {errors.name?.message && (
            <p className="text-xs text-red-700">{errors.name.message}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={isSubmitting} className="btn-primary">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              reset({ name });
              setEditing(false);
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <div className="surface-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <CoverSlot
            coverImageUrl={coverImageUrl}
            uploading={uploadingCover}
            onUpload={onUploadCover}
            onRemove={onRemoveCover}
          />
          <div className="space-y-2">
            <div className="overline">
              {published ? (
                <span className="inline-flex items-center gap-1.5 text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-sand" />
                  Draft
                </span>
              )}
            </div>
            <h1 className="font-serif text-4xl font-medium tracking-tight">{name}</h1>
            {coverError && (
              <p className="text-xs text-red-700">{coverError}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onTogglePublish}
            disabled={publishing}
            className={published ? 'btn-secondary' : 'btn-primary'}
          >
            {publishing
              ? 'Saving…'
              : published
                ? 'Unpublish'
                : 'Publish'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn-secondary"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={deleting}
            className="btn-destructive"
          >
            Delete
          </button>
        </div>
      </div>

      {published && shareUrl && (
        <ShareSheet url={shareUrl} propertyName={name} />
      )}
      {published && !shareUrl && (
        // Server-render fallback before window.location is available.
        <div className="surface-card p-5">
          <div className="overline">Public link</div>
          <code className="mt-1 block truncate font-mono text-sm text-charcoal-light">
            /v/{shareSlug}
          </code>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Delete this property?"
          description={
            <>
              <span className="font-medium text-charcoal">{name}</span> and all of
              its sections, videos, hotspots, and photos will be permanently
              deleted. This cannot be undone.
            </>
          }
          confirmLabel="Delete property"
          destructive
          pending={deleting}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={onDelete}
        />
      )}
    </>
  );
}

function CoverSlot({
  coverImageUrl,
  uploading,
  onUpload,
  onRemove,
}: {
  coverImageUrl: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <label
        className="group relative block h-20 w-28 cursor-pointer overflow-hidden rounded-md border border-sand-light bg-cream-dark"
        title={coverImageUrl ? 'Replace cover image' : 'Upload cover image'}
      >
        {coverImageUrl ? (
          // User-uploaded media — plain <img> per StorageProvider contract.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-opacity duration-200 group-hover:opacity-80"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.18em] text-charcoal-light">
            Add cover
          </div>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </label>
      {coverImageUrl && (
        <button
          type="button"
          onClick={onRemove}
          disabled={uploading}
          className="text-[10px] uppercase tracking-wider text-charcoal-light underline-offset-2 hover:text-red-700 hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      )}
    </div>
  );
}
