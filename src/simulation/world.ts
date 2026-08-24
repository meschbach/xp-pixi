import type { AxialCoord } from './hex';
import { lexLess, sameCell } from './hex';
import { TICK_RATE_HZ } from './clock';
import { computeDistanceField, distanceTo } from './distanceField';
import type { DistanceField } from './distanceField';
import type { GameMap } from './map';
import { unblockedNeighbors } from './map';
import { startWave, tickSpawner } from './waves';
import type { PendingSpawn } from './waves';
import { tickTowers } from './towers';
import type { Tower } from './towers';

/** Fixed simulation rate (design D6). Rendering reads state; it never advances it. */
export { TICK_RATE_HZ };

export type RunState = 'running' | 'lost' | 'victory';

/**
 * Wave progression states. `awaiting-start` holds until the player triggers
 * the first wave; subsequent waves advance automatically through
 * `intermission` back to `active`. `complete` marks a finished campaign.
 */
export type WavePhase = 'awaiting-start' | 'active' | 'intermission' | 'complete';

export interface EnemySpec {
  /** Balance-data type this enemy belongs to; presentation uses it for visuals. */
  typeId?: string;
  hp: number;
  /** Cells per second. */
  speed: number;
  killReward: number;
}

export interface Enemy extends EnemySpec {
  id: number;
  maxHp: number;
  /** Logical cell — consulted by targeting, coverage, and leak detection. */
  fromCell: AxialCoord;
  toCell: AxialCoord;
  /** Progress along the committed hop, in [0, 1). */
  progress: number;
  /** Index of the wave that spawned this enemy (-1 for untagged spawns). */
  waveIndex: number;
}

export interface WorldOptions {
  map: GameMap;
  startingMoney: number;
  startingLives: number;
}

export interface World {
  map: GameMap;
  distanceField: DistanceField;
  money: number;
  lives: number;
  state: RunState;
  enemies: Enemy[];
  tickCount: number;
  nextEnemyId: number;

  wavePhase: WavePhase;
  /** Index into the balance-data wave list; -1 before the first wave starts. */
  currentWaveIndex: number;
  pendingSpawns: PendingSpawn[];
  /** Intermission countdown in ticks (0 when not counting down). */
  ticksToNextWave: number;

  towers: Tower[];
  nextTowerId: number;

  /** Advances the simulation by one fixed tick (1 / TICK_RATE_HZ seconds). */
  tick(): void;
  /**
   * Player action: starts the first wave. Only valid while the run awaits
   * its start; later waves begin automatically after a clear.
   */
  requestStartWave(): boolean;
  /** Spawns an enemy at the map's spawn cell. No-op once the run is lost or won. */
  spawnEnemy(spec: EnemySpec, waveIndex?: number): void;
  /** Credits money (kill rewards, wave bonuses). */
  creditMoney(amount: number): void;
  /** Attempts to pay `amount`; returns false (unchanged) when unaffordable. */
  trySpend(amount: number): boolean;
}

export function createWorld(options: WorldOptions): World {
  const world: World = {
    map: options.map,
    distanceField: computeDistanceField(options.map),
    money: options.startingMoney,
    lives: options.startingLives,
    state: 'running',
    enemies: [],
    tickCount: 0,
    nextEnemyId: 1,

    wavePhase: 'awaiting-start',
    currentWaveIndex: -1,
    pendingSpawns: [],
    ticksToNextWave: 0,

    towers: [],
    nextTowerId: 1,
    tick() {
      tickWorld(world);
    },
    requestStartWave() {
      return requestStartWave(world);
    },
    spawnEnemy(spec, waveIndex = -1) {
      spawnEnemy(world, spec, waveIndex);
    },
    creditMoney(amount) {
      world.money += amount;
    },
    trySpend(amount) {
      if (world.money < amount) {
        return false;
      }
      world.money -= amount;
      return true;
    },
  };
  return world;
}

function tickWorld(world: World): void {
  if (world.state !== 'running') {
    return; // loss/victory halts gameplay
  }
  world.tickCount++;

  const survivors: Enemy[] = [];
  for (const enemy of world.enemies) {
    if (advanceEnemy(world, enemy)) {
      survivors.push(enemy);
    }
    // A leak that zeroes lives ends the run after this tick resolves.
  }
  world.enemies = survivors;

  // Towers act after movement (logical cells are fresh); the spawner runs last
  // so clear detection sees this tick's kills and leaks alike.
  tickTowers(world);
  tickSpawner(world);

  if (world.lives <= 0) {
    world.state = 'lost';
  }
}

function requestStartWave(world: World): boolean {
  if (world.state !== 'running' || world.wavePhase !== 'awaiting-start') {
    return false;
  }
  startWave(world, 0);
  return true;
}

function spawnEnemy(world: World, spec: EnemySpec, waveIndex = -1): void {
  if (world.state !== 'running') {
    return;
  }
  const spawn = world.map.spawn;
  world.enemies.push({
    id: world.nextEnemyId++,
    typeId: spec.typeId,
    hp: spec.hp,
    maxHp: spec.hp,
    speed: spec.speed,
    killReward: spec.killReward,
    fromCell: { ...spawn },
    toCell: { ...spawn },
    progress: 0,
    waveIndex,
  });
}

/**
 * Advances one enemy by a single tick's worth of movement.
 * Returns false when the enemy leaked into the goal (and must be removed).
 *
 * Semantics per design D4/D6:
 * - logical cell stays `fromCell` until the hop completes;
 * - a committed hop always finishes, even if the field changed mid-step;
 * - descent is re-evaluated only on arrival;
 * - no lower-distance unblocked neighbor => hold position.
 */
function advanceEnemy(world: World, enemy: Enemy): boolean {
  if (sameCell(enemy.toCell, enemy.fromCell)) {
    // Idle: pick the next hop before consuming movement budget.
    const target = descentTarget(world, enemy.fromCell);
    if (!target) {
      return true; // sealed in: hold position
    }
    enemy.toCell = target;
  }

  enemy.progress += enemy.speed / TICK_RATE_HZ;

  while (enemy.progress >= 1) {
    enemy.fromCell = enemy.toCell;
    enemy.progress -= 1;

    if (sameCell(enemy.fromCell, world.map.goal)) {
      world.lives -= 1; // leak
      return false;
    }

    const next = descentTarget(world, enemy.fromCell);
    if (!next) {
      // Committed arrival into a now-sealed cell: hold until the field restores a route.
      enemy.toCell = { ...enemy.fromCell };
      enemy.progress = 0;
      break;
    }
    enemy.toCell = next;
  }

  return true;
}

/**
 * Chooses the unblocked neighbor with the lowest finite distance-to-goal,
 * strictly descending. Ties break deterministically by axial order (q, then r).
 */
function descentTarget(world: World, from: AxialCoord): AxialCoord | undefined {
  const current = distanceTo(world.distanceField, from);
  if (current === undefined || current === 0) {
    return undefined;
  }

  let best: AxialCoord | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const n of unblockedNeighbors(world.map, from)) {
    const d = distanceTo(world.distanceField, n);
    if (d === undefined || d >= current) {
      continue;
    }
    if (d < bestDist || (d === bestDist && best && lexLess(n, best))) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}
