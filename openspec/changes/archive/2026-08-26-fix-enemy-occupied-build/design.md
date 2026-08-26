## Context

Placement validation is a pure function (`checkPlacement`) that never mutates the world — it returns a rejection reason or a pre-computed distance field. The existing checks test bounds, buildability, `blocked` status (towers and authored obstacles), level markers, path reachability via BFS flood, and affordability. The validation pipeline is in `src/simulation/placement.ts`, well-tested.

Tower coverage is computed by BFS from the tower through unblocked cells within its hop radius. The tower's own cell is excluded from coverage — it is added to the visited set but never to the coverage set. Coverage is recomputed after every tower placement. The targeting function selects the covered enemy closest to the goal. Both live in `src/simulation/towers.ts`.

The simulation layer is pure TypeScript with no rendering dependencies — headless-testable. Enemy movement is handled separately (`src/simulation/world.ts`), advancing enemies one tick at a time via greedy descent on the distance field.

## Goals / Non-Goals

**Goals:**
- Prevent building a tower on a cell occupied by an enemy (primary guard)
- Ensure a tower can attack enemies on its own cell (defensive fallback)
- Minimal, localized changes with no new dependencies or data model changes

**Non-Goals:**
- Changing enemy movement semantics (enemies don't block each other, and that's by design)
- Adding a new cell type or occupancy model
- Reworking the broader pathfinding or distance field system

## Decisions

### D1: Enemy-present check runs before path reachability

The new enemy check goes right after the existing `blocked` check in `checkPlacement`, before the reachability flood. This is cheaper (no BFS needed) and provides a clearer rejection reason. The path checks remain as a secondary safety net for cases not involving direct cell occupancy.

**Alternatives considered:**
- Adding enemy presence into the reachability flood: rejected because it conflates two distinct concerns (structural path integrity vs. tactical cell occupancy) and would need a new reason code anyway.

### D2: Check both `fromCell` and `toCell`

An enemy mid-hop has `fromCell` at its origin and `toCell` at its destination. Visually the enemy is between cells. If the player builds on `toCell`, the enemy will arrive into a blocked cell on the next tick. Checking both `fromCell` and `toCell` catches this. The cost is trivially small (one extra `sameCell` per enemy).

**Alternatives considered:**
- Only checking `fromCell`: would miss the mid-hop race where the enemy is visually on the destination cell.
- Only checking `toCell`: would miss the idle case where `fromCell == toCell`.

### D3: New rejection reason `enemy-present`

A dedicated reason (`'enemy-present'`) keeps the rejection taxonomy clean and allows a distinct player-facing message. The message "Enemy in the way" is clear and actionable (wait a moment, then build).

### D4: Tower coverage includes its own cell

`computeCoverage` adds the tower's origin cell to the coverage set before BFS. Since the tower's own cell is `blocked`, `unblockedNeighbors` won't re-add it — no duplication concern. This is a defensive measure: the primary guard (D1/D2) prevents the common case, but if an enemy somehow ends up on a tower's cell, the tower can still fire.

**Alternatives considered:**
- Only adding the primary guard (D1/D2) without self-coverage: works for the current code, but leaves a theoretical gap. If enemy movement or distance field logic changes in the future, the tower would be unable to attack.

### D5: selectTarget special-cases the tower's own cell

Self-coverage (D4) adds the tower's cell to the coverage set. However, `selectTarget` ranks enemies by `distanceTo(field, enemy.fromCell)` — and the distance field only contains unblocked cells, so a blocked tower cell returns `undefined`, causing the enemy to be silently skipped. A special case in `selectTarget` checks `sameCell(enemy.fromCell, tower.cell)` before the distance ranking and returns the enemy immediately. Only one enemy can occupy a given cell, so no further ranking is needed.

**Alternatives considered:**
- Only adding self-coverage (D4) without fixing targeting: rejected because the fallback would silently fail — coverage says "visible" but targeting says "unrankable."
- Assigning a finite distance to the tower's own cell in the distance field: rejected because it conflates blocked-cell semantics and would affect descent logic.

### D6: Preview cache includes tick count

The placement preview cache key (`inputController.ts`) currently omits enemy positions. Adding `world.tickCount` ensures the preview refreshes every tick while the player hovers a cell, keeping the valid/invalid tint in sync with enemy movement. The cost is negligible — `checkPlacement` is cheap and runs for one cell.

## Risks / Trade-offs

- **[Risk] Player frustration building near enemies** → The check is cell-specific, not area-specific. Players can still build on adjacent cells. The rejection message clearly explains why ("Enemy in the way"). The enemy will move off the cell shortly.
- **[Risk] Self-coverage changes display** → The tower's own cell will now appear in the coverage overlay. This is minor — it's the cell the tower sits on, which is already visually occupied. No gameplay impact since enemies can't path through blocked cells in normal play.
