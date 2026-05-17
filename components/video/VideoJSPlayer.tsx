'use client';

import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type { VideoJsPlayer } from './types';

export type VideoJSPlayerProps = {
  src: string;
  poster?: string | null;
  fluid?: boolean;
  onReady?: (player: VideoJsPlayer) => void;
  onDispose?: () => void;
};

export function VideoJSPlayer({
  src,
  poster,
  fluid = true,
  onReady,
  onDispose,
}: VideoJSPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<VideoJsPlayer | null>(null);
  const onReadyRef = useRef(onReady);
  const onDisposeRef = useRef(onDispose);

  onReadyRef.current = onReady;
  onDisposeRef.current = onDispose;

  useEffect(() => {
    if (playerRef.current || !containerRef.current) return;

    // Imperative DOM construction — Video.js owns this node after mount.
    // Re-rendering via JSX would let React tear it out from under the player.
    const videoEl = document.createElement('video-js');
    videoEl.classList.add('vjs-big-play-centered');
    videoEl.setAttribute('playsinline', '');
    containerRef.current.appendChild(videoEl);

    const type = src.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';

    const player = videojs(
      videoEl,
      {
        controls: true,
        responsive: true,
        fluid,
        preload: 'metadata',
        poster: poster ?? undefined,
        sources: [{ src, type }],
      },
      function onPlayerReady() {
        onReadyRef.current?.(player);
      },
    );

    playerRef.current = player;

    return () => {
      onDisposeRef.current?.();
      const p = playerRef.current;
      if (p && !p.isDisposed()) {
        p.dispose();
      }
      playerRef.current = null;
    };
    // Intentional: init once. Src/poster changes handled by parent unmounting
    // this component via a React `key` so a stale player is never patched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div data-vjs-player className="w-full">
      <div ref={containerRef} />
    </div>
  );
}
