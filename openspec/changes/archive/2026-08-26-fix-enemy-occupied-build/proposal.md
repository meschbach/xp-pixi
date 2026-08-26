## Why

A player can soft-lock the game by building a tower on a cell an enemy is currently occupying. The race condition: player selects a cell, enemy moves onto it, player confirms build. The placement validation only checks `cell.blocked` (towers/rocks) — an enemy standing on an unblocked cell is invisible to it. The tower is created, the enemy is trapped inside, the tower can't attack it (its own cell is excluded from coverage), and future builds fail with "path must stay open" because the stranded enemy blocks path validation.

## What Changes

- **Reject tower placement when an enemy is on the target cell.** A living enemy present on a tile — whether settled on it or arriving at it — makes the tile ineligible for tower placement. This is the primary guard.
- **Tower coverage includes its own cell.** A tower can target enemies on the same tile it occupies. This is a defensive fallback: the primary guard prevents the common case, but this closes a gap for any edge case where an enemy ends up on a tower's cell.
- **Targeting handles self-cell enemies.** `selectTarget` special-cases the tower's own cell so the self-coverage fallback actually works (the distance field returns `undefined` for blocked cells, which would otherwise silently skip the enemy).
- **Preview cache refreshes with enemy movement.** The placement preview cache key includes `world.tickCount` so hover feedback stays in sync as enemies move across the board.

## Capabilities

### Modified Capabilities

- `towers-combat`: Three requirement changes — (1) placement validation adds an enemy-presence check as a new rejection reason, (2) tower coverage includes the tower's own cell (zero-hop coverage), (3) targeting handles enemies on the tower's own cell.

## Impact

- **Placement validation** — new enemy-presence check and rejection reason
- **Tower coverage** — self-cell included in coverage set
- **Tower targeting** — self-cell enemy special case
- **Player feedback** — new rejection message for enemy-present case
- **Placement preview** — cache refreshes every tick during hover
- **Existing tests** — coverage test updated, new test cases added
