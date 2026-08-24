import { describe, expect, it } from 'vitest';

import { cellKey, sameCell } from './hex';
import { computeDistanceField, distanceTo } from './distanceField';
import { createGameMap, setBlocked } from './map';
import type { GameMap } from './map';
import { TICK_RATE_HZ, createWorld } from './world';
import type { World } from './world';

/** Straight corridor: cells (0..width-1, 0), spawn at left end, goal at right end. */
function corridorMap(width: number): GameMap {
  return createGameMap({ width, height: 1, spawn: { q: 0, r: 0 }, goal: { q: width - 1, r: 0 } });
}

function ticksUntil(world: World, predicate: () => boolean, maxTicks = 10_000): number {
  for (let i = 0; i < maxTicks; i++) {
    world.tick();
    if (predicate()) {
      return i + 1;
    }
  }
  return -1;
}

describe('enemy movement (2.4)', () => {
  it('traverses D hops in ~D/S * TICK_RATE ticks', () => {
    const D = 7;
    for (const speed of [1, 2]) {
      const map = corridorMap(8);
      const world = createWorld({ map, startingMoney: 0, startingLives: 9 });
      world.spawnEnemy({ hp: 1, speed, killReward: 0 });

      const expected = (D / speed) * TICK_RATE_HZ;
      const taken = ticksUntil(world, () => world.enemies.length === 0);

      expect(taken).toBeGreaterThan(expected - 3);
      expect(taken).toBeLessThan(expected + 3);
      expect(world.lives).toBe(8);
    }
  });

  it('never enters blocked cells and reaches the goal around obstacles', () => {
    const map = createGameMap({
      width: 5,
      height: 3,
      blockedCells: [
        { q: 1, r: 0 },
        { q: 1, r: 2 },
        { q: 3, r: 1 },
      ],
      spawn: { q: 0, r: 0 },
      goal: { q: 4, r: 2 },
    });
    expect(distanceTo(computeDistanceField(map), map.spawn)).toBeDefined();

    const world = createWorld({ map, startingMoney: 0, startingLives: 5 });
    world.spawnEnemy({ hp: 1, speed: 3, killReward: 0 });

    const visited: string[] = [];
    const leaked = ticksUntil(world, () => {
      if (world.enemies.length > 0) {
        visited.push(cellKey(world.enemies[0]!.fromCell));
      }
      return world.enemies.length === 0;
    });

    expect(leaked).toBeGreaterThan(0);
    const blockedKeys = new Set(['1,0', '1,2', '3,1']);
    expect(visited.some((k) => blockedKeys.has(k))).toBe(false);
    expect(world.lives).toBe(4);
  });

  it('breaks descent ties deterministically by axial order (q, then r)', () => {
    // From (2,0) both (1,0) and (1,1) are one hop closer to the goal at (0,0).
    const map = createGameMap({ width: 3, height: 3, spawn: { q: 2, r: 0 }, goal: { q: 0, r: 0 } });
    const world = createWorld({ map, startingMoney: 0, startingLives: 5 });
    world.spawnEnemy({ hp: 1, speed: 0.0001, killReward: 0 }); // crawl so the first hop is observable

    world.tick();

    expect(sameCell(world.enemies[0]!.toCell, { q: 1, r: 0 })).toBe(true);
  });

  it('completes a committed hop even when the field changes mid-step, then holds when sealed', () => {
    const map = corridorMap(6); // spawn (0,0) ... goal (5,0)
    const world = createWorld({ map, startingMoney: 0, startingLives: 5 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });

    world.tick(); // now mid-hop toward (1,0) with progress 1/30
    const enemy = world.enemies[0]!;
    expect(enemy.progress).toBeGreaterThan(0);
    expect(sameCell(enemy.toCell, { q: 1, r: 0 })).toBe(true);

    // Seal everything between the enemy and the goal while it is in flight.
    setBlocked(map, { q: 1, r: 0 }, true);
    setBlocked(map, { q: 2, r: 0 }, true);
    setBlocked(map, { q: 3, r: 0 }, true);
    setBlocked(map, { q: 4, r: 0 }, true);
    world.distanceField = computeDistanceField(map);

    // The committed hop must finish even though the destination is now blocked.
    const landed = ticksUntil(world, () => sameCell(enemy.fromCell, { q: 1, r: 0 }), 60);
    expect(landed).toBeGreaterThan(0);

    const frozenAt = cellKey(enemy.fromCell);
    for (let i = 0; i < 30; i++) {
      world.tick();
    }
    expect(cellKey(enemy.fromCell)).toBe(frozenAt);
    expect(world.enemies).toHaveLength(1);
    expect(world.lives).toBe(5);
  });

  it('holds position indefinitely when spawned into a sealed region', () => {
    const map = corridorMap(6);
    setBlocked(map, { q: 1, r: 0 }, true);
    const world = createWorld({ map, startingMoney: 0, startingLives: 5 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });

    for (let i = 0; i < 60; i++) {
      world.tick();
    }

    expect(world.enemies).toHaveLength(1);
    expect(sameCell(world.enemies[0]!.fromCell, { q: 0, r: 0 })).toBe(true);
    expect(world.enemies[0]!.progress).toBe(0);
  });
});

describe('economy and lives (2.5)', () => {
  it('starts with configured money and lives', () => {
    const world = createWorld({ map: corridorMap(4), startingMoney: 100, startingLives: 10 });
    expect(world.money).toBe(100);
    expect(world.lives).toBe(10);
    expect(world.state).toBe('running');
  });

  it('credits kill rewards through creditMoney', () => {
    const world = createWorld({ map: corridorMap(4), startingMoney: 50, startingLives: 10 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 12 });
    world.creditMoney(world.enemies[0]!.killReward);
    expect(world.money).toBe(62);
  });

  it('trySpend pays placement costs only when affordable', () => {
    const world = createWorld({ map: corridorMap(4), startingMoney: 50, startingLives: 10 });

    expect(world.trySpend(50)).toBe(true);
    expect(world.money).toBe(0);

    expect(world.trySpend(1)).toBe(false);
    expect(world.money).toBe(0);
  });

  it('a goal leak removes the enemy and decrements lives by exactly one', () => {
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 10 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });

    const taken = ticksUntil(world, () => world.enemies.length === 0);

    expect(taken).toBeGreaterThan(0);
    expect(world.enemies).toHaveLength(0);
    expect(world.lives).toBe(9);
    expect(world.state).toBe('running');
  });

  it('reaching zero lives triggers loss; gameplay halts and spawning stops', () => {
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 1 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });

    const taken = ticksUntil(world, () => world.state === 'lost');
    expect(taken).toBeGreaterThan(0);

    const frozenTick = world.tickCount;
    world.tick();
    world.tick();
    expect(world.tickCount).toBe(frozenTick);
    expect(world.enemies).toHaveLength(0);

    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });
    expect(world.enemies).toHaveLength(0);
    expect(world.money).toBe(0);
    expect(world.trySpend(0)).toBe(true); // economy primitives still inert-safe
  });

  it('multiple leaks accumulate before loss is evaluated', () => {
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 2 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });

    const taken = ticksUntil(world, () => world.state === 'lost');

    expect(taken).toBeGreaterThan(0);
    expect(world.lives).toBe(0);
  });
});
