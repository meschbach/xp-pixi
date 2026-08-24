import { TICK_RATE_HZ } from './clock';
import { setBalancePatchConsumer } from './balanceChannel';
import { ENEMY_TYPES } from '../data/enemies';
import { TOWER_TYPES } from '../data/towers';
import { INTER_WAVE_DELAY_SECONDS, WAVES } from '../data/waves';
import type { EnemyTypeDef, TowerDef, WaveDef } from '../data/types';

/**
 * The registry is the single boundary where human-friendly authored values
 * are converted against the fixed tick rate (design D5). Simulation code only
 * ever sees runtime values from here — accessors never see raw data.
 */

export interface RuntimeTowerType {
  id: string;
  name: string;
  cost: number;
  rangeHops: number;
  damage: number;
  cooldownTicks: number;
}

export interface RuntimeEnemyType {
  id: string;
  name: string;
  hp: number;
  /** Cells per second; per-tick movement derives from this and the tick rate. */
  speed: number;
  killReward: number;
}

export interface RuntimeSpawnGroup {
  enemyTypeId: string;
  count: number;
  intervalTicks: number;
}

export interface RuntimeWave {
  groups: readonly RuntimeSpawnGroup[];
}

export interface RuntimeBalance {
  towers: ReadonlyMap<string, RuntimeTowerType>;
  enemies: ReadonlyMap<string, RuntimeEnemyType>;
  waves: readonly RuntimeWave[];
  interWaveDelayTicks: number;
}

/** Raw authored balance, exactly as the data modules express it. */
export interface RawBalance {
  towers: readonly TowerDef[];
  enemies: readonly EnemyTypeDef[];
  waves: readonly WaveDef[];
  interWaveDelaySeconds: number;
}

export function secondsToTicks(seconds: number): number {
  return Math.max(1, Math.round(seconds * TICK_RATE_HZ));
}

function requirePositive(value: number, label: string): number {
  if (!(value > 0)) {
    throw new Error(`balance data: ${label} must be > 0, got ${value}`);
  }
  return value;
}

function requireNonNegativeInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`balance data: ${label} must be a non-negative integer, got ${value}`);
  }
  return value;
}

function requirePositiveInt(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`balance data: ${label} must be a positive integer, got ${value}`);
  }
  return value;
}

export function buildRuntimeBalance(raw: RawBalance): RuntimeBalance {
  const towers = new Map<string, RuntimeTowerType>();
  for (const def of raw.towers) {
    requirePositive(def.cost, `tower ${def.id} cost`);
    requirePositive(def.damage, `tower ${def.id} damage`);
    requirePositive(def.cooldownSeconds, `tower ${def.id} cooldownSeconds`);
    towers.set(def.id, {
      id: def.id,
      name: def.name,
      cost: def.cost,
      rangeHops: requireNonNegativeInt(def.rangeHops, `tower ${def.id} rangeHops`),
      damage: def.damage,
      cooldownTicks: secondsToTicks(def.cooldownSeconds),
    });
  }

  const enemies = new Map<string, RuntimeEnemyType>();
  for (const def of raw.enemies) {
    requirePositive(def.hp, `enemy ${def.id} hp`);
    requirePositive(def.speedCellsPerSecond, `enemy ${def.id} speedCellsPerSecond`);
    enemies.set(def.id, {
      id: def.id,
      name: def.name,
      hp: def.hp,
      speed: def.speedCellsPerSecond,
      killReward: def.killReward,
    });
  }

  const waves = raw.waves.map((wave, waveIndex) => ({
    groups: wave.groups.map((group, groupIndex): RuntimeSpawnGroup => {
      if (!enemies.has(group.enemyType)) {
        throw new Error(
          `balance data: wave ${waveIndex} group ${groupIndex} references unknown enemy type "${group.enemyType}"`,
        );
      }
      return {
        enemyTypeId: group.enemyType,
        count: requirePositiveInt(group.count, `wave ${waveIndex} group ${groupIndex} count`),
        intervalTicks: secondsToTicks(
          requirePositive(group.intervalSeconds, `wave ${waveIndex} group ${groupIndex} intervalSeconds`),
        ),
      };
    }),
  }));

  return {
    towers,
    enemies,
    waves,
    interWaveDelayTicks: secondsToTicks(raw.interWaveDelaySeconds),
  };
}

export function currentRawBalance(): RawBalance {
  return {
    towers: TOWER_TYPES,
    enemies: ENEMY_TYPES,
    waves: WAVES,
    interWaveDelaySeconds: INTER_WAVE_DELAY_SECONDS,
  };
}

let current = buildRuntimeBalance(currentRawBalance());

/** Tick-rate-normalized snapshot the simulation reads via indirect accessor. */
export function getBalance(): RuntimeBalance {
  return current;
}

/**
 * Publishes a new snapshot (initial load or tuning hot-apply). Callers own
 * invalidating derived state affected by the new numbers (e.g. coverage
 * after range edits); pathing is never affected by balance data.
 */
export function applyRawBalance(raw: RawBalance): RuntimeBalance {
  current = buildRuntimeBalance(raw);
  rawOfRecord = raw;
  notify();
  return current;
}

/**
 * Hot-apply entry point for self-accepting data modules: merges one source's
 * fresh snapshot over the latest raw balance and republishes through the
 * same conversion boundary as initial load.
 */
export function patchRawBalance(patch: Partial<RawBalance>): RuntimeBalance {
  return applyRawBalance({
    towers: patch.towers ?? lastRaw().towers,
    enemies: patch.enemies ?? lastRaw().enemies,
    waves: patch.waves ?? lastRaw().waves,
    interWaveDelaySeconds: patch.interWaveDelaySeconds ?? lastRaw().interWaveDelaySeconds,
  });
}

type BalanceListener = (balance: RuntimeBalance) => void;

const listeners = new Set<BalanceListener>();

/**
 * Subscribes to tuning hot-applies; returns an unsubscribe fn (owners must
 * clean up when their world dies, e.g. across rendering-module HMR swaps).
 */
export function onBalanceApplied(listener: BalanceListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener(current);
  }
}

let rawOfRecord: RawBalance = currentRawBalance();

/** Latest authored balance exactly as received from the data modules. */
function lastRaw(): RawBalance {
  return rawOfRecord;
}

// Consumes pushes from self-accepting data modules (design D5): each patch
// merges over the latest raw balance and republishes through the normal
// conversion boundary. Wired at the bottom of the module so init order
// stays independent of evaluation order.
setBalancePatchConsumer((patch) => {
  applyRawBalance({ ...lastRaw(), ...patch });
});
