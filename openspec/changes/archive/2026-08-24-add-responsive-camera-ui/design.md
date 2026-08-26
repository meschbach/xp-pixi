# Design: Responsive Camera & Touch UI

## Context

`BoardLayout` (src/rendering/hexLayout.ts) currently answers two questions at
once: board-space geometry (tile size, cell origins — derived from map dims)
and screen-space projection (canvas dimensions). It is computed once in
`bootSession` and captured by value into `boardView`, `sceneView`, and
`inputController`; the canvas (`app.init({width, height})`) never resizes
afterward. Input picks cells by treating canvas pixels as board pixels directly
(`pixelToAxial`). The HUD is absolutely-positioned DOM tuned to that one canvas
size, sized against `100vh`.

Consequences today: viewports smaller than ~975x610 clip the board; rotation
does nothing; touch has no hover so `pointerdown` places towers blind;
`resolution` defaults to 1 so retina screens render soft.

Constraints carried from the project: simulation purity (no DOM/Pixi imports
under `src/simulation/`), headless unit tests for logic, hot-apply/HMR carry of
a live `World` across session teardown, GitHub Pages static deploy.

## Goals / Non-Goals

**Goals:**

- One rendering pipeline that serves desktop, tablet, and phone in both
  orientations without rebuilding sessions or mutating board geometry.
- Pinch-zoom + pan on touch; wheel zoom on desktop as a free consequence.
- Explicit, forgiving touch placement (select → confirm) that survives the
  future addition of multiple tower types.
- Fluid HUD usable across form factors without breakpoint-specific layouts.

**Non-Goals:**

- Multiple tower types / upgrade / sell UI (sheet is designed to grow into
  this, but ships with the single default tower).
- Drag-to-place ghost interaction, inertia/momentum panning, board rotation in
  portrait.
- Simulation or balance changes of any kind.

## Decisions

### D1: Camera layer instead of live-relayout or session rebuild

Three options were weighed for viewport changes:

| Option | Mechanism | Rejected because |
|---|---|---|
| A: live relayout | mutable shared layout + redraw subscriptions | spreads mutability through four modules built around an immutable layout |
| B: rebuild session | recompute layout, tear down renderer, carry World | heavy churn (already exists for HMR/restart), destroys FX state, conflates projection with geometry |
| **C: camera** | immutable board space; dynamic `{ x, y, scale }` projects it onto a viewport-sized canvas | — chosen |

C dissolves the problem: fitting, rotating, pinching, and panning are all just
camera-value updates. Graphics are GPU-transformed geometry, so scaled rendering
stays crisp without redrawing at a new tile size. FX (flashes, float text) live
in world-space containers and track correctly under the camera automatically.

Structure: a `worldContainer` sits between stage and the existing
`boardView.container` / `sceneView.container`; camera state applies to it. The
HMR/restart machinery keeps its only remaining job.

### D2: Board layout remains boot-immutable

`BoardLayout` stays computed-once from map dimensions with fixed
`TILE_SIZE = 34`. No fitted-layout recomputation ever occurs; there is nothing
to invalidate, so the signature caches in `boardView` remain valid forever.

### D3: Fit policy and zoom bounds

- Default fit: `scale = min(vw/boardW, vh/boardH)`, capped at **1.5×** natural
  size so large monitors letterbox instead of showing comically large tiles.
  Constants: `FIT_MAX_SCALE = 1.5`.
- Player zoom range: `[fitScale, fitScale * ZOOM_MAX_FACTOR]`,
  `ZOOM_MAX_FACTOR ≈ 2.5` (tunable constant; brings phone hexes to a
  comfortable finger size).
- Pan is clamped so board edges never leave the viewport when zoomed in; when
  the whole board fits, pan is pinned to center (letterbox).
- Letterboxing blends invisibly because page background already matches the
  canvas background (`#101018`).

### D4: Viewport change handling

Listen to window `resize` plus `visualViewport.resize` (iOS URL-bar
collapse/change fires resize but not always at stable sizes); orientation is
derived rather than listened-for — refit is dimension-driven, so no separate
`orientationchange` branch is needed. Flush dimensions come from
`visualViewport.width/height` when available — they track the visible area
through URL-bar transitions where `innerWidth/innerHeight` do not, and using
them avoids feedback loops with the dynamic-viewport CSS — falling back to
the inner values elsewhere. Both events feed one shared ~150ms debounce timer;
each flush does exactly `renderer.resize(vw, vh)` + refit + clamp. Refit
preserves the player's zoom as a *factor* of fit scale
(`newScale = oldScale / oldFit × newFit`, clamped to the allowed range,
board-center anchored): window resizes and rotation move the fit baseline
without discarding the player's vantage. No thresholding beyond debounce:
camera updates are cheap by construction (D1). Listeners register inside
`bootSession` and unregister through `activeCleanup`, so restart and HMR
swaps never accumulate duplicate listeners.

Root layout sizing declares `100vh` first, then overrides with `100dvh`, so
mobile browser chrome doesn't overshoot while engines that drop unknown units
(pre-15.4 Safari) keep a sane height. The canvas is exactly viewport-sized
now, so `body { overflow: hidden }` prevents scrollbar flicker during the
debounce window.

### D5: Device pixel ratio

`app.init({ resolution: Math.min(devicePixelRatio, 2), autoDensity: true })`.
Cap at 2 to bound fill cost; antialias stays on. Resolution is read once at
boot: dragging the window to a higher-DPR display keeps the capped resolution
until reload — accepted, consistent with the cap rationale.

### D6: Pointer gesture FSM (one stream, all devices)

Raw-ish pointer tracking feeding a small state machine:
`IDLE → PRESSED → PANNING / PINCHING → IDLE`, with `TAP` emitted from
`PRESSED` on quick (<300ms), still (<10px slop), single-pointer release,
and `LONG_PRESS` emitted from `PRESSED` on a held touch (>300ms, within slop).

- 1 pointer + movement beyond slop → pan (translate by delta/scale). Pan
  applies to touch pointers; mouse panning uses non-primary buttons only, so a
  sloppy primary-button drag never moves the camera mid-placement. A held
  touch (>300ms, within slop) emits `LONG_PRESS` — the consumer decides what
  to do (e.g., dismiss the bottom sheet); with no sheet open, it's a no-op,
  preserving the future inspect-style hook.
- 2 pointers → pinch: scale by distance ratio, anchored at the touch midpoint
  (zoom-around-point math keeps the board point under the fingers fixed),
  and midpoint movement between pinch steps pans by the same visual delta —
  two-finger drag repositions while zooming, as maps-app instinct expects.
  Each zoom/pan application runs `zoomAroundPoint`/translate then `clampPan`,
  so the anchor invariant holds everywhere clamping permits. Taps suppressed
  during and shortly after multi-pointer sequences.
- `pointercancel` aborts any in-flight gesture back to IDLE emitting nothing:
  iOS fires it on system-gesture interruption (notification pull, edge
  swipes), and a machine without a cancel path strands mid-state. Every
  active pointer is captured via `setPointerCapture` on down so pan/pinch
  survive the finger or cursor leaving the canvas (mouse loses window events
  freely; capture is what keeps drags alive).
- Mouse: hover picking as today; left-click retains instant placement;
  wheel zooms around the cursor via a native **non-passive** `wheel` listener
  (`preventDefault` stops page scroll and trackpad ctrl+wheel browser zoom —
  federated Pixi events don't carry wheel); zoomed in, middle/right-button
  drag pans, with middle-button `mousedown` preventDefaulted to suppress
  browser autoscroll and canvas context menu suppressed on right-button.
- Trackpad pinch (macOS): a trackpad pinch fires `wheel` events with
  `ctrlKey: true` and `deltaMode: DOM_DELTA_PIXEL` — not two-pointer touch
  events. The handler branches on `deltaMode`: `DOM_DELTA_PIXEL` applies a
  smooth continuous factor (`scale *= 1 + (-deltaY * k_pixel)`, `k_pixel`
  ~0.005) for a native Maps.app feel; `DOM_DELTA_LINE` (mouse scroll wheel)
  applies a discrete multiplicative step (~1.1× per detent). Any
  `DOM_DELTA_PIXEL` wheel event drives camera zoom, not only ctrl+wheel —
  some external trackpads report pixel deltas without ctrl. The
  `preventDefault` on ctrl+wheel still suppresses the browser's native page
  zoom.
- After every `renderer.resize(vw, vh)`, `app.stage.hitArea` expands to
  `new Rectangle(0, 0, vw, vh)` so pan/zoom/tap gestures register across the
  full viewport canvas, not just the letterboxed board area. Out-of-bounds
  world coordinates resolve to `null` through the existing picking pipeline,
  preserving behavioral correctness.
- Canvas gets `touch-action: none` so the browser never fights us on pan/pinch/
  double-tap-zoom; gesture handlers call `preventDefault` on touch-initiated
  events.
- All camera math (fit, zoomAroundPoint, clamp, screenToWorld inverse) is pure
  functions on plain state → headless unit tests, per project ethos.

Picking path everywhere becomes `screenToWorld(event.global) → pixelToAxial`;
the direct call in `inputController` is replaced, not duplicated.

### D7: Touch commit policy — select then bottom-sheet confirm

Two-tap-confirm was rejected: the second tap carries no information while only
one tower type exists, yet placement UX must survive the arrival of tower
choices. A contextual bottom sheet generalizes: one entry now ("Build Turret
$50"), N entries later, plus a future home for upgrade/sell under the same
"select a cell, act on it" grammar.

Flow (touch): tap buildable cell → cell selected, coverage/validity preview
pinned → sheet slides up within `.hud-root` (DOM, thumb-reach zone,
safe-area-aware) → explicit confirm commits via the same `tryPlaceTower`
pipeline; tapping another buildable cell re-selects; tapping empty space,
out-of-bounds, or ✕ dismisses. Invalid cells select too — the
sheet explains *why* (path must stay open, unaffordable, …) using the existing
rejection-reason mapping, replacing the transient float-text as primary
feedback on touch (float text stays as reinforcement).

Desktop unchanged: hover preview follows the cursor, click places instantly,
no sheet.

The preview pipeline keys off a single **active focus** cell — hover for
mouse, pinned selection for touch — consumed by both `inputController.refresh`
and sceneView's drawing. SceneView currently gates preview rendering on hover
equality (`sameAs(ui.hover, preview.cell)`); that gate must generalize to the
active focus or the pinned touch preview never renders (touch produces no
hover events). `activeFocus = ui.hover ?? ui.selected` (mouse hover takes
priority; touch selection is the fallback). `inputController.refresh` likewise
derives its preview from the active focus, not hover alone.

Re-selection while the sheet is open: tapping another buildable cell moves
the selection and updates the sheet content in place; tapping empty space,
out-of-bounds, or the selected cell itself dismisses the sheet and clears
the selection.

Rejection reasons flow through a **shared mapping function** (extracted from
`main.ts` into a pure module) that converts `PlaceResult` reasons to
user-facing strings. Both the float-text path and the bottom-sheet consume
this single mapping — the sheet owns zero placement logic. The mapping
covers all eight `PlaceResult` reasons defensively, even those unreachable
in practice (`out-of-bounds` produces no selection; `run-not-active` is
masked by the game-over overlay).

A long-press (>300ms, within slop) while the sheet is open dismisses it.
The gesture FSM emits a `LONG_PRESS` event (keeping the FSM pure —
input-only outputs); the consumer decides: sheet open → dismiss, no sheet
→ no-op (preserving the future inspect-style hook).

Game-over transition (`world.state` leaves `'running'`) auto-dismisses any
open sheet, selection, and preview. The same watch point that drives the
defeat/victory overlay handles this — the sheet must be explicitly cleared
before the overlay appears, not left dangling underneath.

### D8: HUD fluid-only, viewport-fixed styling

No breakpoints. `.hud-root` switches from canvas-relative (`position:
absolute` within `.game-root`) to **viewport-fixed** (`position: fixed;
inset: 0`) so the HUD is decoupled from canvas sizing entirely — no
sub-pixel or `dvh`-support mismatch bugs. Typography and spacing via
`clamp()`; root sizing via `vh` + `dvh` cascade; notch/home-indicator
clearance via `env(safe-area-inset-*)`; translucent chip behind the
bottom-center Start button so it stays legible when it overlaps the board's
last row in phone landscape. The hint line seeds from `(pointer: coarse)`
and then switches stickily with the most recently observed `pointerType` —
the gesture stream already sees every event — so a touch-capable laptop
shows mouse wording until the player actually touches, and vice versa.

## Risks / Trade-offs

- [Pixi `Text` rasterizes at creation] → float text softens when zoomed deep.
  Accepted short-term; BitmapText or 2x base size is the documented escape
  hatch (non-goal for now).
- [Stroke widths are board-unit, so grout lines thicken visually when zoomed]
  → accepted; revisit with per-frame `1/scale` compensation only if it reads as
  a defect.
- [iOS Safari viewport churn (URL bar collapse) fires frequent resizes]
  → debounce + the fact that camera updates are O(1) makes this invisible;
  `dvh` removes the worst offset source.
- [`touch-action: none` disables all native canvas gestures] → intended; we
  implement pan/zoom ourselves. Page scroll is unaffected outside the canvas.
- [Pinch anchoring bugs feel terrible if wrong] → zoomAroundPoint is a pure
  function with roundtrip unit tests (world→screen→world identity) before any
  wiring.
- [Sheet adds a second commit surface that could drift from simulation rules]
  → sheet only calls the existing `tryPlaceTower`; it owns zero placement
  logic. Rejection reasons flow back through the same result type.
- [Bottom sheet shares the bottom-center zone with the Start button] →
  resolved: pressing Start while the sheet is open auto-dismisses the sheet
  and starts the wave. The player's intent (start the wave) is never blocked
  by a UI affordance.
- [Long-press while the sheet is open feels like a defect if nothing happens]
  → resolved: the FSM emits a `LONG_PRESS` event; the consumer dismisses the
  sheet. An empty, unresponsive sheet would feel unpolished.

## Migration Plan

Single-page static app; no persisted state. Ship behind nothing — behavior
gates: desktop regression risk is limited to picking coordinates and wheel
zoom; verify existing flows (place, wave start, restart, HMR carry) after each
task phase. Rollback = revert the deploy (GitHub Actions re-run of previous
workflow).

## Open Questions

- Exact `ZOOM_MAX_FACTOR` (2.5 proposed), tap slop/duration constants, wheel
  zoom step (~1.1× proposed), and trackpad `k_pixel` (~0.005 proposed) —
  tune on real devices during apply.
- ~~Should double-tap-on-desktop do anything (e.g., zoom)?~~ **Resolved: no.**
  Touch double-tap is already occupied (second tap on the selection dismisses
  per D7); a desktop dblclick zoom would collide with rapid click-placement,
  and wheel/pinch already covers zooming.
