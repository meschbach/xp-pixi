import { describe, expect, it } from 'vitest';

import { cellKey } from './hex';
import { createGameMap, getCell, isInBounds, neighbors, setBlocked, unblockedNeighbors } from './map';
import type { GameMap } from './map';

/** Small fixture: 4x3 rhombus with one authored obstacle. */
function fixtureMap(): GameMap {
  return createGameMap({
    width: 4,
    height: 3,
    blockedCells: [{ q: 2, r: 1 }],
    spawn: { q: 0, r: 0 },
    goal: { q: 3, r: 2 },
  });
}

describe('createGameMap', () => {
  it('creates one cell per rhombus coordinate', () => {
    const map = fixtureMap();
    expect(map.cells.size).toBe(12);
    expect(map.spawn).toEqual({ q: 0, r: 0 });
    expect(map.goal).toEqual({ q: 3, r: 2 });
  });

  it('marks authored obstacles blocked and unbuildable', () => {
    const map = fixtureMap();
    expect(getCell(map, { q: 2, r: 1 })).toMatchObject({ buildable: false, blocked: true });
    expect(getCell(map, { q: 1, r: 1 })).toMatchObject({ buildable: true, blocked: false });
  });

  it('rejects out-of-bounds or blocked level markers', () => {
    expect(() => createGameMap({ width: 2, height: 2, spawn: { q: 5, r: 0 }, goal: { q: 1, r: 1 } })).toThrow();
    expect(() => createGameMap({ width: 2, height: 2, spawn: { q: 0, r: 0 }, goal: { q: -1, r: 1 } })).toThrow();
    expect(() =>
      createGameMap({ width: 2, height: 2, blockedCells: [{ q: 1, r: 1 }], spawn: { q: 0, r: 0 }, goal: { q: 1, r: 1 } })
    ).toThrow(/goal/);
    expect(() =>
      createGameMap({ width: 2, height: 2, blockedCells: [{ q: 0, r: 0 }], spawn: { q: 0, r: 0 }, goal: { q: 1, r: 1 } })
    ).toThrow(/spawn/);
  });
});

describe('neighbors', () => {
  it('gives interior cells exactly six in-bounds neighbors', () => {
    const map = fixtureMap();
    const n = neighbors(map, { q: 1, r: 1 });
    expect(n).toHaveLength(6);
    for (const cell of n) {
      expect(isInBounds(map, cell)).toBe(true);
    }
    expect(new Set(n.map(cellKey)).size).toBe(6);
  });

  it('gives edge and corner cells fewer neighbors, none outside the map', () => {
    const map = fixtureMap();

    // Corner (0,0) of a rhombus has only (1,0) and (0,1) in bounds.
    const corner = neighbors(map, { q: 0, r: 0 });
    expect(corner.map(cellKey).sort()).toEqual(['0,1', '1,0']);

    // Left edge (0,1): five would-be neighbors, one falls out on negative q.
    const edge = neighbors(map, { q: 0, r: 1 });
    expect(edge.length).toBeLessThan(6);
    expect(edge.length).toBeGreaterThan(0);
    for (const cell of edge) {
      expect(isInBounds(map, cell)).toBe(true);
    }

    // Far corner (3,2) likewise.
    expect(neighbors(map, { q: 3, r: 2 }).length).toBeLessThan(6);
  });

  it('unblockedNeighbors filters blocked cells without changing ordering guarantees', () => {
    const map = fixtureMap();
    // (1,1) touches the obstacle at (2,1).
    const open = unblockedNeighbors(map, { q: 1, r: 1 });
    expect(open.map(cellKey)).not.toContain('2,1');
    expect(open.length).toBe(5);
  });

  it('setBlocked flips pathing availability', () => {
    const map = fixtureMap();
    setBlocked(map, { q: 1, r: 1 }, true);
    expect(getCell(map, { q: 1, r: 1 })?.blocked).toBe(true);
    setBlocked(map, { q: 1, r: 1 }, false);
    // Six open neighbors minus the authored obstacle at (2,1).
    expect(unblockedNeighbors(map, { q: 1, r: 1 })).toHaveLength(5);
  });
});
