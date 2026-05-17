import type { AnnotationObject } from './types';
import type { HotspotIcon } from '@/lib/validators';

// Plugin keys annotations by numeric ID; our hotspots are nanoid strings.
// IdMap is owned by the wrapper (a ref) so React renders don't reset it.
export type IdMap = {
  numericToHotspotId: Map<number, string>;
  hotspotIdToNumeric: Map<string, number>;
  next: number;
};

export function createIdMap(): IdMap {
  return {
    numericToHotspotId: new Map(),
    hotspotIdToNumeric: new Map(),
    next: 1,
  };
}

export function assignNumericId(map: IdMap, hotspotId: string): number {
  const existing = map.hotspotIdToNumeric.get(hotspotId);
  if (existing !== undefined) return existing;
  const n = map.next++;
  map.hotspotIdToNumeric.set(hotspotId, n);
  map.numericToHotspotId.set(n, hotspotId);
  return n;
}

export type AdapterHotspot = {
  id: string;
  timestampSeconds: number;
  title: string;
  icon: HotspotIcon;
  instructionsMd: string;
  createdAt?: string | Date;
};

// Markers on the timeline need a visible range, so we give every hotspot a
// 2-second window starting at the host-pinned timestamp. The plugin's
// `range.end` must always exceed `range.start`.
const MARKER_RANGE_SECONDS = 2;

export function hotspotToAnnotation(
  hotspot: AdapterHotspot,
  numericId: number,
  hostMeta: { name: string },
): AnnotationObject {
  const start = Math.max(0, Math.floor(hotspot.timestampSeconds));
  const datetime =
    typeof hotspot.createdAt === 'string'
      ? hotspot.createdAt
      : hotspot.createdAt instanceof Date
        ? hotspot.createdAt.toISOString()
        : new Date().toISOString();
  return {
    id: numericId,
    range: { start, end: start + MARKER_RANGE_SECONDS },
    shape: { x1: null, x2: null, y1: null, y2: null },
    comments: [
      {
        id: 1,
        meta: {
          datetime,
          user_id: 'host',
          user_name: hostMeta.name,
        },
        body: hotspot.title + (hotspot.instructionsMd ? '\n\n' + hotspot.instructionsMd : ''),
      },
    ],
  };
}

export function annotationToHotspotPatch(
  annotation: AnnotationObject,
  idMap: IdMap,
): { id: string; timestampSeconds: number } | null {
  const hotspotId = idMap.numericToHotspotId.get(annotation.id);
  if (!hotspotId) return null;
  return {
    id: hotspotId,
    timestampSeconds: Math.round(annotation.range.start),
  };
}
