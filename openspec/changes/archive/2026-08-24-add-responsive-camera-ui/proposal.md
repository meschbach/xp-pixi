# Proposal: Responsive Camera & Touch UI

## Why

The renderer sizes its canvas once at boot to a fixed ~975x610 board and never
responds to the viewport again, so the game is effectively desktop-only: on
phones and tablets the board does not fit, rotating the device does nothing,
and touch players place towers blind because `pointerdown` commits instantly
with no hover preview. Retina screens also render soft because device pixel
ratio is ignored.

## What Changes

- Introduce a **camera layer**: board geometry stays immutable (computed once);
  a `{ x, y, scale }` camera projects world space onto a viewport-sized canvas,
  replacing the current "canvas fits the board" inversion.
- Canvas resizes live with the viewport — window resize **and** device rotation
  on tablets/phones refit the camera without rebuilding the session or losing
  game state.
- Add a **pinch-zoom + pan camera** on touch devices (anchored at the finger
  midpoint, whose drift pans; clamped to board bounds), and mouse-wheel zoom
  plus middle/right-button drag-pan on desktop; default view is capped at 1.5x
  natural board scale, and viewport changes never reset the player's chosen
  zoom level.
- Rework touch placement into an explicit two-step flow: tap selects a cell and
  pins the coverage/validity preview, a contextual **bottom sheet** confirms the
  build (and explains rejections); mouse keeps single-click instant placement.
- Make the HUD fluid (`dvh` viewport units, `clamp()` type scale, safe-area
  insets) instead of fixed-position styles tuned for one canvas size.
- Render at device pixel ratio for crisp output on all screens.

Out of scope (deferred): multiple tower types / upgrade / sell entries in the
sheet, drag-to-place ghosts, BitmapText for zoom-crisp float text, inertia
scrolling.

## Capabilities

### New Capabilities

- `board-camera`: World-to-screen projection — viewport fitting with a 1.5x
  scale cap, live resize/orientation refit, player zoom range, clamped panning,
  and screen-to-world coordinate mapping used by all picking.
- `touch-controls`: Pointer gesture handling (tap vs pan vs pinch) and the
  touch placement flow — select cell, pinned preview, bottom-sheet confirm with
  rejection reasons; desktop mouse behavior unchanged apart from gaining
  wheel zoom.
- `hud-adaptivity`: Fluid DOM HUD layout that remains usable across phone /
  tablet / desktop form factors and both orientations without breakpoint-
  specific layouts.

### Modified Capabilities

(none — existing specs cover simulation, map, waves, deployment, toolchain;
none of their requirements change)

## Impact

- `src/rendering/` — new camera module; `app.ts` gains resolution/resize
  options; `inputController.ts` gains gesture recognition and inverse-projection
  picking; `sceneView.ts` draw gating keys off an active-focus cell (hover or
  pinned selection) instead of hover equality; `main.ts` wires resize listeners
  and the sheet flow.
- `index.html` — viewport meta (`viewport-fit=cover`) and fluid CSS.
- New DOM surface: build sheet inside `.hud-root`.
- Simulation (`src/simulation/`) untouched — purity rule intact; camera/gesture
  math is pure and unit-testable headless.
