import { describe, expect, it } from 'vitest';

import { createGameMap } from './map';
import type { GameMap } from './map';
import { tryPlaceTower } from './placement';
import { createWorld } from './world';

/** Row 0 is a corridor; row 1 lets towers sit off-path without severing it. */
function corridorWithShoulder(width: number): GameMap {
  return createGameMap({ width, height: 2, spawn: { q: 0, r: 0 }, goal: { q: width - 1, r: 0 } });
}

/** Places a tower over a stationary enemy at (8,0), distance 3 from the goal. */
function setup() {
  const map = corridorWithShoulder(12);
  const world = createWorld({ map, startingMoney: 1000, startingLives: 9 });
  return { world };
}

describe('damage / cooldown / kill pipeline', () => {
  it('kills an enemy when accumulated damage meets its health and credits the reward', () => {
    const { world } = setup();
    world.spawnEnemy({ hp: 3, speed: 0, killReward: 8 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });

    const moneyAfterPlacement = world.money;
    // Arrow tower: damage 1, cooldown 27 ticks -> fires on ticks 1, 28, 55.
    for (let i = 0; i < 54; i++) {
      world.tick();
    }
    expect(world.enemies).toHaveLength(1);
    expect(world.money).toBe(moneyAfterPlacement);

    world.tick(); // third shot lands
    expect(world.enemies).toHaveLength(0);
    expect(world.money).toBe(moneyAfterPlacement + 8);
  });

  it('fires exactly once per cooldown interval while a target remains covered', () => {
    const { world } = setup();
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 8 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });
    const enemy = world.enemies[0]!;

    world.tick();
    expect(enemy.hp).toBe(998); // first shot on the attack tick

    for (let i = 0; i < 26; i++) {
      world.tick();
    }
    expect(enemy.hp).toBe(998); // cooldown not yet elapsed

    world.tick(); // tick 28: elapsed
    expect(enemy.hp).toBe(997);
  });

  it('switching targets mid-cooldown never resets the timer', () => {
    const { world } = setup();
    // Farther enemy first (distance 5), engaged by the initial shot.
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 6, r: 0 }, toCell: { q: 6, r: 0 } });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });

    world.tick(); // shot #1 hits the farther enemy; cooldown now 27
    const farther = [...world.enemies].find((e) => e.fromCell.q === 6)!;
    expect(farther.hp).toBe(998);

    // A closer enemy arrives mid-cooldown and takes over targeting...
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
    const closer = world.enemies[1]!;
    Object.assign(closer, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });

    for (let i = 0; i < 26; i++) {
      world.tick(); // through tick 27: switched, but original schedule governs
    }
    const tower = world.towers[0]!;
    expect(tower.targetId).toBe(closer.id);
    expect(farther.hp).toBe(998);
    expect(closer.hp).toBe(999);

    world.tick(); // tick 28 == 27 ticks after shot #1: fires on schedule
    expect(closer.hp).toBe(998);
    expect(farther.hp).toBe(998);
  });

  it('overlapping towers cannot double-credit one kill', () => {
    const { world } = setup();
    world.spawnEnemy({ hp: 3, speed: 0, killReward: 8 });
    Object.assign(world.enemies[0]!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });
    expect(tryPlaceTower(world, { q: 9, r: 1 })).toEqual({ ok: true }); // second tower also covers (8,0)

    const moneyBefore = world.money;
    for (let i = 0; i < 60; i++) {
      world.tick();
    }

    expect(world.enemies).toHaveLength(0);
    expect(world.money).toBe(moneyBefore + 8); // credited exactly once
  });

  it('retargets to the next covered enemy immediately after a kill', () => {
    const { world } = setup();
    world.spawnEnemy({ hp: 1, speed: 0, killReward: 5 }); // close, dies to the first shot
    Object.assign(world.enemies[0]!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });
    world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 }); // farther, survives
    Object.assign(world.enemies[1]!, { fromCell: { q: 6, r: 0 }, toCell: { q: 6, r: 0 } });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });

    const [, survivor] = world.enemies;
    world.tick(); // shot #1 kills the close enemy; targetId is still stale here
    expect(world.enemies).toHaveLength(1);

    world.tick(); // next evaluation engages the survivor under normal rules
    expect(world.towers[0]!.targetId).toBe(survivor!.id);
    expect(survivor!.hp).toBe(999); // cooldown still running from shot #1

    for (let i = 0; i < 25; i++) {
      world.tick(); // through tick 27
    }
    expect(survivor!.hp).toBe(999);
    world.tick(); // tick 28: second shot lands on the new target
    expect(survivor!.hp).toBe(998);
  });
});
