import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ENEMY_TYPES } from '../data/enemies';
import { TOWER_TYPES } from '../data/towers';
import { applyRawBalance, currentRawBalance } from './registry';
import { createGameMap } from './map';
import type { GameMap } from './map';
import { createWorld } from './world';
import type { World } from './world';

/** Straight corridor so enemies leak quickly and predictably. */
function corridorMap(width: number): GameMap {
  return createGameMap({ width, height: 1, spawn: { q: 0, r: 0 }, goal: { q: width - 1, r: 0 } });
}

/** Installs a tiny two-wave campaign; the default authored data is restored after each test. */
function installCampaign(waves = defaultTestWaves()): void {
  applyRawBalance({
    towers: TOWER_TYPES,
    enemies: ENEMY_TYPES,
    interWaveDelaySeconds: 0.1, // 3 ticks
    waves,
  });
}

function defaultTestWaves() {
  return [
    { groups: [{ enemyType: 'grunt', count: 3, intervalSeconds: 0.1 }] }, // one grunt every 3 ticks
    {
      groups: [
        { enemyType: 'grunt', count: 2, intervalSeconds: 1.0 },
        { enemyType: 'runner', count: 2, intervalSeconds: 2.0 },
      ],
    },
  ];
}

beforeEach(() => {
  installCampaign();
});

afterEach(() => {
  applyRawBalance(currentRawBalance());
});

describe('wave progression', () => {
  it('waits for the player before the first wave', () => {
    const world = createWorld({ map: corridorMap(6), startingMoney: 0, startingLives: 10 });
    expect(world.wavePhase).toBe('awaiting-start');
    expect(world.currentWaveIndex).toBe(-1);

    for (let i = 0; i < 100; i++) {
      world.tick();
    }
    expect(world.enemies).toHaveLength(0);

    expect(world.requestStartWave()).toBe(true);
    expect(world.wavePhase).toBe('active');
    expect(world.currentWaveIndex).toBe(0);
  });

  it('spawns each group per its own count and interval', () => {
    const world = createWorld({ map: corridorMap(8), startingMoney: 0, startingLives: 10 });
    world.requestStartWave();

    // Queue [0,3,6] relative to start; first spawn lands on the first tick.
    world.tick();
    expect(world.enemies).toHaveLength(1);

    world.tick();
    expect(world.enemies).toHaveLength(1); // nothing due yet

    world.tick();
    expect(world.enemies).toHaveLength(2); // second grunt due at t=3

    world.tick();
    world.tick();
    world.tick();
    expect(world.enemies).toHaveLength(3); // third grunt due at t=6
  });

  it('runs mixed-type groups as parallel timelines', () => {
    installCampaign([
      {
        groups: [
          { enemyType: 'grunt', count: 2, intervalSeconds: 1.0 },   // ticks 30 apart
          { enemyType: 'runner', count: 2, intervalSeconds: 2.0 },  // ticks 60 apart
        ],
      },
    ]);
    const world = createWorld({ map: corridorMap(20), startingMoney: 0, startingLives: 99 });
    world.requestStartWave();

    // Freeze everyone mid-map by sealing them in? Simpler: use a sealed map so
    // nobody leaks and counts accumulate purely by spawn schedule.
    const sealedMap = createGameMap({ width: 3, height: 1, blockedCells: [{ q: 1, r: 0 }], spawn: { q: 0, r: 0 }, goal: { q: 2, r: 0 } });
    const sealedWorld = createWorld({ map: sealedMap, startingMoney: 0, startingLives: 99 });
    sealedWorld.requestStartWave();

    for (let i = 0; i <= 61; i++) {
      sealedWorld.tick();
    }
    // All four spawned and held (sealed region): grunts at t=1,31; runners at t=1,61.
    expect(sealedWorld.enemies).toHaveLength(4);
    expect(sealedWorld.enemies.filter((e) => e.waveIndex === 0)).toHaveLength(4);
    void world;
  });

  it('kills outrunning the spawner do not advance the wave', () => {
    installCampaign([
      { groups: [{ enemyType: 'grunt', count: 4, intervalSeconds: 10 }] }, // 300 ticks between spawns
      { groups: [{ enemyType: 'grunt', count: 1, intervalSeconds: 0.1 }] },
    ]);
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 99 });
    world.requestStartWave();

    // Each spawned grunt leaks within ~2 ticks (D=1 hop, high effective speed
    // relative to hop length), but the queue still holds three more spawns.
    for (let i = 0; i < 400; i++) {
      world.tick();
    }
    expect(world.wavePhase).toBe('active');
    expect(world.currentWaveIndex).toBe(0);
  });

  it('auto-starts the next wave after the configured delay once cleared', () => {
    installCampaign([
      { groups: [{ enemyType: 'runner', count: 2, intervalSeconds: 0.03 }] }, // ~1 tick apart
      { groups: [{ enemyType: 'grunt', count: 1, intervalSeconds: 0.1 }] },
    ]);
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 99 });
    world.requestStartWave();

    // Both runners leak fast (D=1, speed 1.7 => ~18 ticks/hop... give room).
    let guard = 0;
    while (world.wavePhase === 'active' && guard++ < 500) {
      world.tick();
    }
    expect(world.wavePhase).toBe('intermission');
    expect(world.ticksToNextWave).toBe(3);

    world.tick();
    world.tick();
    expect(world.wavePhase).toBe('intermission');
    world.tick();
    expect(world.wavePhase).toBe('active');
    expect(world.currentWaveIndex).toBe(1);
  });

  it('final wave clear transitions to victory and halts gameplay', () => {
    const world = createWorld({ map: corridorMap(2), startingMoney: 0, startingLives: 99 });
    world.requestStartWave();

    let guard = 0;
    while (world.state === 'running' && guard++ < 2000) {
      world.tick();
    }

    expect(world.state).toBe('victory');
    expect(world.wavePhase).toBe('complete');

    const frozenTick = world.tickCount;
    world.tick();
    world.tick();
    expect(world.tickCount).toBe(frozenTick);

    expect(world.requestStartWave()).toBe(false);
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });
    expect(world.enemies).toHaveLength(0);
  });

  it('requestStartWave is rejected while a wave is active', () => {
    const world = createWorld({ map: corridorMap(6), startingMoney: 0, startingLives: 10 });
    expect(world.requestStartWave()).toBe(true);
    expect(world.requestStartWave()).toBe(false);
    expect(world.currentWaveIndex).toBe(0);
  });

  it('tags spawned enemies with their wave index', () => {
    const world: World = createWorld({ map: corridorMap(30), startingMoney: 0, startingLives: 99 });
    world.spawnEnemy({ hp: 1, speed: 1, killReward: 0 });
    expect(world.enemies[0]!.waveIndex).toBe(-1);

    world.requestStartWave();
    world.tick();
    expect([...world.enemies].some((e) => e.waveIndex === 0)).toBe(true);
  });
});
