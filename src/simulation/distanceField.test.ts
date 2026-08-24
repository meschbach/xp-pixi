import { describe, expect, it } from 'vitest';

import { cellKey } from './hex';
import { computeDistanceField, distanceTo } from './distanceField';
import { createGameMap, setBlocked } from './map';
import type { GameMap } from './map';

function openMap(): GameMap {
  return createGameMap({
    width: 3,
    height: 3,
    spawn: { q: 0, r: 0 },
    goal: { q: 2, r: 2 },
  });
}

describe('computeDistanceField', () => {
  it('computes hop distances from the goal across an open map', () => {
    const map = openMap();
    const field = computeDistanceField(map);

    expect(distanceTo(field, map.goal)).toBe(0);
    expect(distanceTo(field, { q: 1, r: 2 })).toBe(1);
    // hexDistance((0,0) -> (2,2)) = (2 + 2 + 4) / 2 = 4 on an open lattice
    expect(distanceTo(field, { q: 0, r: 0 })).toBe(4);
  });

  it('reroutes around blocked cells with a longer path', () => {
    const map = createGameMap({
      width: 5,
      height: 2,
      spawn: { q: 0, r: 0 },
      goal: { q: 4, r: 0 },
    });
    const before = distanceTo(computeDistanceField(map), { q: 0, r: 0 })!;
    expect(before).toBe(4);

    // Wall off the straight row; traffic must detour through row 1.
    setBlocked(map, { q: 1, r: 0 }, true);
    setBlocked(map, { q: 2, r: 0 }, true);
    setBlocked(map, { q: 3, r: 0 }, true);
    const after = distanceTo(computeDistanceField(map), { q: 0, r: 0 });

    expect(after).toBeDefined();
    // Detour uses the (+1,-1) diagonal hop from (3,1) into the goal.
    expect(after!).toBe(5);
  });

  it('marks fully sealed regions as unreachable', () => {
    const map = createGameMap({
      width: 4,
      height: 1,
      spawn: { q: 0, r: 0 },
      goal: { q: 3, r: 0 },
    });
    setBlocked(map, { q: 1, r: 0 }, true);
    setBlocked(map, { q: 2, r: 0 }, true);

    const field = computeDistanceField(map);
    expect(distanceTo(field, { q: 3, r: 0 })).toBe(0);
    expect(distanceTo(field, { q: 0, r: 0 })).toBeUndefined();
  });

  it('keys are stable cell encodings', () => {
    const field = computeDistanceField(openMap());
    expect(field.has('2,2')).toBe(true);
    expect([...field.keys()].every((k) => /^\d+,\d+$/.test(k))).toBe(true);
    expect(cellKey({ q: 2, r: 2 })).toBe('2,2');
  });
});
