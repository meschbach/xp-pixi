import { describe, expect, it } from 'vitest';

import { createEventDrainer } from './eventDrain';
import type { CombatEvent } from '../simulation/events';

function event(id: number, tick = id): CombatEvent {
  return {
    kind: 'shot',
    id,
    tick,
    towerId: 1,
    targetId: 2,
    targetCell: { q: 0, r: 0 },
    targetToCell: { q: 1, r: 0 },
    targetProgress: 0,
  };
}

describe('createEventDrainer (2.2)', () => {
  it('seeds at the head and delivers nothing pre-existing', () => {
    const drainer = createEventDrainer();
    const existing = [event(0), event(1), event(2)];
    expect(drainer.drain(existing)).toEqual([]);
    expect(drainer.getCursor()).toBe(2);
  });

  it('delivers only newly arrived events after seeding', () => {
    const drainer = createEventDrainer();
    drainer.drain([event(0), event(1)]);
    expect(drainer.getCursor()).toBe(1);

    const fresh = drainer.drain([event(1), event(2), event(3)]);
    expect(fresh.map((e) => e.id)).toEqual([2, 3]);
    expect(drainer.getCursor()).toBe(3);
  });

  it('returns nothing for an empty outbox', () => {
    const drainer = createEventDrainer();
    expect(drainer.drain([])).toEqual([]);
    expect(drainer.getCursor()).toBe(-1);

    // A later empty drain stays empty.
    expect(drainer.drain([])).toEqual([]);
    expect(drainer.getCursor()).toBe(-1);
  });
});
