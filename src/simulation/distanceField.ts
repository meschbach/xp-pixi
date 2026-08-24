import type { AxialCoord } from './hex';
import { cellKey } from './hex';
import type { GameMap } from './map';
import { unblockedNeighbors } from './map';

/**
 * Hops-to-goal per cell over unblocked cells. Absent key = unreachable
 * (infinite distance).
 */
export type DistanceField = Map<string, number>;

/**
 * Breadth-first flood from the goal across unblocked cells. Every edge costs
 * one hop, so BFS yields exact hop distances.
 */
export function computeDistanceField(map: GameMap): DistanceField {
  const field: DistanceField = new Map();
  const goalKey = cellKey(map.goal);
  field.set(goalKey, 0);

  const queue: AxialCoord[] = [map.goal];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const currentDist = field.get(cellKey(current))!;
    for (const n of unblockedNeighbors(map, current)) {
      const key = cellKey(n);
      if (!field.has(key)) {
        field.set(key, currentDist + 1);
        queue.push(n);
      }
    }
  }

  return field;
}

/** Undefined means the cell cannot reach the goal (or is off-map). */
export function distanceTo(field: DistanceField, c: AxialCoord): number | undefined {
  return field.get(cellKey(c));
}
