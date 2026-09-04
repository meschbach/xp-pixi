# Proposal: Tower Target Visuals

## Why

Towers deal damage the same tick they fire — there are no projectiles — and nothing persistently connects a tower to its
target. Today the only signals are a static coverage tint (which says "can reach", not "is aiming") and a white hit-ring
that appears only after damage lands. Players can't tell which enemy a tower is targeting, and when several towers focus
one enemy the combat reads as noise. The game feels opaque at the exact moment it should reward positioning.

## What Changes

- **Introduction of `simulation` as a runtime contract**: the world publishes ground-truth combat events (e.g., a tower
  firing at an enemy) to an outbox that presentation consumes. The outbox is bounded — consumers signal how much they've
  handled and old events are reclaimed, so a long run never grows unboundedly. Replaying past events is out of scope.
- **Introduction of `combat-feedback`, a presentation capability** that makes targeting readable at a glance:
    - every placed tower carries a persistent, stable per-tower identity code: an accent color, a distinct tether line
      pattern, and a matching enemy marker glyph — an accent on the tower, a faint tether to its current target, and a
      matching marker on the targeted enemy — so focus fire reads as "one enemy, several towers"; identity rides
      pattern + glyph + luminance so it stays legible without any color-vision mode;
    - towers visibly point at their target (an eased turn) and settle back toward a neutral orientation when idle;
    - each attack shows a brief muzzle flash and beam tracing the tower→target link, alongside the existing hit-ring;
    - future tower *types* are distinguished by shape, keeping color reserved for the live-target linkage.
- **Amendment to `towers-combat`**: the "projectiles and hit effects are presentation only" clause is updated — an
  attack now publishes a shot fact to the outbox as simulated ground truth, while projectiles and hit effects remain
  presentation-only and damage still lands instantly on the attack tick.

## Capabilities

### New Capabilities

- `simulation`: The simulation runtime contract — fixed-rate discrete stepping, state sampling (consumers never advance
  the world), per-world entity identity, and a bounded ground-truth event outbox with consumer watermarks.
- `combat-feedback`: Presentation of targeting and firing — persistent per-tower target indication, aim orientation with
  idle settle, fire feedback derived from consumed shot events, and type-distinct tower shapes.

### Modified Capabilities

- `towers-combat`: `Requirement: Damage resolution and kill rewards` is modified — each attack publishes a shot fact (
  firing tower, target, tick, target cell) on the attack tick; projectiles and hit effects remain presentation-only.

## Impact

- **Simulation** — `src/simulation/world.ts` (event outbox + unified entity identity), `src/simulation/towers.ts` (
  publish a shot event at the fire point; combat behavior unchanged), `src/simulation/placement.ts` (tower ids from the
  unified per-world counter).
- **Presentation** — `src/rendering/sceneView.ts` (aim orientation, target markers/tether with per-tower identity coding, fire-beam feedback, per-type tower shapes) plus new pure render helpers so that logic stays headless-testable (`sceneView` currently has no tests).
  The existing HP-drop-based hit inference is replaced by the event stream.
- **Docs** — new `docs/visual-language.md` codifying the reserved color table, the redundant-coding principle (identity = pattern + luminance + structure; color is enhancement, so the game is color-blind friendly without a mode), the color-vision-deficiency gate for future colors, and a checked-in `scripts/cvd-check.mjs` tool (`npm run cvd-check`) that re-verifies the palette (design D14).
- **`src/main.ts`** — unchanged (consumer bookkeeping lives inside the view).
- **Tests** — simulation: shot-event emission, outbox boundedness/ack, entity-id uniqueness, world survival across dev
  reloads; presentation: pure helpers for aim geometry and event draining.
- **No new dependencies. No damage, cooldown, targeting-rule, or data-model changes.**
