import { describe, expect, it } from 'vitest';

import { TICK_RATE_HZ } from './clock';
import { ENEMY_TYPES } from '../data/enemies';
import { TOWER_TYPES } from '../data/towers';
import { INTER_WAVE_DELAY_SECONDS, WAVES } from '../data/waves';
import { STARTING_LIVES, STARTING_MONEY } from '../data/rules';
import { SLICE_MAP } from '../data/maps/slice';
import { applyRawBalance, buildRuntimeBalance, getBalance, secondsToTicks } from './registry';
import type { RawBalance } from './registry';
import { computeDistanceField, distanceTo } from './distanceField';
import { createGameMap } from './map';

const raw = (): RawBalance => ({
  towers: TOWER_TYPES,
  enemies: ENEMY_TYPES,
  waves: WAVES,
  interWaveDelaySeconds: INTER_WAVE_DELAY_SECONDS,
});

describe('secondsToTicks', () => {
  it('converts seconds against the fixed tick rate', () => {
    expect(TICK_RATE_HZ).toBe(30);
    expect(secondsToTicks(1)).toBe(30);
    expect(secondsToTicks(0.9)).toBe(27);
    expect(secondsToTicks(1.2)).toBe(36);
  });

  it('never yields zero ticks', () => {
    expect(secondsToTicks(0.001)).toBe(1);
    expect(secondsToTicks(0)).toBe(1);
  });
});

describe('buildRuntimeBalance', () => {
  it('converts authored values into tick-normalized runtime stats', () => {
    const balance = buildRuntimeBalance(raw());

    const arrow = balance.towers.get('arrow')!;
    expect(arrow.cost).toBe(50);
    expect(arrow.rangeHops).toBe(2);
    expect(arrow.damage).toBe(1);
    expect(arrow.cooldownTicks).toBe(27);

    const grunt = balance.enemies.get('grunt')!;
    expect(grunt.hp).toBe(3);
    expect(grunt.speed).toBeCloseTo(1.0);
    expect(grunt.killReward).toBe(8);

    expect(balance.waves).toHaveLength(7);
    expect(balance.interWaveDelayTicks).toBe(150);
  });

  it('rejects waves referencing unknown enemy types', () => {
    const badGroup = { ...WAVES[0]!.groups[0]!, enemyType: 'boss' };
    const bad: RawBalance = { ...raw(), waves: [{ groups: [badGroup] }] };
    expect(() => buildRuntimeBalance(bad)).toThrow(/unknown enemy type "boss"/);
  });

  it('rejects non-positive tower damage and cooldowns', () => {
    const zeroDamage: RawBalance = {
      ...raw(),
      towers: [{ ...TOWER_TYPES[0]!, damage: 0 }],
    };
    const zeroCooldown: RawBalance = {
      ...raw(),
      towers: [{ ...TOWER_TYPES[0]!, cooldownSeconds: -1 }],
    };
    expect(() => buildRuntimeBalance(zeroDamage)).toThrow(/damage/);
    expect(() => buildRuntimeBalance(zeroCooldown)).toThrow(/cooldownSeconds/);
  });

  it('rejects groups with non-positive counts or intervals', () => {
    const baseGroup = WAVES[0]!.groups[0]!;
    const zeroCount: RawBalance = {
      ...raw(),
      waves: [{ groups: [{ ...baseGroup, count: 0 }] }],
    };
    const zeroInterval: RawBalance = {
      ...raw(),
      waves: [{ groups: [{ ...baseGroup, intervalSeconds: 0 }] }],
    };
    expect(() => buildRuntimeBalance(zeroCount)).toThrow(/count/);
    expect(() => buildRuntimeBalance(zeroInterval)).toThrow(/intervalSeconds/);
  });
});

describe('registry snapshot accessors', () => {
  it('exposes a live snapshot replaceable via applyRawBalance', () => {
    const before = getBalance().towers.get('arrow')!.cost;

    applyRawBalance({
      ...raw(),
      towers: [{ ...TOWER_TYPES[0]!, cost: 60 }],
    });
    expect(getBalance().towers.get('arrow')!.cost).toBe(60);

    applyRawBalance(raw());
    expect(getBalance().towers.get('arrow')!.cost).toBe(before);
  });
});

describe('authored slice data', () => {
  it('seeds exactly two distinct enemy types and one tower type', () => {
    expect(new Set(ENEMY_TYPES.map((t) => t.id)).size).toBe(ENEMY_TYPES.length);
    expect(new Set(ENEMY_TYPES.map((t) => t.id))).toEqual(new Set(['grunt', 'runner']));
    expect(TOWER_TYPES.length).toBeGreaterThanOrEqual(1);
  });

  it('authors seven valid waves with known enemy references', () => {
    const ids = new Set(ENEMY_TYPES.map((e) => e.id));
    expect(WAVES).toHaveLength(7);
    for (const [waveIndex, wave] of WAVES.entries()) {
      expect(wave.groups.length, `wave ${waveIndex}`).toBeGreaterThan(0);
      for (const group of wave.groups) {
        expect(ids.has(group.enemyType), `wave ${waveIndex} type`).toBe(true);
        expect(group.count).toBeGreaterThan(0);
        expect(group.intervalSeconds).toBeGreaterThan(0);
      }
    }
  });

  it('seeds starting resources and inter-wave delay', () => {
    expect(STARTING_MONEY).toBe(100);
    expect(STARTING_LIVES).toBe(10);
    expect(INTER_WAVE_DELAY_SECONDS).toBeGreaterThan(0);
  });

  it('slice map is an 11x11 rhombus whose spawn reaches the goal', () => {
    expect(SLICE_MAP.width).toBe(11);
    expect(SLICE_MAP.height).toBe(11);
    const map = createGameMap(SLICE_MAP);
    const field = computeDistanceField(map);
    const d = distanceTo(field, map.spawn);
    expect(d).toBeDefined();
    expect(d!).toBeGreaterThan(0);
  });
});
