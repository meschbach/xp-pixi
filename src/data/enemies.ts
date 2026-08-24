import type { EnemyTypeDef } from './types';
import { publishBalancePatch } from '../simulation/balanceChannel';

/** The slice ships exactly two enemy types (design D8): a baseline and a fast one. */
export const ENEMY_TYPES: readonly EnemyTypeDef[] = [
  { id: 'grunt', name: 'Grunt', hp: 3, speedCellsPerSecond: 1.0, killReward: 8 },
  { id: 'runner', name: 'Runner', hp: 2, speedCellsPerSecond: 1.7, killReward: 12 },
];

// Self-accept boundary (design D5): new stats govern the next spawns.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    const enemies = (mod as { ENEMY_TYPES?: readonly EnemyTypeDef[] } | undefined)?.ENEMY_TYPES;
    if (enemies) {
      publishBalancePatch({ enemies });
    }
  });
}
