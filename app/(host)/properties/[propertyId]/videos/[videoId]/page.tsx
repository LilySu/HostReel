import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getVideoForUser } from '@/lib/db/queries';
import { storage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export default async function VideoViewerPage({
  params,
}: {
  params: Promise<{ propertyId: string; videoId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId, videoId } = await params;
  const row = await getVideoForUser(videoId, userId);
  if (!row || row.property.id !== propertyId) notFound();

  const { video } = row;
  const isReady = video.status === 'ready' && video.storagePath;
  const isVertical =
    video.widthPx && video.heightPx && video.heightPx > video.widthPx;
  const sourceUrl = isReady ? storage.publicUrl(video.storagePath) : null;
  const posterUrl = video.posterPath
    ? storage.publicUrl(video.posterPath)
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href={`/properties/${propertyId}`}
        className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
      >
        ← Back to property
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="overline">Video</div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">
            {video.title}
          </h1>
        </div>
        {isReady && (
          <Link
            href={`/properties/${propertyId}/videos/${videoId}/edit`}
            className="btn-primary"
          >
            Edit hotspots
          </Link>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        {sourceUrl ? (
          <div
            className={`mx-auto bg-charcoal ${
              isVertical ? 'flex justify-center' : 'w-full'
            }`}
          >
            <video
              controls
              playsInline
              preload="metadata"
              poster={posterUrl}
              src={sourceUrl}
              // Vertical clips overflow the fold on most laptops if we just let
              // width drive height. Capping max-height directly to 70vh keeps
              // the whole frame visible without horizontal scrolling.
              className={
                isVertical
                  ? 'block max-h-[70vh] w-auto'
                  : 'block h-auto w-full'
              }
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="overline">
              {video.status === 'failed' ? 'Upload failed' : 'Not ready'}
            </div>
            <p className="max-w-md text-sm text-charcoal-light">
              {video.status === 'failed'
                ? 'This video couldn’t be processed. Try uploading it again.'
                : 'This video is still processing. Refresh in a moment.'}
            </p>
          </div>
        )}
      </div>

      {video.description && (
        <div className="space-y-2">
          <div className="overline">About this video</div>
          <p className="whitespace-pre-line text-base leading-relaxed text-charcoal-light">
            {video.description}
          </p>
        </div>
      )}
    </div>
  );
}
