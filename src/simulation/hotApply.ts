import { getBalance, onBalanceApplied, patchRawBalance } from './registry';
import type { RawBalance } from './registry';
import { recomputeAllCoverage } from './towers';
import type { World } from './world';

/**
 * Live-tuning apply step (design D5): pushes an edited balance snapshot
 * through the registry's conversion boundary, then treats the change as a
 * pseudo-board-change for derived state — placed towers adopt the new
 * runtime stats and every tower's coverage is recomputed. The distance field
 * is deliberately untouched: cost/damage/cooldown/range never affect pathing.
 */
export function hotApplyBalance(world: World, patch: Partial<RawBalance>): void {
  patchRawBalance(patch);
  refreshTowersFromBalance(world);
}

/**
 * Subscribes a world to future tuning hot-applies (data modules push into
 * the registry asynchronously). Returns the unsubscribe fn; callers must
 * clean up when the world is discarded (rendering-module HMR swaps).
 */
export function subscribeLiveTuning(world: World): () => void {
  return onBalanceApplied(() => refreshTowersFromBalance(world));
}

function refreshTowersFromBalance(world: World): void {
  const balance = getBalance();
  for (const tower of world.towers) {
    const def = balance.towers.get(tower.typeId);
    if (!def) {
      continue;
    }
    tower.damage = def.damage;
    tower.rangeHops = def.rangeHops;
    tower.cooldownTicks = def.cooldownTicks;
  }
  recomputeAllCoverage(world);
}
