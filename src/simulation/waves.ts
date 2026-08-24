import { getBalance } from './registry';
import type { World } from './world';

/**
 * Wave spawner driven entirely by balance-data definitions (spec:
 * declarative wave definitions drive spawning — no hardcoded wave logic).
 */

export interface PendingSpawn {
  enemyTypeId: string;
  /** Absolute world tick at/after which this enemy spawns. */
  spawnAtTick: number;
}

/** Flattens a wave's groups into a time-ordered spawn queue (parallel group timelines). */
export function flattenWave(groups: readonly { enemyTypeId: string; count: number; intervalTicks: number }[], startTick: number): PendingSpawn[] {
  const out: PendingSpawn[] = [];
  for (const g of groups) {
    for (let k = 0; k < g.count; k++) {
      out.push({ enemyTypeId: g.enemyTypeId, spawnAtTick: startTick + k * g.intervalTicks });
    }
  }
  out.sort((a, b) => a.spawnAtTick - b.spawnAtTick);
  return out;
}

/** Begins the wave at `index` from the balance data, scheduling its spawns relative to now. */
export function startWave(world: World, index: number): void {
  const wave = getBalance().waves[index];
  if (!wave) {
    throw new Error(`startWave: no wave at index ${index}`);
  }
  world.currentWaveIndex = index;
  world.pendingSpawns = flattenWave(wave.groups, world.tickCount);
  world.wavePhase = 'active';
}

/** Advances wave progression by one tick (called from the world loop). */
export function tickSpawner(world: World): void {
  if (world.state !== 'running') {
    return;
  }

  switch (world.wavePhase) {
    case 'awaiting-start':
    case 'complete':
      return;

    case 'intermission': {
      world.ticksToNextWave -= 1;
      if (world.ticksToNextWave <= 0) {
        startWave(world, world.currentWaveIndex + 1);
      }
      return;
    }

    case 'active': {
      while (
        world.pendingSpawns.length > 0 &&
        world.pendingSpawns[0]!.spawnAtTick <= world.tickCount
      ) {
        const pending = world.pendingSpawns.shift()!;
        spawnFromDefinition(world, pending.enemyTypeId);
      }

      // Clear = queue exhausted AND none of this wave's enemies remain alive.
      // Kills outrunning the spawner keep the wave open until its queue drains.
      if (world.pendingSpawns.length === 0) {
        const aliveFromWave = world.enemies.some((e) => e.waveIndex === world.currentWaveIndex);
        if (!aliveFromWave) {
          completeWave(world);
        }
      }
      return;
    }
  }
}

function spawnFromDefinition(world: World, enemyTypeId: string): void {
  const type = getBalance().enemies.get(enemyTypeId);
  if (!type) {
    throw new Error(`spawner: unknown enemy type "${enemyTypeId}"`);
  }
  world.spawnEnemy(
    { typeId: type.id, hp: type.hp, speed: type.speed, killReward: type.killReward },
    world.currentWaveIndex,
  );
}

function completeWave(world: World): void {
  const isFinalWave = world.currentWaveIndex >= getBalance().waves.length - 1;
  if (isFinalWave) {
    world.state = 'victory';
    world.wavePhase = 'complete';
    return;
  }
  world.wavePhase = 'intermission';
  world.ticksToNextWave = getBalance().interWaveDelayTicks;
}
