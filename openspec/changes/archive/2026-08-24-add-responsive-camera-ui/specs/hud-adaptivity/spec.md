# hud-adaptivity delta

## ADDED Requirements

### Requirement: Viewport-fixed HUD positioning
The HUD root SHALL use `position: fixed; inset: 0` (viewport-fixed) rather
than `position: absolute` within the canvas-relative game root, so the HUD
is decoupled from canvas sizing and immune to sub-pixel or `dvh`-support
mismatch between the canvas pixel buffer and the CSS viewport.

#### Scenario: HUD tracks viewport not canvas
- **WHEN** the canvas is letterboxed (board smaller than viewport) or the
  viewport is in a debounce transition
- **THEN** the HUD remains correctly positioned to the viewport edges with
  no misalignment

### Requirement: Fluid layout across form factors
The HUD SHALL remain readable and operable across phone, tablet, and desktop
viewports in both orientations using fluid sizing (clamp()-based type scale and
spacing) rather than breakpoint-specific layouts. All interactive HUD elements
MUST remain reachable within the viewport.

#### Scenario: Phone landscape keeps controls visible
- **WHEN** the game runs in a 393-pixel-tall landscape viewport
- **THEN** stats, wave readout, and the start control are all visible and
  legible without scrolling

#### Scenario: No breakpoint jumps
- **WHEN** the viewport is resized continuously between phone and desktop
  widths
- **THEN** HUD sizing changes smoothly with no discontinuous layout switch

### Requirement: Mobile browser chrome correctness
The game's root layout SHALL size against the dynamic viewport (dvh units) so
that mobile browser URL bars do not cause the canvas or HUD to overflow the
visible area.

#### Scenario: URL bar collapse does not clip
- **WHEN** the mobile browser's URL bar collapses while playing
- **THEN** the canvas and HUD reflow to the newly visible viewport with no
  clipped controls

### Requirement: Safe-area clearance
HUD elements anchored to screen edges SHALL respect `env(safe-area-inset-*)`
so notches, rounded corners, and home indicators never overlap them.

#### Scenario: Bottom control clears the home indicator
- **WHEN** the game renders on a device with a home indicator in landscape
- **THEN** the bottom-center action sits fully above the indicator area

### Requirement: Overlay legibility over the board
HUD elements that overlap board pixels SHALL carry a translucent backing —
e.g., the bottom-center start button in phone landscape — so their text stays
legible over arbitrary tile colors.

#### Scenario: Start button over the last board row
- **WHEN** the start button overlaps rendered board tiles
- **THEN** its label remains readable against the tile colors behind it

### Requirement: Input-appropriate guidance
The onboarding hint SHALL reflect the active input modality: wording is seeded
from the device's pointer coarseness and switches with the most recently
observed pointer type, so hybrid devices always show guidance matching how the
player is actually playing.

#### Scenario: Hint adapts to touch
- **WHEN** the game receives touch input on a device seeded as mouse-primary
- **THEN** the hint describes tap-to-select and sheet confirmation instead of
  clicking
