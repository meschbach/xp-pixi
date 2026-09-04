# Design: Tower Target Visuals

## Context

The simulation is pure TypeScript with zero rendering dependencies (lint-enforced, `project-toolchain`). Towers fire on
a fixed 30 Hz tick (`tickTowers` in `src/simulation/towers.ts`): `selectTarget` sets `tower.targetId`, then damage lands
**instantly** into the target's `hp`. Rendering polls world state every animation frame from an accumulator loop in
`src/main.ts`; it never advances the world.

Combat feedback today is thin: a static blue coverage tint on the board (`boardView`) says "can reach", and a white
hit-ring in `sceneView` is derived by diffing each enemy's HP between frames (`lastHpById`). That heuristic cannot say
*which* tower fired, is ambiguous when several towers share a target, and appears on the frame after the damage — there
is no intent signal at all.

Two extra constraints shape the design:

- **HMR carries the World, not the view.** `main.ts` survives dev-server swaps via `import.meta.hot.dispose` while views
  are torn down and rebuilt. Any consumer bookkeeping must tolerate being recreated against a live world.
- **Colors are crowded.** Already in use: coverage `0x74c0fc`, tower `0xf59f00`, enemy palette
  `0xff8787 / 0xffd43b / 0x74c0fc / 0xb197fc / 0x63e6be`, hp `0x51cf66 / 0xffa94d / 0xff6b6b`, preview
  `0x8ce99a / 0xff6b6b`. A new accent palette must avoid these.
- Tower visuals are a single hard-coded triangle; enemy visuals already resolve per `typeId` from the balance registry (
  `resolveEnemyVisuals`), the pattern tower shapes should mirror.

## Goals / Non-Goals

**Goals:**

- Make every tower's current target legible at a glance, persistently, including focus-fire (several towers on one
  enemy).
- Give each attack a cause→effect trace (muzzle + beam + hit-ring) so instant-damage reads as a gunshot.
- Keep simulation/presentation strictly separated: the sim emits ground truth, presentation never mutates the world
  except via sanctioned commands.
- Bounded event outbox; no unbounded memory growth over a long run.
- No new dependencies; effects stay cheap graphics primitives (no sprite/particle systems).

**Non-Goals:**

- Projectile physics or travel time — damage stays instant (spec).
- New tower types — this change only prepares shape-based differentiation.
- Replay/rewind of consumed events.
- Rebalancing damage, cooldowns, or targeting rules.
- HUD or input changes.

## Decisions

### D1: Ground-truth shot facts via a sim-owned event outbox

When `tickTowers` resolves a shot (`towers.ts:114-119`), the world appends a `shot` fact to an outbox owned by the
simulation. Presentation consumes outbox events and decorates them. The outbox is append-only, entries carry a *
*monotonic event id**, and the sim never reads consumer state.

**The event id is the identity of an event, independent of its physical storage slot.** It is drawn from a single
per-world counter that **never resets** for the lifetime of the run (across trimming, across HMR survival, across the
world's lifetime) and is *distinct from* the `tick` number (the world tick it happened on). Ordering, acknowledgment,
and trimming all key on the event id. Because the id is never reused, trimming is free to **recycle physical storage
slots** (an array head today, a ring buffer later) without ambiguity: a consumer distinguishes "this slot now holds a
newer event" purely by comparing ids, and can always identify the earliest unconsumed event as the lowest id above its
cursor (D10/D11). The id must never be aliased by a storage-recycle step.

**Alternatives considered:**

- Presentational sticky fields on `Tower` (e.g., `lastFireEnemyId`): rejected — that's presentation state smuggled into
  the sim model, and it's single-value (breaks the moment two shots need tracking).
- Pure render-side inference (keep the HP-diff heuristic): rejected — cannot attribute a hit to a specific tower when
  towers share a target; the whole problem is attribution.
- Event-listening with callbacks/subscriptions into the sim: rejected — inverts the data flow; the sim would need to
  know about consumers.

### D2: A monotonic ACK channel is the one pruning exception

Pruning requires the sim to know an event is safe to drop. Rather than sampling consumer state, presentation **ACKs** a
cursor (`ack(upToId)` = "everything through X is handled"). The sim trims, at the top of each tick, every entry at or
below the acknowledged cursor. Trimming **reclaims storage in id-space** (per D1 the id is the identity, never reused);
it never frees a slot that could alias a not-yet-consumed event. This is the sole sanctioned presentation→sim channel
beyond player commands; it is monotonic, non-state-corrupting, and never injects data (symmetry: sim→presentation
streams facts, presentation→sim is commands).

Three invariants keep this safe:

- acknowledgments that do not advance the cursor are **ignored** — the cursor can never move backward and no event can
  be re-acked;
- trim only ever lags the acknowledged cursor, and an ack advances only after the consumer has finished draining — so
  the sim never reclaims an event a live consumer hasn't drained yet, and a consumer can always resume from its cursor;
- today there is exactly one consumer; the spec's "lowest acknowledged cursor" wording stays compatible with a future
  second consumer without extra machinery now.

**Alternatives considered:**

- Time-based expiry in the sim: rejected — conflates consumer progress with wall-clock and needs the sim to know
  presentation timing.
- Unbounded log with no pruning: rejected — violates the boundedness goal; a long campaign would grow without limit.
- Fixed-capacity ring buffer as the *primary* structure today: deferred, not rejected — a ring buffer is a fine fit for
  the future because monotonic ids (D1) make slot-alias detections safe; it is simply unnecessary now while events are
  sparse and bounded by "work since last ack." The D1 id semantics are what make a later switch to a ring buffer
  safe, so they are specified up front.

### D3: Consumers subscribe at the outbox head

A consumer's cursor is seeded to the current outbox length at creation, then drains forward. This resolves the HMR case
cleanly: a **carried world keeps its old outbox** while a **fresh view** is recreated, so seeding at the head means
pre-existing events are never replayed. Combined with D2, a dead consumer's untrimmed events are reclaimed by the new
consumer's **first acknowledgment**: that drain runs from the head seed forward, so the ack value passes every
pre-existing id (events below the seed are never read, only swept). Nothing strands.

### D4: One unified per-world entity id counter

Towers and enemies each currently number from 1 in their own counters (`nextTowerId` / `nextEnemyId`), so `id=1` is
ambiguous. Replace both with a single `nextEntityId` counter per world; every tower and enemy gets a unique id for its
lifetime in the run. Event fields (`towerId`, `targetId`) become globally unambiguous.

**Alternatives considered:**

- Domain-scoped ids (`{domain:'tower', id:1}`): rejected — every event reference turns into a tag+id pair, every
  resolution needs a domain switch, and consumers would need per-domain cursors. Opaque ids cost nothing because
  entities carry their own kind and a shot event semantically implies tower→enemy.

### D5: Shot event payload is sim-safe facts only

`{kind:'shot', id, tick, towerId, targetId, targetCell, targetToCell, targetProgress}`. `targetCell` (the target's
`fromCell`, an axial cell, not pixels) is captured because the target can be removed the same tick (killed), and the
presentation needs an anchor for its hit-ring/beam even after the enemy is gone. `targetToCell` (the target's `toCell`)
is captured so the fire-time interpolated position is fully determined. `targetProgress` (0–1) records the enemy's hop
progress at fire time; together the three reconstruct the exact fire-time pixel position
(`fromCell + (toCell − fromCell) × progress`) for beam/ring anchoring even after the enemy moves or dies. Both cells are
needed: `targetToCell` is omitted from the naive payload, but the reconstruction formula requires it, and by the time an
event is consumed the live enemy has advanced (movement runs before towers act each tick), so its `toCell`/`progress`
are no longer the fire-time values — the fire-time cells must travel with the event. Reading all three is race-free:
enemies are filtered only *after* all towers act (`tickTowers` → the `world.enemies` reassignment), so the target still
exists at the moment the event is captured.

### D6: Effects keyed to sim time, not wall-clock

Beam/muzzle/hit-ring lifetimes are derived from the shot event's `tick` (a presentation-side schedule in sim time), so
future pause/replay/slow-mo stay coherent without the sim modeling visuals. This keeps the beam a *projection of the
shot fact*, not a second simulated object. In practice the effect layer runs **two clocks**: transient combat effects
(beam, muzzle, hit-ring) age against `world.tickCount`, while input-driven UI effects (placement-rejection floats and
cell pulses) keep wall-clock `dtMs`, since they originate from player gestures between ticks, not from simulation
events.

Presentation-side aging: combat effects (beam, muzzle, hit-ring) track `ageTicks` (integer) and age against
`world.tickCount − lastTickCount` each frame, where `lastTickCount` is a closure-local watermark seeded to
`world.tickCount` at scene-view creation. Effects with `ageTicks ≥ TTL_TICKS` are removed. This runs separately from
the wall-clock `dtMs` aging used by input-driven UI effects (placement-rejection floats and cell pulses). Ordering
within `sceneView.update`: drain events → spawn effects → draw → ack (ack last, so the sim never reclaims a not-yet-
spawned event).

**Alternatives considered:**

- Simulated projectile entities: rejected for now — the spec states instant damage ("projectiles and hit effects are
  presentation only"). If dodgeable travel time is ever wanted, THAT becomes a simulated entity with its own events,
  evaluated under `towers-combat`/`enemy-waves`.

### D7: Persistent signaling reads world state; transient effects read events

Rotation, tether, and target markers poll world state (`tower.targetId`, resolved to the enemy's **interpolated drawn
position**: `from + (to − from) × progress`) each frame — the same mechanism rendering already uses, no event needed.
Only transient one-shots (beam, muzzle, hit-ring) come from outbox events. Beam endpoints and the hit-ring both
reconstruct the fire-time pixel position from the event's `targetCell` + `targetToCell` + `targetProgress` (D5); the
hit-ring is the only component that falls back to `targetCell` pixel-center for a dead enemy whose `targetId` is
unresolvable.

One caveat: `tower.targetId` can briefly reference a just-killed enemy (it is recomputed only on the next tick), so
target resolution treats an unresolvable id as "no target" rather than erroring — a one-frame tether gap after a kill is
expected.

### D8: Per-tower identity is redundant — accent color is enhancement, not the carrier

Identity is keyed by the tower's (unified) id so it never shifts as other towers are placed or die. Each placed tower is
assigned **two** stable cues, both by `id % N`:

- an **accent color** from a fixed palette, and
- a **tether line pattern** (solid, long-dash, short-dash, dash-dot, dotted) and matching **enemy marker glyph** (ring,
  dot, diamond, square, triangle).

**Color is deliberately NOT load-bearing.** The existing palette (enemies `0xff8787 / 0xffd43b / 0x74c0fc / 0xb197fc /
0x63e6be`, hp `0x51cf66 / 0xffa94d / 0xff6b6b`, coverage `0x74c0fc`, tower `0xf59f00`, hover `0xffffff`) already fills
the hue wheel, so a CVD-simulation sweep (Machado 2009, deuteranopia/protanopia/tritanopia) shows no 5-hue accent set
can stay distinguishable from it for color-blind players — e.g. the original accent periwinkle `0x88aaff` is ΔE≈1.3 from
enemy periwinkle `0xb197fc`, and lime `0xb3e633` is ΔE≈4.9 from enemy yellow `0xffd43b`, under red-green CVD. Identity
therefore rides the **pattern + luminance + structural** channels (all decodable in grayscale) and color is a secondary,
best-effort enhancer. Full rationale and the reserved-color table live in `docs/visual-language.md`.

The working accent set, chosen by CVD sweep (Machado 2009, deuteranopia/protanopia/tritanopia, CIE Lab) and verified by
the checked-in `npm run cvd-check` tool, recorded concretely so it is not re-litigated. The reserved set used by the tool
includes every readable game color, **including the enemy-fallback gray `0xadb5bd`** (an earlier hand-check that omitted
it proved too optimistic and was caught by the tool):

| Role | Hue | Luma | vs-reserved min | vs-accent min |
|------|-----|------|-----------------|---------------|
| cyan | `0x22d3ee` (kept) | 0.531 | 6.5 (enemy teal `0x63e6be`) | 23 |
| magenta | `0xcc55ff` (kept) | 0.266 | 16.2 (enemy `0xb197fc`) | 35 |
| rose | `0xee2d8a` (deep-end rose; replaces `0xff55aa`) | 0.219 | 16.3 (hp-low) | 20 |
| spring green | `0xb8e986` (replaces lime) | 0.702 | 11.0 (hp-full green) | 33 |
| teal | `0x0d9aa3` (replaces periwinkle, retuned) | 0.258 | 13.8 (fallback gray) | 20 |

The original accents that vanished against the enemy palette under red-green CVD drove the changes: lime `0xb3e633`
(ΔE≈4.9 from enemy yellow `0xffd43b`) and periwinkle `0x88aaff` (ΔE≈1.3 from enemy periwinkle `0xb197fc`). The rose
`0xff55aa` and teal `0x48a0a8` were also tightened because they sat within ΔE 7–11 of the enemy-fallback gray `0xadb5bd`
once it was honestly included in the reserved set. Notably, the **purple/violet family is structurally unavailable** —
kept magenta `0xcc55ff` already owns it (trial violets collide at ΔE 0–2), and the yellow family is taken by enemy
yellow — so the replacements occupy the open cool-green/rose sectors, differentiated by luminance.

Known residual soft spots (accepted, carried by pattern + glyph + luminance):
- cyan `0x22d3ee` vs enemy teal `0x63e6be` (ΔE 6.5) — the single unavoidable corner; cyan is the canonical accent blue
  and enemy teal is in the enemy palette;
- spring green `0xb8e986` vs hp-full green `0x51cf66` (ΔE 11.0) — right at the threshold, but the HP bar is not where a
  target marker lands.

These are documented rather than hidden; `npm run cvd-check` will flag them if the palette is ever revisited. The
guarantee that "several towers' target links read correctly" comes from patterns + glyphs + luminance, not these hues
(D8 principle).

The accent appears in three places — tower accent ring, tether (with its pattern), enemy marker (with its glyph) —
forming the mapping triangle for focus fire.

**Alternatives considered:**

- Color by index among live towers: rejected — shifts when any tower is placed or killed, flickering identity.
- Color by tower type: rejected — type identity is shapes (D9), and shared-type towers would be indistinguishable.
- Color-only identity with a tuned palette, no patterns: rejected — impossible per the CVD sweep above; a color-blind
  player would lose focus-fire decomposition entirely.
- A color-blind "mode" that swaps the palette: rejected — redundant coding works for *all* vision types simultaneously,
  so no mode, preference, or settings surface is needed.

### D9: Tower shapes resolve by typeId from the balance registry

Mirror `resolveEnemyVisuals`: presentation maps `typeId → shape` (triangle today; future types add shapes) so type reads
without color. Shapes are looked up per frame with a default fallback for unknown ids.

**Caveat:** hot-applying tower balance data can rename/insert types mid-run. Index-ordered mapping (as enemies use)
would shift a *persisted* tower's shape, so the key is the stable `typeId` string; a renamed type may transiently show
the default shape until reload — accepted, matching the ephemeral-vs-persistent asymmetry (enemies are ephemeral, towers
persist).

### D10: Trim and drain are O(1)-ish, keyed on id

Store events in an array; trimming **recycles physical storage** (per D1, event identity is the never-resetting id, so a
recycled slot never aliases an event). Today that means a monotonic head offset instead of splicing: the consumer tracks
the last drained event id, and each tick discards entries ≤ the acknowledged cursor by advancing the head. The public
surface exposes only live (untrimmed) events oldest-first. A future ring buffer is a drop-in swap covered by D1/D2. No
per-frame allocation beyond the graphics themselves.

### D11: Outbox surface (sketch)

A concrete shape for the tasks to implement against. The event type lives in the simulation package and is typed to
hold sim-safe values only (no pixi/DOM types — the existing lint restrictions enforce this):

```ts
// src/simulation/events.ts (new) — pure, no rendering imports
interface CombatEvent {
  kind: 'shot';
  id: number;          // monotonic, never-resetting identity (D1) — the trim/ack/order key
  tick: number;        // world.tickCount when the attack landed
  towerId: number;     // unified entity id (D4)
  targetId: number;    // unified entity id (D4)
  targetCell: AxialCoord;      // target.fromCell at fire time — kill-safe anchor (D5)
  targetToCell: AxialCoord;    // target.toCell at fire time — completes the fire-time anchor (D5)
  targetProgress: number;      // enemy hop progress [0,1) at fire time — reconstructs fire-time pixel position (D5)
}
```

```ts
// World additions (sketch)
combatEvents: readonly CombatEvent[]; // live, untrimmed, oldest-first (trimming recycles below the head)
emitShot(event: Omit<CombatEvent, 'id'>): void; // appends with monotonic id; called by tickTowers — no new import into towers.ts (see note)
ackEvents(upToId: number): void;                 // monotonically advancing only (D1/D2)
```

Trim at the top of each tick advances an internal head offset to the acknowledged cursor; the drain side is a
presentation-watermark helper (task 2.2) that reads from its own cursor to the current outbox head. Because the public
array only exposes live events, event ids are still the ordering/identity key even after compaction (D1).


**Import-cycle note:** `towers.ts` already receives `world` as a parameter and type-imports `World` only (no runtime
cycle with `world.ts`). The `emitShot` method on `World` lets `tickTowers` append events without a value import into
`towers.ts`, preserving the one-way runtime dependency (`world.ts → towers.ts`). Task 1.3 must not introduce a value
import of anything from `world.ts` into `towers.ts`.

### D12: Persistent orientation easing is sim-time, not wall-clock

The persistent aim rotation and idle-settle are neither transient combat effects nor input-driven UI gestures — they
poll `tower.targetId` every frame (D7). To stay coherent with the same pause/replay/slow-mo rationale D6 applies to
combat effects, orientation easing advances on the **sim clock** (aged against `world.tickCount`, same mechanism as the
transient effects), NOT wall-clock `dtMs`. A paused/slowed world must not keep easing towers toward stale targets.

The concrete geometry: neutral orientation is **pointing up (−Y in pixel space)**, equal to the triangle's authored pose
(`drawTriangle` apex at top, sceneView.ts). Aim angle is computed from the tower's pixel center to the target's
**interpolated drawn position** (`from + (to − from) × progress`, D7), rotating the tower around its own center. The
degenerate case (target sharing the tower's cell, or an unresolvable just-killed `targetId` treated as no-target) holds
the prior angle / eases to neutral rather than erroring (task 2.1).

**Alternatives considered:**

- Ease on wall-clock `dtMs`: rejected — breaks coherence with future pause/slow-mo; a frozen world would keep animating
  towers.
- No easing (snap to target): rejected — the spec requires an eased turn and an idle settle.

### D13: Per-tower identity is booked by id as (color, pattern, glyph)

D8 assigns each tower a stable accent color, tether dash pattern, and enemy marker glyph, all keyed by `id % N`. This
decision records that these are **booked as one identity object per tower** at placement time (parallel lists are kept in
sync by the same `id % N`), so the three cues always travel together and can never drift out of phase. Rotation,
tether, and marker read this book; transient on-fire beams reuse the tower's color for the bright layer (D7).

### D14: A persistent `docs/visual-language.md` codifies the palette rules

Add a new repo doc recording: (a) the full reserved color table (every current color constant and what it means), (b)
the redundant-coding principle from D8 (identity rides pattern+luminance+structure; color is enhancement), and (c) the
CVD-simulation gate (Machado 2009 deuteranopia/protanopia/tritanopia) as the standard check for any new color, so future
visual work does not re-litigate palette collisions. The gate is backed by a checked-in `scripts/cvd-check.mjs` tool
wired as `npm run cvd-check` (zero-dependency Node, no test-framework or build involvement; `scripts/` is excluded from
ESLint because it is standalone dev tooling, not app source). Keeping the tool's `RESERVED`/`ACCENTS` tables in lock-step
with the doc and D8 is what keeps the check honest — it must be re-runnable, not a one-off. This change adds the doc and
tool and makes `combat-feedback` its first consumer.

### D15: Space/geometry is a live third structural channel — enemy-marker fan-out

Alongside pattern (tether dash) and glyph (enemy marker shape), spatial **geometry** is a third, CVD-independent
decoder, and it is **in scope now**, not deferred. On the shipped slice (11×11 hex, arrow towers with rangeHops 2 — a
~18-hex footprint per tower), **3–4 towers on one enemy is the normal choke-point play**, not an edge case. At that
density, pattern+glyph demands the player cross-match a dash style at one end to a glyph shape at the other across
space; positional offset makes the decomposition visual instead of cognitive.

**Rule (deterministic by id, applied to every tower):** each tower's enemy marker (and its tether endpoint) sits at a
fixed offset around the enemy's center. The offset is derived from the tower's unified id, so it is stable across frames
and across other towers being placed/removed. When `N` towers share one enemy, their markers fan out as a regular
`N`-polygon around the enemy center (N=1 centered, N=2 left/right, N=3 triangle, N=4 square, …). The radial offset is a
fixed fraction of the enemy visual radius so it stays small at moderate density.

- Presentation-only, no sim change; the offset is a pure, unit-testable helper (given tower id + enemy center + count →
  pixel offset).
- The tether endpoint must follow the marker offset (not the raw enemy center), so the triplet triangle (D17) stays
  spatially coherent.
- Near-collinear tethers at high N are an accepted cosmetic limit; N rarely exceeds 3–4 on this slice, where the polygon
  stays legible.

This supersedes the earlier note that geometry was "deferred until densities rise" — the density the game actually
reaches justifies it now.

### D16: Persistent tether pulse is a phase-keyed dim dot (motion channel)

Beyond geometry, a subtle **always-on motion** decoder makes each link read as a living connection: a single **dim
traveling dash** moves slowly along each tether from tower to enemy. The animation phase is keyed by the tower's id
(`phase = id / N * 2π`), so parallel tethers converge without moving in lockstep — two towers on one enemy show two
dashes at different progress points, decomposing them structurally by **time**, not color.

- Presentation-only: the pulse is drawn in the same `Graphics` pass as the tether (an alpha-brightened segment
  positioned at `tether.length × p(t)` where `p` is a 0→1 sawtooth over a slow period, e.g. ~2s), **no new rendering
  types, no sim change**.
- Sim-time aging: the pulse phase advances on the sim clock (`world.tickCount`), consistent with D6/D12, so pause and
  slow-mo stay coherent.
- Deliberately dim so it never competes with the transient on-fire beam (D6) as the bright layer; the beam remains the
  attack accent, the pulse the persistent "is linked" signal.
- Phase-by-id is the identity carrier; intensity is tuning, not spec.

(Channel 6, textual identity tags A/B/C, is deliberately omitted — pattern + glyph + geometry + pulse already decompose
the mapping without adding permanent text clutter.)

### D17: The mapping triangle topology is explicit

The tower accent ring, the tether, and the enemy marker form a spatial **triangle** per-link; D17 records the rendering
conventions that keep that triangle coherent and readable:

- The tether always connects the **tower center** to the **marker offset point** (D15), not to the raw enemy center once
  any offset applies, so the triangle never "floats" off its glyph.
- Z-order: persistent layers draw enemies then towers then markers/tethers, with the transient beam (`fxG`) on top as the
  bright attack layer (already the case; stated here so it is not regressed).
- When several towers share one enemy, the radiating triangles are the focus-fire signature — geometry (D15) guarantees
  their glyph endpoints are separable, pulse (D16) guarantees they differ in time, and pattern/color (D8) guarantee
  identity at each corner.

### D18: The reserved CVD set must be complete / honest; soft spots are recorded, not hidden

Two lessons from building the CVD gate that should not need re-learning:

- **The reserved set must include every readable game color, not just enemy bodies.** An early "verified" claim on this
  palette omitted the enemy-fallback gray `0xadb5bd`; when it was honestly added, two accent hues (rose `0xff55aa`,
  teal `0x48a0a8`) fell within ΔE 7–11 of it and had to be deepened (→ `0xee2d8a`, `0x0d9aa3`). Omitting a reserved color
  makes the gate look "safer" than it is.
- **Residual soft spots are recorded, not hidden.** The final set still has two (cyan `0x22d3ee` vs enemy teal `0x63e6be`
  ΔE 6.5; spring green `0xb8e986` vs hp-full green `0x51cf66` ΔE 11.0). They are accepted and documented, and the tool
  will flag them again if the palette is touched — so "passing the gate" is a moving, explicit baseline rather than a
  silent assumption. Per D8, color is never the load-bearing channel, so residual hue soft spots are tolerable by design.

## Risks / Trade-offs

- **[Risk] Hidden/throttled tab stalls the render loop** → ACK pauses, so the outbox grows during the catch-up window.
  Mitigation: `main.ts` already caps catch-up ticks; the outbox is bounded by "work since last ack", which resets on
  resume. Revisit with backpressure only if profiling shows real growth.
- **[Risk] Replay is forfeited once events are pruned** → Accepted constraint (Non-Goals). If replay is ever needed,
  gate pruning behind a persistence mode rather than removing it.
- **[Risk] Persistent tethers web up with many towers** → Lines are faint and short (tower→target only); focus fire is
  decomposed by marker **geometry** (D15 fan-out), a **de-phased pulse** (D16), tether **patterns** + marker **glyphs**
  + accent colors (D8). Alpha/threshold are tuning levers in `combat-feedback`, not spec.
- **[Risk] Accent hues still collide with an existing hue under some color-vision type** → Accepted by design (D8): color
  is enhancement only; identity is guaranteed by pattern + luminance + structure, which decode in grayscale. The worst
  hue pairs (periwinkle↔enemy periwinkle, lime↔enemy yellow) are excluded regardless; the CVD sweep in
  `docs/visual-language.md` is the tuning reference.
- **[Risk] Sim-module HMR (world.ts/towers.ts edit) on a carried world** → The carried world keeps running its old
  closures (no outbox) until a full reload; harmless but the new feature is inert. Accepted dev limitation — task 4.2
  exercises only rendering-module swaps; sim edits require a reload.
- **[Risk] `sceneView` grows and has no test coverage today** → Extract pure helpers (aim geometry incl. the degenerate
  self-cell case; event drain/watermark; identity booking) into modules with headless unit tests.
- **[Risk] Live tower-type edits re-style a placed tower's shape** → Accepted per D9 caveat; same behavior enemies
  already exhibit.

## Open Questions

- None blocking. Feel-level levers (idle-settle speed, beam TTL/alpha, exact accent hues / dash-pattern styling, **pulse
  rate/alpha**, **fan-out marker radius**) are treated as tuning, not design or spec — subject to the CVD gate in
  `docs/visual-language.md` (D14).
