## 1. Simulation: enemy-present rejection

- [x] 1.1 Add `'enemy-present'` to the `PlaceResult` and `PlacementIssue` types in `src/simulation/placement.ts`
- [x] 1.2 Add enemy-presence check in `checkPlacement` after the `blocked` guard: reject if any living enemy's `fromCell` or `toCell` matches the target cell
- [x] 1.3 Add `'enemy-present'` case to `rejectionMessage` in `src/rendering/placementMessage.ts` — map to `"Enemy in the way"`

## 2. Simulation: tower self-coverage and targeting

- [x] 2.1 In `computeCoverage` in `src/simulation/towers.ts`, add the tower's origin cell to the coverage set before the BFS loop
- [x] 2.2 In `selectTarget` in `src/simulation/towers.ts`, special-case `sameCell(enemy.fromCell, tower.cell)` before the distance-field ranking — return the enemy immediately (only one enemy can occupy a cell)

## 3. Rendering: preview cache

- [x] 3.1 Add `world.tickCount` to the preview cache key in `src/rendering/inputController.ts` so hover preview refreshes every tick while enemies move

## 4. Tests

- [x] 4.1 Add test in `src/simulation/placement.test.ts`: enemy on target cell causes `enemy-present` rejection without charge
- [x] 4.2 Update existing `computeCoverage` test in `src/simulation/towers.test.ts` — expected size increases by 1 (self-cell added to coverage)
- [x] 4.3 Add test in `src/simulation/towers.test.ts`: tower's own cell is in its coverage set
- [x] 4.4 Add test in `src/simulation/towers.test.ts`: tower targets and damages an enemy on its own cell (self-cell targeting via committed hop)

## 5. Verify

- [x] 5.1 Run full test suite to confirm no regressions
- [x] 5.2 Run linter/typecheck
