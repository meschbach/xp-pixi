import { afterEach, describe, expect, it, vi } from 'vitest';

import { cellKey } from './hex';
import { createGameMap } from './map';
import { applyRawBalance, getBalance } from './registry';
import { createWorld } from './world';
import { tryPlaceTower } from './placement';
import { hotApplyBalance, subscribeLiveTuning } from './hotApply';
import { TOWER_TYPES } from '../data/towers';
import { ENEMY_TYPES } from '../data/enemies';
import { INTER_WAVE_DELAY_SECONDS, WAVES } from '../data/waves';
import type { RawBalance } from './registry';

const raw = (): RawBalance => ({
  towers: TOWER_TYPES,
  enemies: ENEMY_TYPES,
  waves: WAVES,
  interWaveDelaySeconds: INTER_WAVE_DELAY_SECONDS,
});

afterEach(() => {
  applyRawBalance(raw());
});

function openWorld() {
  const map = createGameMap({ width: 9, height: 3, spawn: { q: 0, r: 1 }, goal: { q: 8, r: 1 } });
  return createWorld({ map, startingMoney: 1000, startingLives: 9 });
}

describe('hotApplyBalance', () => {
  it('recomputes placed towers\u2019 coverage on range edits while leaving the distance field untouched', () => {
    const world = openWorld();
    expect(tryPlaceTower(world, { q: 4, r: 1 })).toEqual({ ok: true });

    const tower = world.towers[0]!;
    const fieldBefore = world.distanceField;
    const coverageBefore = new Set(tower.coverage);

    hotApplyBalance(world, {
      towers: [{ ...TOWER_TYPES[0]!, rangeHops: 4 }],
    });

    expect(tower.rangeHops).toBe(4);
    expect(tower.coverage.size).toBeGreaterThan(coverageBefore.size);
    expect(tower.coverage.has(cellKey({ q: 7, r: 1 }))).toBe(true);
    expect(world.distanceField).toBe(fieldBefore); // pathing never reacts to balance data
  });

  it('pushes new damage and cooldowns into already-placed towers', () => {
    const world = openWorld();
    tryPlaceTower(world, { q: 4, r: 1 });
    const tower = world.towers[0]!;

    hotApplyBalance(world, {
      towers: [{ ...TOWER_TYPES[0]!, damage: 9, cooldownSeconds: 2 }],
    });

    expect(tower.damage).toBe(9);
    expect(tower.cooldownTicks).toBe(60);
  });

  it('merges patches per source without disturbing the others', () => {
    const world = openWorld();
    hotApplyBalance(world, {
      enemies: [{ ...ENEMY_TYPES[0]!, hp: 99 }, ENEMY_TYPES[1]!],
    });

    expect(getBalance().enemies.get('grunt')!.hp).toBe(99);
    expect(getBalance().towers.get('arrow')!.cost).toBe(TOWER_TYPES[0]!.cost);
    expect(getBalance().waves).toHaveLength(WAVES.length);
  });
});

describe('subscribeLiveTuning', () => {
  it('refreshes the subscribed world on later pushes and stops after unsubscribe', () => {
    const world = openWorld();
    tryPlaceTower(world, { q: 4, r: 1 });
    const tower = world.towers[0]!;

    const unsubscribe = subscribeLiveTuning(world);

    applyRawBalance({
      ...raw(),
      towers: [{ ...TOWER_TYPES[0]!, damage: 5 }],
    });
    expect(tower.damage).toBe(5);

    unsubscribe();
    applyRawBalance({
      ...raw(),
      towers: [{ ...TOWER_TYPES[0]!, damage: 7 }],
    });
    expect(tower.damage).toBe(5);
  });
});

describe('balanceChannel queue', () => {
  it('drains patches published before the registry wired its consumer', async () => {
    // Fresh module graph so the channel starts without a consumer.
    vi.resetModules();
    const channel = await import('./balanceChannel');
    const registry = await import('./registry');

    channel.publishBalancePatch({ interWaveDelaySeconds: 12 });

    expect(registry.getBalance().interWaveDelayTicks).toBe(360);
  });
});
