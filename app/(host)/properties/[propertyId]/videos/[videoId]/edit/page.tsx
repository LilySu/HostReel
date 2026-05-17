import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import {
  getVideoForUser,
  listHotspotsForVideo,
  listPhotosForHotspots,
} from '@/lib/db/queries';
import { storage } from '@/lib/storage';
import { HotspotEditor, type EditorVideo, type EditorHotspot } from './HotspotEditor';

export const dynamic = 'force-dynamic';

export default async function EditVideoPage({
  params,
}: {
  params: Promise<{ propertyId: string; videoId: string }>;
}) {
  const userId = await requireUser();
  const { propertyId, videoId } = await params;
  const row = await getVideoForUser(videoId, userId);
  if (!row || row.property.id !== propertyId) notFound();
  const { video } = row;
  if (video.status !== 'ready' || !video.storagePath) {
    return (
      <div className="space-y-6">
        <Link
          href={`/properties/${propertyId}/videos/${videoId}`}
          className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
        >
          ← Back to video
        </Link>
        <div className="surface-card p-8 text-center">
          <div className="overline">Not ready</div>
          <p className="mt-2 text-sm text-charcoal-light">
            This video is still processing. Refresh in a moment.
          </p>
        </div>
      </div>
    );
  }

  const hotspotRows = await listHotspotsForVideo(videoId);
  const photoRows = await listPhotosForHotspots(hotspotRows.map((h) => h.id));

  const editorVideo: EditorVideo = {
    id: video.id,
    propertyId: row.property.id,
    title: video.title,
    durationSeconds: video.durationSeconds,
    widthPx: video.widthPx,
    heightPx: video.heightPx,
    sourceUrl: storage.publicUrl(video.storagePath),
    posterUrl: video.posterPath ? storage.publicUrl(video.posterPath) : null,
  };

  const editorHotspots: EditorHotspot[] = hotspotRows.map((h) => ({
    id: h.id,
    timestampSeconds: h.timestampSeconds,
    title: h.title,
    icon: h.icon,
    instructionsMd: h.instructionsMd,
    requiredAcknowledgment: h.requiredAcknowledgment,
    photos: photoRows
      .filter((p) => p.hotspotId === h.id)
      .map((p) => ({ id: p.id, url: storage.publicUrl(p.storagePath) })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/properties/${propertyId}/videos/${videoId}`}
          className="text-sm text-charcoal-light transition-colors duration-200 hover:text-charcoal"
        >
          ← Back to video
        </Link>
        <Link
          href={`/properties/${propertyId}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          Test as guest →
        </Link>
      </div>
      <HotspotEditor video={editorVideo} initialHotspots={editorHotspots} />
    </div>
  );
}
