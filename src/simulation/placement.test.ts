import { describe, expect, it } from 'vitest';

import { cellKey } from './hex';
import { distanceTo } from './distanceField';
import { createGameMap, getCell } from './map';
import { SLICE_MAP } from '../data/maps/slice';
import { tryPlaceTower } from './placement';
import { createWorld } from './world';

const ARROW_COST = 50;

function openWorld(money = 1000): ReturnType<typeof createWorld> {
  const map = createGameMap({ width: 9, height: 3, spawn: { q: 0, r: 1 }, goal: { q: 8, r: 1 } });
  return createWorld({ map, startingMoney: money, startingLives: 9 });
}

describe('placement acceptance', () => {
  it('charges the cost, blocks the tile, and refreshes derived state', () => {
    const world = openWorld();
    const cell = { q: 4, r: 1 };

    const distBefore = distanceTo(world.distanceField, { q: 2, r: 1 })!;
    expect(tryPlaceTower(world, cell)).toEqual({ ok: true });

    expect(world.money).toBe(1000 - ARROW_COST);
    expect(getCell(world.map, cell)?.blocked).toBe(true);
    expect(world.towers).toHaveLength(1);

    // The distance field was recomputed against the new obstacle: cells left
    // of it now detour around the tower (6 -> 7 hops), and the tile itself
    // has no finite distance at all.
    expect(distanceTo(world.distanceField, { q: 2, r: 1 })).toBe(distBefore + 1);
    expect(distanceTo(world.distanceField, cell)).toBeUndefined();

    // ...and the tower received fresh coverage.
    const tower = world.towers[0]!;
    expect(tower.cell).toEqual(cell);
    expect(tower.coverage.size).toBeGreaterThan(0);
    expect(tower.coverage.has(cellKey({ q: 5, r: 1 }))).toBe(true);
  });

  it('accepts placements while enemies are alive as long as nobody is stranded', () => {
    const world = openWorld();
    world.spawnEnemy({ hp: 9, speed: 0, killReward: 5 });
    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: true });
  });
});

describe('placement rejection leaves the world untouched', () => {
  it('rejects out-of-bounds cells', () => {
    const world = openWorld();
    expect(tryPlaceTower(world, { q: 99, r: 0 })).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(world.money).toBe(1000);
    expect(world.towers).toHaveLength(0);
  });

  it('rejects authored rocks', () => {
    const map = createGameMap(SLICE_MAP);
    const world = createWorld({ map, startingMoney: 1000, startingLives: 9 });
    const rock = SLICE_MAP.blockedCells![0]!;
    expect(tryPlaceTower(world, rock)).toEqual({ ok: false, reason: 'not-buildable' });
    expect(world.money).toBe(1000);
  });

  it('rejects tiles occupied by another tower without charging', () => {
    const world = openWorld();
    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: true });
    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: false, reason: 'blocked' });
    expect(world.towers).toHaveLength(1);
    expect(world.money).toBe(1000 - ARROW_COST);
  });

  it('rejects the level marker tiles (spawn and goal)', () => {
    const map = createGameMap(SLICE_MAP);
    const world = createWorld({ map, startingMoney: 1000, startingLives: 9 });
    expect(tryPlaceTower(world, { ...map.spawn })).toEqual({ ok: false, reason: 'level-marker' });
    expect(tryPlaceTower(world, { ...map.goal })).toEqual({ ok: false, reason: 'level-marker' });
    expect(world.money).toBe(1000);
  });

  it('rejects unaffordable placements without partial charges', () => {
    const world = openWorld(30);
    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: false, reason: 'unaffordable' });
    expect(world.money).toBe(30);
    expect(getCell(world.map, { q: 4, r: 1 })?.blocked).toBe(false);
  });

  it('rejects placements that would disconnect spawn from goal', () => {
    // Height-1 corridor: any mid tile is a load-bearing pinch point.
    const map = createGameMap({ width: 5, height: 1, spawn: { q: 0, r: 0 }, goal: { q: 4, r: 0 } });
    const world = createWorld({ map, startingMoney: 1000, startingLives: 9 });

    expect(tryPlaceTower(world, { q: 2, r: 0 })).toEqual({ ok: false, reason: 'would-seal-spawn' });
    expect(world.money).toBe(1000);
    expect(getCell(world.map, { q: 2, r: 0 })?.blocked).toBe(false);

    // The run continues unaffected: a legal placement still works afterwards.
    expect(tryPlaceTower(world, { q: 2, r: 0 })).toEqual({ ok: false, reason: 'would-seal-spawn' });
  });

  it('rejects placements that would strand a living enemy while keeping spawn->goal intact', () => {
    // Rocks pen the enemy at (3,0) so its sole exit is (3,1); blocking that
    // exit pockets the enemy even though the bottom row detours around.
    const map = createGameMap({
      width: 7,
      height: 3,
      blockedCells: [
        { q: 2, r: 0 },
        { q: 4, r: 0 },
        { q: 2, r: 1 },
      ],
      spawn: { q: 0, r: 1 },
      goal: { q: 6, r: 1 },
    });
    const world = createWorld({ map, startingMoney: 1000, startingLives: 9 });

    world.spawnEnemy({ hp: 9, speed: 0, killReward: 5 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 3, r: 0 }, toCell: { q: 3, r: 0 } });
    const enemyDistBefore = distanceTo(world.distanceField, { q: 3, r: 0 });

    expect(enemyDistBefore).toBeDefined(); // connected before the attempt
    expect(tryPlaceTower(world, { q: 3, r: 1 })).toEqual({
      ok: false,
      reason: 'would-strand-enemy',
    });

    // Nothing stuck: money intact, tile open, enemy still connected.
    expect(world.money).toBe(1000);
    expect(world.towers).toHaveLength(0);
    expect(getCell(world.map, { q: 3, r: 1 })?.blocked).toBe(false);
    expect(distanceTo(world.distanceField, { q: 3, r: 0 })).toBe(enemyDistBefore);
  });

  it('rejects placement on a cell occupied by a living enemy without charge', () => {
    const world = openWorld();
    world.spawnEnemy({ hp: 9, speed: 0, killReward: 5 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 4, r: 1 }, toCell: { q: 4, r: 1 } });

    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: false, reason: 'enemy-present' });
    expect(world.money).toBe(1000);
    expect(world.towers).toHaveLength(0);
  });

  it('rejects placements once the run is over', () => {
    const map = createGameMap({ width: 2, height: 1, spawn: { q: 0, r: 0 }, goal: { q: 1, r: 0 } });
    const world = createWorld({ map, startingMoney: 1000, startingLives: 1 });
    world.spawnEnemy({ hp: 1, speed: 30, killReward: 0 }); // leaks almost immediately

    let guard = 0;
    while (world.state === 'running' && guard++ < 100) {
      world.tick();
    }
    expect(world.state).toBe('lost');

    expect(tryPlaceTower(world, { q: 0, r: 0 })).toEqual({ ok: false, reason: 'run-not-active' });
  });
});
