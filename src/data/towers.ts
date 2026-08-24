import type { TowerDef } from './types';
import { publishBalancePatch } from '../simulation/balanceChannel';

/** The slice ships exactly one tower type. */
export const TOWER_TYPES: readonly TowerDef[] = [
  { id: 'arrow', name: 'Arrow Tower', cost: 50, rangeHops: 2, damage: 1, cooldownSeconds: 0.9 },
];

// Self-accept boundary (design D5): edits hot-apply to the running game
// through the registry instead of falling back to a full page reload.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const towers = (mod as { TOWER_TYPES?: readonly TowerDef[] } | undefined)?.TOWER_TYPES;
    if (towers) {
      publishBalancePatch({ towers });
    }
  });
}
