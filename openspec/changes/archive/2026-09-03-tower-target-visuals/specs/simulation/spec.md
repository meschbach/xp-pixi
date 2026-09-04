## ADDED Requirements

### Requirement: Fixed-rate discrete stepping and state sampling
The world SHALL advance only through `tick()`, which performs exactly one simulation step at the fixed rate (30 steps per second). Consumers (e.g., rendering) SHALL sample world state between ticks and MUST NOT advance, mutate, or reorder the simulation; the only sanctioned ways state changes are a `tick()`, a player command, and an acknowledgment cursor (below).

#### Scenario: Consumers sample without advancing
- **WHEN** a frame reads world state without invoking `tick()`
- **THEN** the world's tick count and entity states are unchanged

#### Scenario: Fixed step rate
- **WHEN** the world steps for one second of simulated time
- **THEN** it advances exactly 30 ticks

### Requirement: Persisted entity identity
Every tower and enemy SHALL carry an integer `id` assigned once from a single per-world monotonic counter, unique across towers and enemies for the lifetime of the run and stable for the entity's lifetime. Events and state SHALL reference entities by this id without ambiguity.

#### Scenario: Ids unique across domains
- **WHEN** a world has created both towers and enemies
- **THEN** no two distinct entities share an id

#### Scenario: Ids stable for a lifetime
- **WHEN** an entity is created
- **THEN** its id does not change while the entity exists

### Requirement: Ground-truth event outbox
The simulation SHALL publish ground-truth combat facts (e.g., a tower attacking an enemy) to an append-only, sim-owned event outbox, each entry carrying a monotonically increasing event id. Facts SHALL contain only simulation-safe data (tick, entity ids, axial cells) and MUST NOT contain presentation parameters. The simulation SHALL NOT read consumer state.

#### Scenario: Attack emits a shot fact
- **WHEN** a tower's attack lands on a target
- **THEN** exactly one shot event is appended identifying the firing tower, the target enemy, the tick, and the target's cell

#### Scenario: Events append in tick order
- **WHEN** the world advances across multiple ticks
- **THEN** event ids are monotonically increasing and ordered by tick

### Requirement: Watermark consumers with bounded acknowledgment
Consumers SHALL begin consumption by initializing a watermark at the current outbox head, then drain events forward; a consumer SHALL advance a monotonically increasing acknowledgment cursor as it handles events. The outbox SHALL reclaim, on each tick, every entry at or below the lowest acknowledged cursor, keeping the outbox bounded over a run. Consumers MUST NOT write events to the outbox, and the simulation SHALL NOT read consumer state except through the explicit acknowledgment cursor.

#### Scenario: Consumer starts at the head
- **WHEN** a consumer begins consuming after events already exist in the outbox
- **THEN** pre-existing events are not delivered to it

#### Scenario: Acknowledged events are reclaimed
- **WHEN** the acknowledged cursor passes event id N
- **THEN** every event with id at or below N is removed and the outbox remains bounded

#### Scenario: Acknowledgment cannot move backward
- **WHEN** a consumer acknowledges a cursor at or below the currently acknowledged cursor
- **THEN** the acknowledgment is ignored and the acknowledged cursor is unchanged

#### Scenario: Reclamation never overtakes a live reader
- **WHEN** a consumer has not yet drained through an event's id
- **THEN** that event is not reclaimed, so the consumer can resume from its cursor at any time