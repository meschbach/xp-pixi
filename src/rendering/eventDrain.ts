import type { CombatEvent } from '../simulation/events';

/**
 * Watermark drainer for the simulation event outbox (design D2/D3, task 2.2).
 * A consumer seeds its cursor at the outbox head on subscribe — so pre-existing
 * events are never delivered — then drains forward, returning only newly arrived
 * events and advancing a monotonic cursor that can be used for acknowledgment.
 */
export interface EventDrainer {
  /**
   * Returns events with id greater than the current cursor, advancing the
   * cursor to the newest returned (or the head on the first, seeding) call.
   */
  drain(events: readonly CombatEvent[]): CombatEvent[];
  /** The current cursor: the highest id seen so far (−1 before the first seed). */
  getCursor(): number;
}

export function createEventDrainer(): EventDrainer {
  let cursor = -1;
  let seeded = false;

  return {
    drain(events) {
      if (!seeded) {
        seeded = true;
        // Seed at the head so nothing pre-existing is delivered.
        if (events.length > 0) {
          cursor = events[events.length - 1]!.id;
        }
        return [];
      }
      const fresh: CombatEvent[] = [];
      for (const event of events) {
        if (event.id > cursor) {
          fresh.push(event);
        }
      }
      if (fresh.length > 0) {
        cursor = fresh[fresh.length - 1]!.id;
      }
      return fresh;
    },
    getCursor() {
      return cursor;
    },
  };
}
