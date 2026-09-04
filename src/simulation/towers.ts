import type { AxialCoord } from './hex';
import { cellKey, sameCell } from './hex';
import type { GameMap } from './map';
import { unblockedNeighbors } from './map';
import { distanceTo } from './distanceField';
import type { Enemy, World } from './world';

/**
 * Tower model, path-aware coverage (design D9), and the damage pipeline.
 * Coverage is the set of cells reachable from the tower within its hop
 * radius through unblocked cells — never a geometric ring.
 */

export interface Tower {
  id: number;
  typeId: string;
  cell: AxialCoord;
  /** Runtime stats resolved from the registry at placement. */
  damage: number;
  rangeHops: number;
  cooldownTicks: number;
  /** Ticks until this tower may fire again; runs regardless of targets. */
  cooldownRemaining: number;
  targetId: number | null;
  coverage: Set<string>;
}

/**
 * BFS ≤ rangeHops through unblocked cells, excluding the origin (a tower's
 * own tile is blocked). Deterministic: follows adjacency order.
 */
export function computeCoverage(map: GameMap, from: AxialCoord, rangeHops: number): Set<string> {
  const coverage = new Set<string>();
  if (rangeHops < 1) {
    return coverage;
  }

  const originKey = cellKey(from);
  coverage.add(originKey);
  const visited = new Set<string>([originKey]);
  // Queue of [coord, depth]; index-based dequeue keeps this allocation-light.
  const queue: Array<[AxialCoord, number]> = [[from, 0]];
  for (let head = 0; head < queue.length; head++) {
    const [coord, depth] = queue[head]!;
    if (depth >= rangeHops) {
      continue;
    }
    for (const n of unblockedNeighbors(map, coord)) {
      const key = cellKey(n);
      if (visited.has(key)) {
        continue;
      }
      visited.add(key);
      coverage.add(key);
      queue.push([n, depth + 1]);
    }
  }
  return coverage;
}

export function recomputeTowerCoverage(tower: Tower, map: GameMap): void {
  tower.coverage = computeCoverage(map, tower.cell, tower.rangeHops);
}

/** Board-change hook: any blocked-set change recomputes every tower's region (spec). */
export function recomputeAllCoverage(world: World): void {
  for (const tower of world.towers) {
    recomputeTowerCoverage(tower, world.map);
  }
}

/**
 * Target selection among covered enemies: smallest finite distance-to-goal,
 * ties broken deterministically by earliest acquisition (lowest enemy id).
 */
export function selectTarget(world: World, tower: Tower): Enemy | undefined {
  let best: Enemy | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const enemy of world.enemies) {
    if (enemy.hp <= 0 || !tower.coverage.has(cellKey(enemy.fromCell))) {
      continue;
    }
    if (sameCell(enemy.fromCell, tower.cell)) {
      return enemy;
    }
    const d = distanceTo(world.distanceField, enemy.fromCell);
    if (d === undefined) {
      continue; // unreachable from goal — cannot rank meaningfully
    }
    if (d < bestDist || (d === bestDist && best !== undefined && enemy.id < best.id)) {
      best = enemy;
      bestDist = d;
    }
  }
  return best;
}

/**
 * One combat step per tower:
 * - the local cooldown always ticks down, target or not (retargeting never
 *   resets it — spec: cooldowns are tower-local and target-independent);
 * - when elapsed and a covered target exists, damage lands immediately on
 *   this tick; projectiles are presentation only.
 */
export function tickTowers(world: World): void {
  for (const tower of world.towers) {
    if (tower.cooldownRemaining > 0) {
      tower.cooldownRemaining -= 1;
    }

    const target = selectTarget(world, tower);
    tower.targetId = target ? target.id : null;

    if (target && tower.cooldownRemaining <= 0) {
      tower.cooldownRemaining = tower.cooldownTicks;
      // Publish the ground-truth shot fact (design D5). Damage still lands
      // instantly on this tick; projectiles / hit effects are presentation
      // only. The world method appends with a monotonic id (no new import).
      world.emitShot({
        kind: 'shot',
        tick: world.tickCount,
        towerId: tower.id,
        targetId: target.id,
        targetCell: target.fromCell,
        targetToCell: target.toCell,
        targetProgress: target.progress,
      });
      target.hp -= tower.damage;
      if (target.hp <= 0) {
        world.creditMoney(target.killReward);
      }
    }
  }

  if (world.enemies.some((e) => e.hp <= 0)) {
    world.enemies = world.enemies.filter((e) => e.hp > 0);
  }
}
