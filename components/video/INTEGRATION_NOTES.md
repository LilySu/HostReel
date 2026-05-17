# Video.js + @contently/videojs-annotation-comments — integration notes

Institutional memory for the next person who touches `components/video/`. Read
this before changing anything in here.

## What the plugin is doing for us

Pure marker renderer on the Video.js progress bar. Every other plugin feature
(comment threads, drawing rectangles on the frame, internal CRUD UI, the
"Annotations" toggle button) is switched off. Our React tree owns the detail
panel, the forms, the API calls. The plugin draws gold dots and emits an event
when you click one.

If you find yourself enabling `internalCommenting` or `showCommentList` to
"save some React code", stop. The plugin's internal state would immediately
diverge from our DB on the first edit.

## Plugin options — editor vs. guest

Same wrapper, same options today. We pass `mode: 'editor' | 'guest'` so the
component *could* branch later, but the only behavioural difference right now
is:

- **editor** registers a listener on `addingAnnotationDataChanged` and calls
  `onHotspotTimestampChanged` so a future drag-the-marker UX can PATCH the
  hotspot. Currently nothing in the editor consumes that callback — the spec
  marked drag-to-adjust as deferred.
- **guest** doesn't.

The actual plugin options object (`VideoJSWithAnnotations.tsx`):

| Option | Value | Why |
|---|---|---|
| `showControls` | `false` | Hides the plugin's annotation toggle button in the Video.js control bar. The host adds hotspots via our existing form. |
| `showCommentList` | `false` | Hides the plugin's right-side comment panel. We render the detail panel in React. |
| `showMarkerShapeAndTooltips` | `true` | We want markers on the timeline and the small hover tooltip with the body text. |
| `internalCommenting` | `false` | Disables the plugin's "add annotation → write comment → save" flow. CRUD is ours. |
| `bindArrowKeys` | `false` | Our editor has its own ←/→ shortcuts; let those win. |
| `startInAnnotationMode` | `false` | We never want to start in the plugin's authoring mode. |
| `showFullScreen` | `false` | Annotations don't render on top of the fullscreen video reliably; safer to disable than to wrestle with z-index. |

If you ever flip `showControls` or `internalCommenting` back on, you also need
to add CSS to undo the `display: none !important` overrides in
`video-player.css` for `.vac-player-btn` / `.vac-comments-container`.

## `unknown`/`any` casts and what they paper over

The plugin has no published types and Video.js v7's static-side types are
incomplete. The unavoidable type-system holes, all in
`VideoJSWithAnnotations.tsx`:

1. `AnnotationCommentsFactory as unknown as (vjs) => unknown` — the plugin's
   default export. There's a `declare module` shim at
   `components/video/contently-videojs-annotation-comments.d.ts` declaring it
   `unknown`, and we narrow at the call site. Adding a richer ambient type is
   possible but the plugin's API surface is small enough that the cost isn't
   worth it.
2. `(videojs as unknown as { getPlugin?: ... }).getPlugin('annotationComments')`
   — the double-registration guard. The static `getPlugin` is on the
   `videojs` namespace at runtime but not in `@types/video.js@7`.
3. `player as unknown as PlayerWithAnnotations` — after `registerPlugin` the
   player gets an `annotationComments(opts)` method, but the @types don't know
   about it.
4. Plugin event `event.detail` payloads — typed as `unknown` in our
   `AnnotationCommentsPlugin` interface and narrowed at each listener (with a
   defensive `typeof === 'number'` check on the numeric id).

None of these are `any`. They're all `unknown` narrowed at the boundary, per
the project rule. If you change the plugin version, re-check listener payload
shapes — they're the most likely thing to drift.

## Required-hotspot styling: the `data-required` DOM workaround

The brief offered two paths and explicitly picked the easier one. We mark
required markers by post-processing the plugin's rendered DOM:

```ts
const markers = root.querySelectorAll<HTMLElement>('.vac-marker, .vac-marker-wrap');
markers.forEach((marker) => {
  const numStr = marker.getAttribute('data-id') ?? marker.dataset.id ?? marker.id ?? '';
  const numId = Number(numStr.replace(/[^0-9]/g, ''));
  // map numericId → hotspotId → check requiredHotspotIds set
  if (hotspotId && required.has(hotspotId)) {
    marker.setAttribute('data-required', 'true');
  } else {
    marker.removeAttribute('data-required');
  }
});
```

Tagging runs:
- Once on initial plugin ready (deferred to next tick so the DOM has settled).
- After every plugin `onStateChanged` event (annotations added/removed).
- After our own hotspots-prop diff effect fires (so a `requiredAcknowledgment`
  toggle in the editor refreshes the styling).

CSS lives in `components/video/video-player.css`:

```css
.video-js .vac-marker[data-required='true'],
.video-js .vac-marker-wrap[data-required='true'] {
  background-color: #ffffff !important;
  border: 2px solid #a88b5c !important;
  box-shadow: 0 0 0 2px #c8a876;
}
```

**Selectors to update if the plugin changes its DOM:**

| Where | What to update |
|---|---|
| `VideoJSWithAnnotations.tsx#tagRequiredMarkers` | `.vac-marker, .vac-marker-wrap` selector and the `data-id`/`id` parsing |
| `video-player.css` | Marker selectors (multiple places) |

If the plugin ever renames `vac-marker` to something else, both files need to
move together. A safer long-term option is to subclass the plugin's marker
component, but that's a real chunk of code and we explicitly punted on it.

## ID-mapping ref pattern (do not "simplify")

The plugin requires **numeric** annotation IDs. Our hotspots are nanoid
strings. We maintain a bidirectional map in a `useRef` on the wrapper:

```ts
type IdMap = {
  numericToHotspotId: Map<number, string>;
  hotspotIdToNumeric: Map<string, number>;
  next: number;       // monotonic counter
};
```

Three things a future contributor will be tempted to "simplify" but shouldn't:

1. **The map is a ref, not state.** It survives renders without triggering
   re-renders. If you move it into `useState`, every numeric-id allocation
   causes a re-render and the plugin's annotation array becomes a dependency
   loop.
2. **The counter is monotonic per-mount, not derived from anything.** Don't
   "fix" this by hashing the nanoid into a number — collisions across hotspots
   would silently corrupt the plugin's internal annotation store. We reset the
   map on player dispose so collisions can't survive a remount.
3. **We reuse a hotspot's numeric ID across destroy/recreate cycles.** When
   `timestampSeconds` changes, the wrapper fires `destroyAnnotation` and then
   `newAnnotation` with the **same numeric ID**. If you let
   `assignNumericId` allocate a fresh id every time, the plugin will still
   work but the id map will leak entries.

## Hotspot updates: how the plugin learns about changes

Three change paths, three different mechanisms — keep them straight:

1. **Active video changes** (guest TOC switch): `VideoJSPlayer` has
   `key={src}`. React unmounts the old wrapper, the cleanup effect disposes
   the Video.js player, and a fresh player + plugin are constructed.
2. **Hotspot list changes** (host adds/removes/edits a hotspot): the diff
   effect in `VideoJSWithAnnotations.tsx` runs `plugin.fire('destroyAnnotation')`
   for removed hotspots and `destroy + newAnnotation` for everything else. The
   Video.js player is **not** disposed. The same numeric ID is reused via the
   id map.
3. **Marker styling changes** (`requiredHotspotIds` set changes): the
   `tagRequiredMarkers` effect re-walks the DOM and updates `data-required`.
   No plugin events involved.

### Known wart in the diff

The effect today destroys+recreates **every** annotation whenever **any**
hotspot in the list changes. If a host edits one title in a list of 20
hotspots, all 20 markers churn. The player isn't disposed and the UX is
visually fine (the churn is one tick), but it's wasteful and any future
slowness on large lists likely starts here. A per-row diff (compare the
existing key to the new key) is the obvious refactor. Not done in v1 because
hotspot counts per video are small (≤ ~10 in practice).

## Plugin behaviors the brief didn't predict

- `plugin.onReady` fires *before* the plugin has rendered its first markers.
  `tagRequiredMarkers` inside `onReady` is wrapped in `setTimeout(..., 0)` so
  it runs after the marker DOM exists.
- `onStateChanged` fires a lot (including on apparent no-ops). Treat it as
  "markers may have re-rendered, re-tag". The tag pass is cheap.
- `destroyAnnotation` silently no-ops on an unknown id. The id map is our
  only consistency check.
- The plugin's bundled CSS is loud — we import
  `@contently/videojs-annotation-comments/build/css/annotations.css` and then
  hide large chunks of it. Skip the import and markers don't position;
  skip the overrides and you get a comment-thread UI on every page.
- `showFullScreen: false` doesn't hide the Video.js fullscreen button — it
  only disables the plugin's behaviour inside fullscreen.

## Things to never do

- Do not re-render the `<video-js>` element via JSX.
- Do not call `videojs.registerPlugin('annotationComments', ...)` more than
  once. The module-level `pluginRegistered` flag + `getPlugin` check guard
  this; don't bypass them.
- Do not pin Video.js to v8+. The plugin is built for v7.
- Do not change our DB hotspot shape to match the plugin's annotation shape.
  The adapter is one-way, on purpose.
