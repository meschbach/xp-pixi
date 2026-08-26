# board-camera delta

## ADDED Requirements

### Requirement: Viewport-fitted projection
The system SHALL render the full board on a canvas that matches the current
viewport dimensions, projecting board space through a camera whose default
scale equals `min(viewportWidth/boardWidth, viewportHeight/boardHeight)` capped
at 1.5x natural board scale. Board geometry (tile size, cell origins) MUST NOT
change in response to viewport changes.

#### Scenario: Phone portrait fits the whole board
- **WHEN** the game loads in a 393x852 CSS-pixel viewport
- **THEN** the entire board is visible, centered, scaled by width-fit (below
  the 1.5x cap), and the remaining vertical space letterboxes in the page
  background color

#### Scenario: Large monitor caps at 1.5x
- **WHEN** the viewport is large enough that width-fit or height-fit exceeds
  1.5x natural board scale
- **THEN** the camera uses exactly 1.5x and centers the board

### Requirement: Live resize and orientation refit
The system SHALL refit the camera whenever viewport dimensions change,
including device rotation on tablets and phones, by resizing the renderer and
recomputing camera state only. Refitting MUST preserve the player's zoom
expressed as a factor of the fitted scale (clamped to the allowed range), so a
viewport change moves the fit baseline without resetting the player's vantage.
A resize MUST NOT destroy or restart the rendering session, and the running
World state MUST be unaffected.

#### Scenario: Rotating mid-wave
- **WHEN** the device rotates from portrait to landscape during an active wave
- **THEN** the board refits to the new viewport, all towers/enemies/effects
  remain as they were, and simulation continues without interruption

#### Scenario: Window resize preserves player zoom
- **WHEN** the player has zoomed to twice the fitted scale and the viewport
  dimensions change
- **THEN** the camera settles at approximately twice the *new* fitted scale
  instead of snapping back to fit

#### Scenario: Desktop window resize
- **WHEN** the user drags the browser window edge
- **THEN** the canvas tracks the new size and the board stays fully visible

### Requirement: Player zoom range
The system SHALL let the player zoom continuously between the fitted scale
(lower bound) and `fitScale * ZOOM_MAX_FACTOR` (upper bound), via pinch on
touch devices and mouse wheel on desktop. Zoom operations MUST anchor at the
gesture point: the board coordinate under the finger or cursor remains fixed
under that pointer.

#### Scenario: Pinch zoom anchors at fingers
- **WHEN** a two-finger pinch changes distance by ratio k with midpoint m
- **THEN** the board point displayed at m before the pinch remains at m after
  — except where pan clamping applies — and scale multiplies by k clamped to
  the allowed range

#### Scenario: Wheel zoom on desktop
- **WHEN** the user scrolls the mouse wheel over the canvas
- **THEN** the camera zooms about the cursor position within the allowed range
  using a discrete multiplicative step (~1.1× per detent)

#### Scenario: Trackpad pinch zoom on macOS
- **WHEN** the user pinches on a trackpad (which fires `wheel` events with
  `deltaMode: DOM_DELTA_PIXEL` and `ctrlKey: true`)
- **THEN** the camera zooms smoothly about the finger midpoint with a
  continuous factor proportional to the pixel delta, matching native
  Maps.app feel; the browser's native page zoom is suppressed

### Requirement: Clamped panning
The system SHALL allow panning while zoomed in — one-finger drag or two-finger
midpoint movement on touch devices, right- or middle-button drag on desktop —
and MUST clamp pan so no board edge ever leaves the viewport; when the whole
board fits at current zoom, pan SHALL be pinned to center. Primary-button
drags on desktop MUST NOT pan, so click placement is never accompanied by
camera movement.

#### Scenario: Pan stops at board edge
- **WHEN** the player drags a zoomed-in board toward its left edge
- **THEN** translation stops with the board's left edge flush against the
  viewport's left edge

#### Scenario: Two-finger drag pans while pinching
- **WHEN** two fingers move together without materially changing their
  separation
- **THEN** the camera pans following the midpoint, clamped to board bounds

#### Scenario: Desktop pans a zoomed-in board
- **WHEN** the mouse user drags with the middle or right button while zoomed in
- **THEN** the camera pans following the drag, clamped to board bounds

#### Scenario: No drift when fully visible
- **WHEN** the board entirely fits the viewport and the player drags it
- **THEN** the board does not move

#### Scenario: Gestures work across the full viewport
- **WHEN** the player drags, pinches, or taps on canvas area outside the
  letterboxed board
- **THEN** the gesture is registered (pan, zoom, or dismissal) — the stage
  hitArea covers the full viewport, not just the board bounds

### Requirement: Inverse-projection picking
All cell picking SHALL convert screen coordinates to world coordinates through
the inverse camera transform before hex rounding. For any camera state,
world→screen→world round-trip MUST be the identity within floating-point
tolerance.

#### Scenario: Picking under zoom and pan
- **WHEN** the player taps a tile while the camera is zoomed and panned
- **THEN** the selected cell is the tile visually under the touch point
