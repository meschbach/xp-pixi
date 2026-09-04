import { describe, expect, it } from 'vitest';

import { createGameMap } from './map';
import type { GameMap } from './map';
import { tryPlaceTower } from './placement';
import { createWorld } from './world';
import type { World } from './world';

/** Row 0 is a corridor; row 1 lets towers sit off-path without severing it. */
function corridorWithShoulder(width: number): GameMap {
  return createGameMap({ width, height: 2, spawn: { q: 0, r: 0 }, goal: { q: width - 1, r: 0 } });
}

/**
 * Places an arrow tower at (7,1) over a stationary enemy at (8,0) so the
 * tower fires on the configured cooldown (27 ticks).
 */
function setup() {
  const world = createWorld({ map: corridorWithShoulder(12), startingMoney: 1000, startingLives: 9 });
  world.spawnEnemy({ hp: 999, speed: 0, killReward: 5 });
  Object.assign(world.enemies[0]!, { fromCell: { q: 8, r: 0 }, toCell: { q: 8, r: 0 } });
  expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });
  return { world };
}

/** Runs the world until the predicate holds or `max` ticks pass; returns ticks taken. */
function ticksUntil(world: World, predicate: () => boolean, max = 200): number {
  for (let i = 0; i < max; i++) {
    world.tick();
    if (predicate()) {
      return i + 1;
    }
  }
  return -1;
}

describe('combat event outbox', () => {
  it('emits exactly one shot event per attack with the correct payload', () => {
    const { world } = setup();
    ticksUntil(world, () => world.combatEvents.length >= 1);

    const tower = world.towers[0]!;
    const target = world.enemies[0]!;
    expect(world.combatEvents).toHaveLength(1);
    const event = world.combatEvents[0]!;
    expect(event.kind).toBe('shot');
    expect(event.towerId).toBe(tower.id);
    expect(event.targetId).toBe(target.id);
    expect(event.tick).toBeGreaterThan(0);
    expect(event.targetCell).toEqual(target.fromCell);
    expect(event.targetToCell).toEqual(target.toCell);
    expect(event.targetProgress).toBe(0);
  });

  it('captures the target hop cells/progress at fire time even as the enemy moves', () => {
    // A moving enemy: capture the exact fire-time toCell/progress, then keep
    // stepping and confirm the event's anchor fields do not change.
    const world = createWorld({ map: corridorWithShoulder(12), startingMoney: 1000, startingLives: 9 });
    expect(tryPlaceTower(world, { q: 7, r: 1 })).toEqual({ ok: true });
    world.spawnEnemy({ hp: 999, speed: 2, killReward: 5 }); // moves toward goal

    const taken = ticksUntil(world, () => world.combatEvents.length >= 1);
    expect(taken).toBeGreaterThan(0);
    const event = world.combatEvents[0]!;
    const snapshot = { cell: { ...event.targetCell }, to: { ...event.targetToCell }, progress: event.targetProgress };

    // Enemy keeps hopping; its live toCell/progress diverge from fire time.
    ticksUntil(world, () => !(world.enemies[0]!.fromCell.q === snapshot.cell.q && world.enemies[0]!.toCell.q === snapshot.to.q && world.enemies[0]!.toCell.r === snapshot.to.r));
    expect(event.targetCell).toEqual(snapshot.cell);
    expect(event.targetToCell).toEqual(snapshot.to);
    expect(event.targetProgress).toBe(snapshot.progress);
  });

  it('assigns monotonic ids ordered by tick, never reused after acknowledgment', () => {
    const { world } = setup();
    let priorId = -1;
    let priorTick = -1;
    let shots = 0;
    for (let i = 0; i < 120; i++) {
      world.tick();
      for (const event of world.combatEvents.slice(0)) {
        if (event.id > priorId) {
          expect(event.id).toBe(priorId + 1);
          expect(event.tick).toBeGreaterThanOrEqual(priorTick);
          priorId = event.id;
          priorTick = event.tick;
          shots++;
        }
      }
      // Simulate a drifting consumer that acks behind schedule.
      if (i % 10 === 0) {
        world.ackEvents(world.combatEvents[world.combatEvents.length - 1]?.id ?? -1);
      }
    }
    expect(shots).toBeGreaterThan(3);
  });

  it('acknowledgment trims the outbox, keeping it bounded', () => {
    const { world } = setup();
    // Fire several shots before acking anything.
    ticksUntil(world, () => world.combatEvents.length >= 3);

    const drainedId = world.combatEvents[world.combatEvents.length - 1]!.id;
    const liveBefore = world.combatEvents.length;
    expect(liveBefore).toBeGreaterThanOrEqual(3);

    world.ackEvents(drainedId);
    world.tick(); // trim runs at the top of the next tick
    expect(world.combatEvents).toHaveLength(0);
  });

  it('acknowledgment that does not advance the cursor is ignored', () => {
    const { world } = setup();
    ticksUntil(world, () => world.combatEvents.length >= 2);

    const firstId = world.combatEvents[0]!.id;
    world.ackEvents(firstId);
    world.tick();
    const remaining = world.combatEvents.length;
    expect(remaining).toBeGreaterThan(0);

    // Re-acking the same (or lower) cursor must not reclaim anything further.
    world.ackEvents(firstId);
    world.tick();
    expect(world.combatEvents.length).toBe(remaining);
  });

  it('never reclaims an event a live consumer has not yet drained', () => {
    const { world } = setup();
    // A consumer holds a cursor below the newest event.
    ticksUntil(world, () => world.combatEvents.length >= 2);
    const cursor = world.combatEvents[0]!.id; // acknowledges the first only

    world.ackEvents(cursor);
    for (let i = 0; i < 5; i++) {
      world.tick();
    }
    // The second (undrained) event survived; the first was reclaimed.
    const events = world.combatEvents;
    expect(events.some((e) => e.id === cursor)).toBe(false);
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.id).toBeGreaterThan(cursor);
    }
  });

  it('consumer starting at the head receives nothing pre-existing', () => {
    const { world } = setup();
    // Some events already exist from earlier ticks.
    ticksUntil(world, () => world.combatEvents.length >= 1);
    const headId = world.combatEvents[world.combatEvents.length - 1]!.id;

    // A fresh consumer seeds its cursor at the head, then reads forward.
    let cursor = headId;
    for (let i = 0; i < 5; i++) {
      world.tick();
      for (const event of world.combatEvents) {
        if (event.id > cursor) {
          expect(event.id).toBe(cursor + 1);
          cursor = event.id;
        }
      }
    }
  });
});

describe('persisted entity identity', () => {
  it('assigns unique ids across towers and enemies from one counter', () => {
    const world = createWorld({ map: corridorWithShoulder(12), startingMoney: 1000, startingLives: 9 });

    // Three enemies and two towers interleaved.
    world.spawnEnemy({ hp: 1, speed: 0, killReward: 5 });
    expect(tryPlaceTower(world, { q: 1, r: 1 })).toEqual({ ok: true });
    world.spawnEnemy({ hp: 1, speed: 0, killReward: 5 });
    expect(tryPlaceTower(world, { q: 2, r: 1 })).toEqual({ ok: true });
    world.spawnEnemy({ hp: 1, speed: 0, killReward: 5 });

    const ids = new Set<number>();
    for (const enemy of world.enemies) {
      expect(ids.has(enemy.id)).toBe(false);
      ids.add(enemy.id);
    }
    for (const tower of world.towers) {
      expect(ids.has(tower.id)).toBe(false);
      ids.add(tower.id);
    }
  });

  it('keeps event ids unique across trims / consumer acks (world survival)', () => {
    const { world } = setup();
    const seen = new Set<number>();
    let cursor = -1;

    for (let i = 0; i < 200; i++) {
      world.tick();
      for (const event of world.combatEvents) {
        if (event.id <= cursor) {
          continue;
        }
        // Forward from our cursor: ids must be strictly increasing and novel.
        expect(event.id).toBe(cursor + 1);
        expect(seen.has(event.id)).toBe(false);
        seen.add(event.id);
        cursor = event.id;
      }
      // Ack behind schedule so trimming actually happens.
      if (i % 50 === 0) {
        world.ackEvents(cursor);
      }
    }
  });
});
