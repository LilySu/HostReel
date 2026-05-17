'use client';

import { useCallback, useEffect, useRef } from 'react';
import videojs from 'video.js';
import { VideoJSPlayer } from './VideoJSPlayer';
import {
  assignNumericId,
  createIdMap,
  hotspotToAnnotation,
  type AdapterHotspot,
  type IdMap,
} from './adapter';
import type {
  AnnotationCommentsPlugin,
  AnnotationCommentsPluginOptions,
  AnnotationObject,
  PlayerWithAnnotations,
  VideoJsPlayer,
} from './types';
import './video-player.css';

// The plugin is a UMD bundle with no types. Static analysis treats its default
// export as `any`; we narrow to a factory that accepts videojs and returns the
// plugin class.
import AnnotationCommentsFactory from '@contently/videojs-annotation-comments';

type AnnotationCommentsCtor = (vjs: typeof videojs) => unknown;

let pluginRegistered = false;
function ensurePluginRegistered() {
  if (pluginRegistered) return;
  if (typeof window === 'undefined') return;
  // Guard against double-registration during Fast Refresh / StrictMode.
  const getter = (videojs as unknown as { getPlugin?: (name: string) => unknown }).getPlugin;
  if (getter && getter('annotationComments')) {
    pluginRegistered = true;
    return;
  }
  const factory = AnnotationCommentsFactory as unknown as AnnotationCommentsCtor;
  videojs.registerPlugin('annotationComments', factory(videojs) as never);
  pluginRegistered = true;
}

export type Mode = 'editor' | 'guest';

export type WrapperHotspot = AdapterHotspot & {
  requiredAcknowledgment?: boolean;
};

export type VideoJSWithAnnotationsProps = {
  src: string;
  poster?: string | null;
  hotspots: WrapperHotspot[];
  hostName: string;
  mode: Mode;
  requiredHotspotIds?: Set<string>;
  onHotspotOpened?: (hotspotId: string) => void;
  onHotspotTimestampChanged?: (
    hotspotId: string,
    newTimestampSeconds: number,
  ) => void;
  onPlayerReady?: (player: VideoJsPlayer) => void;
  fluid?: boolean;
};

export function VideoJSWithAnnotations({
  src,
  poster,
  hotspots,
  hostName,
  mode,
  requiredHotspotIds,
  onHotspotOpened,
  onHotspotTimestampChanged,
  onPlayerReady,
  fluid = true,
}: VideoJSWithAnnotationsProps) {
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const pluginRef = useRef<AnnotationCommentsPlugin | null>(null);
  const idMapRef = useRef<IdMap>(createIdMap());
  const onHotspotOpenedRef = useRef(onHotspotOpened);
  const onHotspotTimestampChangedRef = useRef(onHotspotTimestampChanged);
  const requiredIdsRef = useRef<Set<string> | undefined>(requiredHotspotIds);

  onHotspotOpenedRef.current = onHotspotOpened;
  onHotspotTimestampChangedRef.current = onHotspotTimestampChanged;
  requiredIdsRef.current = requiredHotspotIds;

  // Translate our hotspot rows into the plugin's annotation shape, allocating
  // numeric IDs along the way. The id map is the only place that mapping lives.
  const buildAnnotations = useCallback(
    (rows: WrapperHotspot[]): AnnotationObject[] => {
      return rows.map((h) => {
        const numericId = assignNumericId(idMapRef.current, h.id);
        return hotspotToAnnotation(h, numericId, { name: hostName });
      });
    },
    [hostName],
  );

  // Walk the rendered DOM and tag markers belonging to required hotspots so the
  // CSS in video-player.css can highlight them. The plugin renders `.vac-marker`
  // elements with a numeric id we can map back to our hotspot id. This is the
  // documented "easier" approach in the brief — if the plugin renames `.vac-marker`
  // in a future version, update the selector here.
  const tagRequiredMarkers = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    const required = requiredIdsRef.current;
    if (!required || required.size === 0) {
      // Clear stale attributes if requirement changed at runtime.
      const root = player.el() as HTMLElement;
      root.querySelectorAll('[data-required="true"]').forEach((m) =>
        m.removeAttribute('data-required'),
      );
      return;
    }
    const root = player.el() as HTMLElement;
    // Plugin marker selector — coupling documented above. The marker DOM may be
    // named `.vac-marker` or be a `.vac-marker-wrap`; we match either.
    const markers = root.querySelectorAll<HTMLElement>('.vac-marker, .vac-marker-wrap');
    markers.forEach((marker) => {
      const numStr =
        marker.getAttribute('data-id') ?? marker.dataset.id ?? marker.id ?? '';
      const numId = Number(numStr.replace(/[^0-9]/g, ''));
      if (!Number.isFinite(numId) || numId === 0) return;
      const hotspotId = idMapRef.current.numericToHotspotId.get(numId);
      if (hotspotId && required.has(hotspotId)) {
        marker.setAttribute('data-required', 'true');
      } else {
        marker.removeAttribute('data-required');
      }
    });
  }, []);

  const handlePlayerReady = useCallback(
    (player: VideoJsPlayer) => {
      ensurePluginRegistered();
      playerRef.current = player;
      onPlayerReady?.(player);

      const annotations = buildAnnotations(hotspots);

      const options: AnnotationCommentsPluginOptions = {
        annotationsObjects: annotations,
        meta: { user_id: 'host', user_name: hostName },
        // Treat plugin as a pure marker renderer: keep its UI fully hidden,
        // route every CRUD action through our existing forms.
        showControls: false,
        showCommentList: false,
        showMarkerShapeAndTooltips: true,
        internalCommenting: false,
        bindArrowKeys: false,
        startInAnnotationMode: false,
        showFullScreen: false,
      };

      const playerWithPlugin = player as unknown as PlayerWithAnnotations;
      const plugin = playerWithPlugin.annotationComments(options);
      pluginRef.current = plugin;

      plugin.onReady(() => {
        plugin.registerListener('annotationOpened', (event) => {
          const detail = (event as { detail?: { annotation?: { id?: number } } })
            .detail;
          const numericId = detail?.annotation?.id;
          if (typeof numericId !== 'number') return;
          const hotspotId = idMapRef.current.numericToHotspotId.get(numericId);
          if (hotspotId) onHotspotOpenedRef.current?.(hotspotId);
        });

        // For drag-adjusted markers in editor mode. The plugin fires this when
        // an annotation's range moves while in editing flows; we surface the
        // new start time to the parent so it can PATCH /api/hotspots/[id].
        plugin.registerListener('addingAnnotationDataChanged', (event) => {
          if (mode !== 'editor') return;
          const detail = (event as {
            detail?: {
              range?: { start?: number };
              annotation?: { id?: number };
            };
          }).detail;
          const numericId = detail?.annotation?.id;
          const newStart = detail?.range?.start;
          if (typeof numericId !== 'number' || typeof newStart !== 'number') return;
          const hotspotId = idMapRef.current.numericToHotspotId.get(numericId);
          if (hotspotId) {
            onHotspotTimestampChangedRef.current?.(
              hotspotId,
              Math.round(newStart),
            );
          }
        });

        // Re-tag markers whenever the plugin reports state changes (annotations
        // added/removed). The plugin emits markers asynchronously, so we both
        // tag here and again whenever our hotspots prop changes.
        plugin.registerListener('onStateChanged', () => {
          // Defer to next tick so the DOM has settled before we query.
          setTimeout(tagRequiredMarkers, 0);
        });

        // Initial pass once the plugin has rendered.
        setTimeout(tagRequiredMarkers, 0);
      });
    },
    [buildAnnotations, hostName, hotspots, mode, onPlayerReady, tagRequiredMarkers],
  );

  // Diff hotspot list → plugin state. The plugin owns the source of truth for
  // what's on the timeline, so we drive changes through its public events
  // rather than mutating React state directly into it.
  const lastHotspotKeyRef = useRef<string>('');
  useEffect(() => {
    const plugin = pluginRef.current;
    if (!plugin) return;

    const currentKey = hotspots
      .map((h) => `${h.id}:${h.timestampSeconds}:${h.title}`)
      .join('|');
    if (currentKey === lastHotspotKeyRef.current) return;
    lastHotspotKeyRef.current = currentKey;

    // Compute deltas using the id map's existing numeric ids.
    const wantById = new Map<string, WrapperHotspot>();
    for (const h of hotspots) wantById.set(h.id, h);

    // Destroy annotations whose hotspot id is no longer present.
    const toDestroy: number[] = [];
    idMapRef.current.hotspotIdToNumeric.forEach((numId, hotspotId) => {
      if (!wantById.has(hotspotId)) toDestroy.push(numId);
    });
    for (const numId of toDestroy) {
      const hotspotId = idMapRef.current.numericToHotspotId.get(numId);
      plugin.fire('destroyAnnotation', { id: numId });
      idMapRef.current.numericToHotspotId.delete(numId);
      if (hotspotId) idMapRef.current.hotspotIdToNumeric.delete(hotspotId);
    }

    // Create or replace remaining annotations. The plugin has no "update"
    // event, so for a moved/renamed hotspot we destroy and re-add. Re-using
    // the same numeric id keeps the id map stable.
    for (const h of hotspots) {
      const existing = idMapRef.current.hotspotIdToNumeric.get(h.id);
      const numericId = existing ?? assignNumericId(idMapRef.current, h.id);
      const annotation = hotspotToAnnotation(h, numericId, { name: hostName });
      if (existing !== undefined) {
        plugin.fire('destroyAnnotation', { id: numericId });
      }
      plugin.fire('newAnnotation', {
        id: numericId,
        range: annotation.range,
        shape: annotation.shape,
        commentStr: annotation.comments[0]?.body ?? '',
      });
    }

    // Re-tag required markers after the plugin's DOM updates.
    setTimeout(tagRequiredMarkers, 0);
  }, [hotspots, hostName, tagRequiredMarkers]);

  // Re-tag when the set of required hotspots changes (e.g. host toggles a
  // checkbox in the editor while previewing).
  useEffect(() => {
    tagRequiredMarkers();
  }, [requiredHotspotIds, tagRequiredMarkers]);

  // Keying VideoJSPlayer by src ensures the player is torn down and rebuilt
  // when the active video changes (guest TOC switch). Otherwise the plugin
  // would attach to a stale player.
  return (
    <VideoJSPlayer
      key={src}
      src={src}
      poster={poster ?? undefined}
      fluid={fluid}
      onReady={handlePlayerReady}
      onDispose={() => {
        pluginRef.current = null;
        playerRef.current = null;
        idMapRef.current = createIdMap();
        lastHotspotKeyRef.current = '';
      }}
    />
  );
}
