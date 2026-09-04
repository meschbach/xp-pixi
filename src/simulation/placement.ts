import type { AxialCoord } from './hex';
import { cellKey, sameCell } from './hex';
import { computeDistanceField } from './distanceField';
import type { DistanceField } from './distanceField';
import { getBalance } from './registry';
import type { GameMap } from './map';
import { getCell, setBlocked, unblockedNeighbors } from './map';
import { recomputeAllCoverage } from './towers';
import type { World } from './world';

export type PlaceResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'run-not-active'
        | 'out-of-bounds'
        | 'not-buildable'
        | 'blocked'
        | 'enemy-present'
        | 'level-marker'
        | 'unaffordable'
        | 'would-seal-spawn'
        | 'would-strand-enemy';
    };

export type PlacementIssue = Exclude<PlaceResult, { ok: true }>['reason'];

export type PlacementCheck = { ok: true; field: DistanceField } | { ok: false; reason: PlacementIssue };

const fail = (reason: PlacementIssue): PlaceResult => ({ ok: false, reason });

/** The tower type placements use when no explicit type is given (single-type slice). */
export function getDefaultTowerTypeId(): string {
  const first = getBalance().towers.keys().next();
  if (first.done) {
    throw new Error('placement: balance data defines no towers');
  }
  return first.value;
}

/**
 * Flood from the goal across unblocked cells while pretending `excluded` is
 * blocked — without mutating the map, so previews can probe reachability.
 */
function reachabilityExcluding(map: GameMap, excluded: AxialCoord): Set<string> {
  const reachable = new Set<string>([cellKey(map.goal)]);
  const queue: AxialCoord[] = [map.goal];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const n of unblockedNeighbors(map, current)) {
      if (sameCell(n, excluded)) {
        continue;
      }
      const key = cellKey(n);
      if (!reachable.has(key)) {
        reachable.add(key);
        queue.push(n);
      }
    }
  }
  return reachable;
}

/**
 * Validates a placement without mutating anything (design D4):
 * buildable + unoccupied by tower or level marker + affordable, then
 * reachability — the spawn must still reach the goal with the cell blocked,
 * and while enemies are alive no living enemy's cell may lose its route.
 * On success returns the distance field the commit should adopt; callers
 * still own spending money and applying board changes.
 */
export function checkPlacement(world: World, cell: AxialCoord, cost: number): PlacementCheck {
  const target = getCell(world.map, cell);
  if (!target) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  if (!target.buildable) {
    return { ok: false, reason: 'not-buildable' };
  }
  if (target.blocked) {
    // Authored obstacle or an existing tower occupies the tile.
    return { ok: false, reason: 'blocked' };
  }
  if (world.enemies.some((e) => e.hp > 0 && (sameCell(e.fromCell, cell) || sameCell(e.toCell, cell)))) {
    return { ok: false, reason: 'enemy-present' };
  }
  if (sameCell(cell, world.map.spawn) || sameCell(cell, world.map.goal)) {
    return { ok: false, reason: 'level-marker' };
  }

  const reachable = reachabilityExcluding(world.map, cell);
  if (!reachable.has(cellKey(world.map.spawn))) {
    return { ok: false, reason: 'would-seal-spawn' };
  }
  if (world.enemies.some((e) => !reachable.has(cellKey(e.fromCell)))) {
    return { ok: false, reason: 'would-strand-enemy' };
  }
  if (world.money < cost) {
    return { ok: false, reason: 'unaffordable' };
  }
  return { ok: true, field: computeDistanceFieldAfterBlock(world.map, cell) };
}

function computeDistanceFieldAfterBlock(map: GameMap, cell: AxialCoord): DistanceField {
  setBlocked(map, cell, true);
  try {
    return computeDistanceField(map);
  } finally {
    setBlocked(map, cell, false);
  }
}

/**
 * Validates and applies a tower placement (design D4). On success the tile
 * blocks, the distance field is recomputed once, and every tower's coverage
 * is refreshed. Rejections leave the world completely untouched.
 */
export function tryPlaceTower(world: World, cell: AxialCoord, typeId?: string): PlaceResult {
  if (world.state !== 'running') {
    return fail('run-not-active');
  }

  const def = getBalance().towers.get(typeId ?? getDefaultTowerTypeId());
  if (!def) {
    throw new Error(`tryPlaceTower: unknown tower type "${typeId}"`);
  }

  const check = checkPlacement(world, cell, def.cost);
  if (!check.ok) {
    return fail(check.reason);
  }

  if (!world.trySpend(def.cost)) {
    return fail('unaffordable');
  }

  // Commit: derived state refreshes exactly once per placement.
  setBlocked(world.map, cell, true);
  world.distanceField = check.field;
  world.towers.push({
    id: world.nextEntityId++,
    typeId: def.id,
    cell: { ...cell },
    damage: def.damage,
    rangeHops: def.rangeHops,
    cooldownTicks: def.cooldownTicks,
    cooldownRemaining: 0,
    targetId: null,
    coverage: new Set<string>(),
  });
  recomputeAllCoverage(world);
  return { ok: true };
}
