import type { AxialCoord } from '../simulation/hex';

/** Authored tower stats — human-friendly units (seconds, hops), converted at the registry boundary only. */
export interface TowerDef {
  id: string;
  name: string;
  cost: number;
  rangeHops: number;
  damage: number;
  cooldownSeconds: number;
}

/** Authored enemy stats — speed in cells/sec. */
export interface EnemyTypeDef {
  id: string;
  name: string;
  hp: number;
  speedCellsPerSecond: number;
  killReward: number;
}

/** One timed stream of spawns within a wave; groups run in parallel timelines. */
export interface SpawnGroupDef {
  /** References an `EnemyTypeDef.id`. */
  enemyType: string;
  count: number;
  /** Seconds between consecutive spawns of this group. */
  intervalSeconds: number;
}

export interface WaveDef {
  groups: readonly SpawnGroupDef[];
}

/** Authored map layout; markers consume ordinary tiles (no special cell types). */
export interface MapDef {
  id: string;
  width: number;
  height: number;
  blockedCells?: readonly AxialCoord[];
  spawn: AxialCoord;
  goal: AxialCoord;
}
