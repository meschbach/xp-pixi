import { describe, expect, it } from 'vitest';

import { cellKey, hexDistance } from './hex';
import { createGameMap } from './map';
import type { GameMap } from './map';
import { tryPlaceTower } from './placement';
import { computeCoverage } from './towers';
import { createWorld } from './world';

/** Row 0 is a corridor; row 1 lets towers sit off-path without severing it. */
function corridorWithShoulder(width: number): GameMap {
  return createGameMap({ width, height: 2, spawn: { q: 0, r: 0 }, goal: { q: width - 1, r: 0 } });
}

function makeWorld(map: GameMap, money = 1000) {
  return createWorld({ map, startingMoney: money, startingLives: 9 });
}

describe('coverage computation', () => {
  it('covers exactly the cells reachable within R hops through unblocked cells', () => {
    const map = createGameMap({ width: 5, height: 5, spawn: { q: 0, r: 0 }, goal: { q: 4, r: 4 } });
    const from = { q: 2, r: 2 };
    const coverage = computeCoverage(map, from, 2);

    // Open lattice: path distance equals hex distance. Rings 1+2 hold 6+12 cells.
    let expected = 0;
    for (let q = 0; q < 5; q++) {
      for (let r = 0; r < 5; r++) {
        const d = hexDistance(from, { q, r });
        const inside = d >= 1 && d <= 2;
        if (inside) {
          expected++;
        }
        expect(coverage.has(cellKey({ q, r })), `${q},${r}`).toBe(inside);
      }
    }
    expect(expected).toBe(18);
    expect(coverage.size).toBe(18);
  });

  it('excludes wall-shadowed cells that are geometrically near', () => {
    // Rock at (2,1) splits the middle row; the tower sits left of it.
    const map = createGameMap({
      width: 5,
      height: 3,
      blockedCells: [{ q: 2, r: 1 }],
      spawn: { q: 0, r: 1 },
      goal: { q: 4, r: 1 },
    });
    const coverage = computeCoverage(map, { q: 1, r: 1 }, 2);

    // Geometric ring members behind the rock...
    expect(hexDistance({ q: 1, r: 1 }, { q: 3, r: 1 })).toBe(2);
    expect(hexDistance({ q: 1, r: 1 }, { q: 4, r: 0 })).toBe(3);
    // ...are unreachable within 2 hops through open cells (the (+1,-1)
    // diagonal makes (2,0) a depth-1 cell, but everything past it needs 3+).
    expect(coverage.has('3,1')).toBe(false);
    expect(coverage.has('4,0')).toBe(false);

    // Same-ring cells on the tower's side remain covered.
    expect(coverage.has('0,0')).toBe(true);
    expect(coverage.has('2,0')).toBe(true);
    expect(coverage.has('2,2')).toBe(true);
  });

  it('returns an empty set for zero range', () => {
    const map = corridorWithShoulder(4);
    expect(computeCoverage(map, { q: 1, r: 1 }, 0).size).toBe(0);
  });
});

describe('targeting', () => {
  it('targets the covered enemy closest to the goal', () => {
    const map = corridorWithShoulder(12);
    const world = makeWorld(map);

    // Three stationary enemies; only two inside a tower at (7,1) R=1.
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    const [, mid, near] = world.enemies;
    Object.assign(mid!, { fromCell: { q: 6, r: 0 }, toCell: { q: 6, r: 0 } });
    Object.assign(near!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });

    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });
    world.tick();

    const tower = world.towers[0]!;
    expect(tower.coverage.has('8,0')).toBe(true);
    expect(tower.coverage.has('6,0')).toBe(true);
    expect(tower.coverage.has('2,0')).toBe(false);
    expect(tower.targetId).toBe(near!.id); // distance 3 beats distance 5
  });

  it('breaks equal-distance ties by earliest acquisition (enemy id)', () => {
    const map = corridorWithShoulder(12);
    const world = makeWorld(map);

    const first = (() => {
      world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
      return world.enemies[0]!;
    })();
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 }); // same cell => same distance

    expect(tryPlaceTower(world, { q: 1, r: 1 })).toEqual({ ok: true });
    for (let i = 0; i < 5; i++) {
      world.tick();
      expect(world.towers[0]!.targetId).toBe(first.id);
    }
  });

  it('attacks nothing while no enemy is covered', () => {
    const map = corridorWithShoulder(12);
    const world = makeWorld(map);
    expect(tryPlaceTower(world, { q: 1, r: 1 })).toEqual({ ok: true });

    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 9, r: 0 }, toCell: { q: 9, r: 0 } });
    world.tick();

    const tower = world.towers[0]!;
    expect(tower.targetId).toBeNull();
  });

  it('drops an engaged target the moment a placement severs its fire corridor', () => {
    // Top/bottom rows connect around; the (2,2) rock forces the short bridge
    // through (2,1), which the tower at (1,1) relies on to reach (3,1).
    const map = createGameMap({
      width: 9,
      height: 3,
      blockedCells: [{ q: 2, r: 2 }],
      spawn: { q: 0, r: 1 },
      goal: { q: 8, r: 1 },
    });
    const world = makeWorld(map);

    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    const enemy = world.enemies[0]!;
    Object.assign(enemy, { fromCell: { q: 3, r: 1 }, toCell: { q: 3, r: 1 } });

    expect(tryPlaceTower(world, { q: 1, r: 1 })).toEqual({ ok: true });
    world.tick();
    expect(world.towers[0]!.targetId).toBe(enemy.id); // engaged

    // Blocking the bridge keeps spawn->goal solvable (top row detour) and the
    // enemy unstranded, but pushes (3,1) outside the tower's hop radius.
    expect(tryPlaceTower(world, { q: 2, r: 1 })).toEqual({ ok: true });
    world.tick();

    const tower = world.towers[0]!;
    expect(tower.coverage.has('3,1')).toBe(false);
    expect(tower.targetId).not.toBe(enemy.id);

    // The new tower picked the enemy up instead.
    expect(world.towers[1]!.coverage.has('3,1')).toBe(true);
    expect(world.towers[1]!.targetId).toBe(enemy.id);
  });
});
