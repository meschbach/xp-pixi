import type { MapDef } from '../types';

/**
 * Slice map: an 11×11 hex rhombus with a handful of scattered rocks.
 * Spawn and goal sit on opposite ends of the middle row (~10 hops apart).
 *
 * Deliberately excluded from live hot-apply (design D5): a swapped layout
 * cannot reconcile with in-flight world state, so edits take effect on the
 * next run (restart or reload).
 */
export const SLICE_MAP: MapDef = {
  id: 'slice',
  width: 11,
  height: 11,
  blockedCells: [
    { q: 3, r: 2 },
    { q: 7, r: 3 },
    { q: 4, r: 8 },
    { q: 8, r: 7 },
  ],
  spawn: { q: 0, r: 5 },
  goal: { q: 10, r: 5 },
};
