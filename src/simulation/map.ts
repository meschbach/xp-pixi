import type { AxialCoord } from './hex';
import { HEX_DIRECTIONS, cellKey, neighborOf } from './hex';

export interface MapSpec {
  /** Number of columns (q ranges over [0, width)) forming a hex rhombus. */
  width: number;
  /** Number of rows (r ranges over [0, height)). */
  height: number;
  /** Authored obstacles: never buildable and blocked for pathing. */
  blockedCells?: readonly AxialCoord[];
  spawn: AxialCoord;
  goal: AxialCoord;
}

export interface GameCell {
  q: number;
  r: number;
  /**
   * Authored buildability. Note that occupancy (towers, level markers)
   * additionally prevents building; see placement validation in the world.
   */
  buildable: boolean;
  /** True when pathing may not traverse this tile (authored obstacle or tower). */
  blocked: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  cells: Map<string, GameCell>;
  spawn: AxialCoord;
  goal: AxialCoord;
}

export function isInBounds(map: Pick<GameMap, 'width' | 'height'>, c: AxialCoord): boolean {
  return c.q >= 0 && c.q < map.width && c.r >= 0 && c.r < map.height;
}

export function getCell(map: GameMap, c: AxialCoord): GameCell | undefined {
  return map.cells.get(cellKey(c));
}

/**
 * Six-way adjacency restricted to cells inside the map. Deterministic order:
 * follows HEX_DIRECTIONS order.
 */
export function neighbors(map: GameMap, c: AxialCoord): AxialCoord[] {
  const out: AxialCoord[] = [];
  for (const dir of HEX_DIRECTIONS) {
    const n = neighborOf(c, dir);
    if (isInBounds(map, n)) {
      out.push(n);
    }
  }
  return out;
}

export function unblockedNeighbors(map: GameMap, c: AxialCoord): AxialCoord[] {
  return neighbors(map, c).filter((n) => {
    const cell = getCell(map, n);
    return cell !== undefined && !cell.blocked;
  });
}

/** Mutates the map's blocked flag. Callers own recomputing derived state (distance field, coverage). */
export function setBlocked(map: GameMap, c: AxialCoord, blocked: boolean): void {
  const cell = getCell(map, c);
  if (!cell) {
    throw new Error(`setBlocked on unknown cell ${cellKey(c)}`);
  }
  cell.blocked = blocked;
}

export function createGameMap(spec: MapSpec): GameMap {
  const { width, height, spawn, goal } = spec;
  if (width < 1 || height < 1) {
    throw new Error(`invalid map dimensions ${width}x${height}`);
  }
  for (const marker of [
    ['spawn', spawn],
    ['goal', goal],
  ] as const) {
    if (!isInBounds({ width, height }, marker[1])) {
      throw new Error(`${marker[0]} ${cellKey(marker[1])} is out of bounds`);
    }
  }

  const cells = new Map<string, GameCell>();
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      cells.set(cellKey({ q, r }), { q, r, buildable: true, blocked: false });
    }
  }

  const blockedCells = spec.blockedCells ?? [];
  const blockedKeys = new Set(blockedCells.map(cellKey));
  if (blockedKeys.has(cellKey(spawn))) {
    throw new Error('spawn cell must not be authored blocked');
  }
  if (blockedKeys.has(cellKey(goal))) {
    throw new Error('goal cell must not be authored blocked');
  }
  for (const key of blockedKeys) {
    const cell = cells.get(key);
    if (cell) {
      cell.blocked = true;
      cell.buildable = false;
    }
  }

  return { width, height, cells, spawn: { ...spawn }, goal: { ...goal } };
}
