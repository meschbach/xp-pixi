# Tasks: add-responsive-camera-ui

## 1. Camera math (pure, headless-tested)

- [x] 1.1 Create `src/rendering/camera.ts`: plain camera state `{ x, y, scale }` plus pure functions `fitCamera(board, viewport)` with 1.5x cap, `zoomAroundPoint(camera, factor, anchor)`, `clampPan(camera, board, viewport)`, `screenToWorld(camera, px, py)`
- [x] 1.2 Unit tests (`camera.test.ts`): world→screen→world round-trip identity at several zoom/pan states; zoom-around-point keeps anchor fixed; clamp keeps board edges inside viewport and pins center when fully visible; cap honored on large viewports

## 2. Camera wiring into the render pipeline

- [x] 2.1 Insert `worldContainer` between stage and `boardView.container`/`sceneView.container` in `main.ts`; apply camera state to it each frame or on change; board layout stays computed-once
- [x] 2.2 `bootRenderer`: change signature to accept viewport dimensions (not board dimensions); add `resolution: Math.min(devicePixelRatio, 2)`, `autoDensity: true`; canvas sized to viewport instead of board dimensions
- [x] 2.3 Viewport listener in `main.ts`: window `resize` + `visualViewport.resize` through one shared debounce timer (~150ms); flush dimensions from `visualViewport.width/height` when available (fallback `innerWidth/innerHeight`) → `renderer.resize(vw, vh)` + `app.stage.hitArea = new Rectangle(0, 0, vw, vh)` + refit preserving relative zoom factor (board-center anchor) + clamp; listeners unregister via session cleanup so restart/HMR swaps don't accumulate them; verify no session rebuild occurs
- [x] 2.4 Desktop regression check: placement, wave start, restart, HMR carry all still work with mouse picking routed through `screenToWorld`

## 3. Gesture recognition

- [x] 3.1 Implement pointer gesture FSM (tap / pan / pinch / long-press per design D6 thresholds) as a testable module over pointer down/move/up/cancel records; FSM emits `LONG_PRESS` when a held touch exceeds 300ms within slop (keeping FSM pure — input-only outputs); unit tests cover tap-vs-pan slop, long-press emission, multi-pointer tap suppression, `pointercancel` aborting to IDLE silently, pinch ratio + midpoint extraction and midpoint-delta pan
- [x] 3.2 Integrate FSM into `inputController`: touch pans and pinches drive camera ops (ratio-zoom anchored at midpoint + midpoint-delta pan, then clamp); pointers captured on down (`setPointerCapture`) so gestures survive leaving the canvas; wheel zooms about cursor via a native non-passive listener with `preventDefault` — branch on `deltaMode`: `DOM_DELTA_PIXEL` (trackpad pinch) applies smooth continuous factor (`scale *= 1 + (-deltaY * k_pixel)`, k_pixel ~0.005), `DOM_DELTA_LINE` (mouse wheel) applies discrete ~1.1× step; any `DOM_DELTA_PIXEL` event drives zoom (not only ctrl+wheel); ctrl+wheel `preventDefault` still suppresses browser page zoom; taps emit cell selections only for touch pointer type; primary-button drags never pan
- [x] 3.3 Desktop pan affordance: middle/right-button drag pans when zoomed in (clamped); middle-button `mousedown` preventDefaulted to suppress autoscroll; canvas context menu suppressed on right-button
- [x] 3.4 Set `touch-action: none` on the canvas and preventDefault touch-initiated gestures; confirm page scroll outside canvas unaffected and iOS double-tap-zoom suppressed

## 4. Touch select-and-confirm flow

- [x] 4.1 Generalize preview computation: `refresh(world)` derives preview from `activeFocus = ui.hover ?? ui.selected` (mouse hover takes priority, touch selection fallback); cache key includes focus source to avoid stale hits when switching input modes
- [x] 4.2 Generalize sceneView drawing: replace `sameAs(ui.hover, preview.cell)` gate with `sameAs(activeFocus, preview.cell)` where `activeFocus = ui.hover ?? ui.selected`; `drawCoverageFocus` and `drawOutlines` likewise consume active focus so the pinned touch selection renders its coverage/validity overlay with no hover event present
- [x] 4.3 Extract `rejectionMessage(reason: PlacementIssue): string` from `main.ts` into a shared pure module; cover all eight `PlaceResult` reasons defensively (including unreachable `out-of-bounds` and `run-not-active`); both float-text and bottom-sheet consume this single mapping
- [x] 4.4 Build bottom-sheet component in `.hud-root` (DOM): title/reason line, confirm button, close affordance; slide-up styling within safe-area insets; Start button click handler auto-dismisses the sheet before starting the wave
- [x] 4.5 Wire flow: touch tap selects cell → sheet shows (build label with cost, or rejection reason) → confirm calls existing `tryPlaceTower`; re-selection: tapping another buildable cell updates selection/preview/sheet in place; dismissal paths (tap-away incl. out-of-bounds, ✕, re-tap of selection, long-press) clear selection/preview/sheet with no world changes; game-over transition (`world.state` leaves `'running'`) auto-dismisses sheet/selection/preview before overlay appears
- [x] 4.6 Verify mouse path bypasses sheet entirely (hover preview + instant click)

## 5. Fluid HUD & viewport CSS

- [x] 5.1 Update `index.html`: add `viewport-fit=cover`; root sizing `100vh` fallback then `100dvh` override; `body { overflow: hidden }`; `.hud-root` switches from `position: absolute` (canvas-relative) to `position: fixed; inset: 0` (viewport-fixed); `clamp()` typography/spacing for stats, buttons, overlay panel
- [x] 5.2 Safe-area padding for edge-anchored HUD elements; translucent chip behind bottom-center start button
- [x] 5.3 Input-appropriate hint text: seed from `(pointer: coarse)`, then switch stickily with the most recently observed `pointerType` — touch wording (select then confirm) when last input was touch, mouse wording when last input was mouse

## 6. Verification

- [x] 6.1 `npm test`, `npm run typecheck`, `npm run lint` green; simulation untouched (no imports changed under `src/simulation/`)
- [x] 6.2 Manual device matrix: desktop (resize incl. DevTools open/close preserving zoom, wheel zoom, click-place), phone landscape (rotation mid-wave preserves state and zoom level, start button legible over board, sheet-over-Start overlap consciously evaluated during awaiting-start), phone portrait (full board visible, pinch + two-finger drag to comfortable tile size, select-confirm placement), tablet both orientations
- [x] 6.3 Tune `ZOOM_MAX_FACTOR`, debounce interval, tap slop/duration constants, wheel zoom step (~1.1×), and trackpad `k_pixel` (~0.005) on real devices (Mac trackpad + mouse wheel + phone touch); record final values in code constants
