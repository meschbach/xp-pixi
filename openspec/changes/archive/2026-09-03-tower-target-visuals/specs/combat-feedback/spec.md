## ADDED Requirements

### Requirement: Persistent target indication
Each tower SHALL persistently indicate its current target with a per-tower identity code — a color accent, a distinct tether line pattern, and a matching enemy marker glyph: a marker on the tower, a tether from the tower to its target, and a matching marker on the targeted enemy. A placed tower's identity code (color, pattern, glyph) SHALL remain stable for the tower's entire lifetime. While a tower has no target, it SHALL show no tether or enemy marker. The indication SHALL remain legible when colors are ambiguous under color-vision deficiency (identity carried by pattern + glyph + luminance, not color alone).

#### Scenario: Target visible at a glance
- **WHEN** a tower has a target and that target is currently live
- **THEN** a tether (with the tower's pattern) connects the tower to the enemy and the enemy shows a marker (with the tower's glyph) matching the tower's accent color

#### Scenario: Focus fire is legible
- **WHEN** several towers target the same enemy
- **THEN** the enemy shows one marker per targeting tower, each carrying that tower's distinct glyph and pattern, decodable even when their accent hues are ambiguous to a color-blind player

#### Scenario: Accent identity is stable per placement
- **WHEN** a tower is placed and other towers are later placed or removed
- **THEN** that tower's identity code (color, pattern, glyph) does not change while it lives

#### Scenario: No target, no indicator
- **WHEN** a tower has no current target
- **THEN** it shows no tether and no enemy marker for that tower

#### Scenario: Converging links fan out by position
- **WHEN** several towers target the same enemy
- **THEN** each tower's enemy marker sits at a distinct, stable position around the enemy center (deterministic per tower id), so the links remain separable by location alone

#### Scenario: Links are visually distinct along the tether over time
- **WHEN** a tower persistently targets an enemy
- **THEN** a slow, dim visual pulse travels along the tether at a rate de-phased from other towers' pulses, so the link reads as a distinct connection over time

### Requirement: Aim orientation and idle settle
Each tower SHALL visually orient toward its current target using an eased turn, and when it has no target SHALL settle back toward a neutral upward orientation at a bounded rate.

#### Scenario: Tower points at its target
- **WHEN** a tower has a target
- **THEN** its visual orientation eases toward facing the target's current position

#### Scenario: Idle settles to neutral
- **WHEN** a tower loses its target
- **THEN** its orientation eases back toward pointing upward over time

### Requirement: Fire feedback derives from shot events
Consuming a shot event SHALL present transient, purely cosmetic feedback linking the firing tower and its target: a muzzle flash at the tower, a beam toward the target, and an impact ring at the target. Feedback lifetime SHALL be keyed to the event's tick rather than wall-clock, and SHALL NEVER alter simulation state.

#### Scenario: Attack is traced
- **WHEN** a shot event is consumed
- **THEN** a brief beam links the firing tower to its target alongside a muzzle flash and an impact ring, all cosmetic

#### Scenario: Feedback cannot affect the simulation
- **WHEN** fire feedback plays
- **THEN** health, money, cooldowns, and all other simulation state are unchanged

#### Scenario: Feedback follows sim time, not frame rate
- **WHEN** the render frame rate varies
- **THEN** feedback lifetime remains consistent with the event's tick rather than the frame cadence

### Requirement: Type-distinct tower shapes
A tower SHALL render using a shape determined by its tower type as defined in balance data, so distinct tower types SHALL render as distinct shapes. A tower type with no registered shape SHALL fall back to a default shape without error.

#### Scenario: Shape follows tower type
- **WHEN** a tower of a configured type is placed
- **THEN** it renders with the shape registered for that type

#### Scenario: Unknown type falls back to default
- **WHEN** balance data defines a tower type with no registered shape
- **THEN** the tower renders as the default shape without error