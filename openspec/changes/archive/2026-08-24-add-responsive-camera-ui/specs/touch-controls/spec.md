# touch-controls delta

## ADDED Requirements

### Requirement: Pointer gesture discrimination
The system SHALL classify touch input into tap, pan, pinch, and long-press
from a single pointer stream: a release within 300ms with movement under
~10px slop on a single pointer is a tap; single-pointer movement beyond slop
is a pan; two pointers form a pinch anchored at their midpoint, whose
movement pans the camera. A held touch that exceeds the tap window without
moving past slop SHALL emit a long-press event. Multi-pointer sequences MUST
NOT emit taps, including immediately after their completion. System-initiated
pointer cancellation MUST abort any in-flight gesture without emitting a tap,
placement, or camera movement.

#### Scenario: Quick still touch is a tap
- **WHEN** a single touch lands and lifts within 300ms having moved under the
  slop threshold
- **THEN** the system emits a tap at that cell and the camera does not move

#### Scenario: Drag pans instead of placing
- **WHEN** a touch moves beyond the slop threshold before lifting
- **THEN** the camera pans and no placement or selection occurs

#### Scenario: Second finger cancels tap
- **WHEN** a first touch is quickly followed by a second finger landing
- **THEN** no tap is emitted from either pointer and the pair drives pinch

#### Scenario: System interruption aborts cleanly
- **WHEN** an in-flight touch gesture is canceled by the system
  (`pointercancel`)
- **THEN** no tap or placement results and subsequent taps classify normally

### Requirement: Touch placement via select-and-confirm
On touch devices, tapping a buildable cell SHALL select it and pin the
coverage/validity preview until selection changes or is dismissed. Placement
MUST commit only through an explicit confirm affordance presented in a
bottom-sheet panel; the confirmation path SHALL apply the same placement
validation and cost as existing placement (no parallel rules).

#### Scenario: Valid cell shows preview then commits on confirm
- **WHEN** the player taps an affordable buildable cell and presses the
  sheet's build button
- **THEN** the coverage preview stays pinned on the cell, money is deducted
  once, and the tower appears

#### Scenario: Preview follows selection
- **WHEN** the player taps a different cell while a selection is active
- **THEN** the pinned preview and validity state move to the newly tapped cell

#### Scenario: Re-selection updates the sheet
- **WHEN** the player taps a different buildable cell while the bottom sheet
  is open
- **THEN** the selection, pinned preview, and sheet content update to reflect
  the newly tapped cell without dismissing and re-opening

### Requirement: Rejection reasons surface in the sheet
Tapping a non-buildable or unaffordable cell on touch SHALL still select it,
and the sheet SHALL explain why placement would fail using the same rejection
reasons as existing feedback. No charge SHALL occur.

#### Scenario: Unaffordable cell explained
- **WHEN** the player taps a buildable cell while unable to afford a tower
- **THEN** the sheet states the required cost and the build action does not
  deduct money

### Requirement: Selection dismissal without side effects
The system SHALL dismiss touch selection via tapping the selected cell again,
tapping empty/out-of-bounds space, the sheet's close affordance, or a
long-press gesture, clearing the pinned preview and sheet without modifying
world state. The system SHALL also auto-dismiss selection when the game
transitions to a non-running state (defeat or victory).

#### Scenario: Dismiss by tapping away
- **WHEN** the player taps outside the board while a cell is selected
- **THEN** the selection, pinned preview, and sheet are cleared and nothing is
  placed

#### Scenario: Dismiss by re-tapping the selection
- **WHEN** the player taps the currently selected cell while the sheet is open
- **THEN** the selection, pinned preview, and sheet are cleared and nothing is
  placed

#### Scenario: Dismiss by long-press
- **WHEN** the player long-presses (>300ms, within slop) while the bottom
  sheet is open
- **THEN** the selection, pinned preview, and sheet are cleared and nothing is
  placed

#### Scenario: Auto-dismiss on game over
- **WHEN** the game transitions to a non-running state (defeat or victory)
  while the bottom sheet is open
- **THEN** the selection, pinned preview, and sheet are cleared before the
  game-over overlay appears

### Requirement: Mouse interaction unchanged
Mouse play SHALL retain hover-following placement preview and single-click
instant placement with no sheet. Mouse wheel zoom is governed by the
board-camera capability and MUST NOT alter click semantics.

#### Scenario: Desktop click places instantly
- **WHEN** a mouse user clicks an affordable buildable cell
- **THEN** a tower is placed immediately with no intermediate confirmation
