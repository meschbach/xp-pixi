import { describe, expect, it, vi } from 'vitest';
import { GestureFsm, LONG_PRESS_DURATION_MS, TAP_DURATION_MS, TAP_SLOP_PX } from './gestureFsm';
import type { GestureEvent, PointerRecord } from './gestureFsm';

function makePointer(overrides: Partial<PointerRecord> = {}): PointerRecord {
  return {
    pointerId: 1,
    x: 100,
    y: 100,
    pointerType: 'touch',
    button: 0,
    timestamp: 0,
    ...overrides,
  };
}

function collectEvents(): { fsm: GestureFsm; events: GestureEvent[] } {
  const events: GestureEvent[] = [];
  const fsm = new GestureFsm((e) => events.push(e));
  return { fsm, events };
}

describe('GestureFsm', () => {
  describe('tap detection', () => {
    it('emits TAP for a quick still touch', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe('TAP');
    });

    it('does not emit TAP when movement exceeds slop', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0, x: 100, y: 100 }));
      fsm.pointerMove(makePointer({ timestamp: 50, x: 100 + TAP_SLOP_PX + 1, y: 100 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });

    it('does not emit TAP when duration exceeds threshold', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerUp(makePointer({ timestamp: TAP_DURATION_MS + 1 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });
  });

  describe('long press', () => {
    it('emits LONG_PRESS after held touch within slop', () => {
      vi.useFakeTimers();
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS + 10);
      const longPresses = events.filter((e) => e.type === 'LONG_PRESS');
      expect(longPresses).toHaveLength(1);
      vi.useRealTimers();
    });

    it('does not emit LONG_PRESS when movement exceeds slop', () => {
      vi.useFakeTimers();
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0, x: 100, y: 100 }));
      fsm.pointerMove(makePointer({ timestamp: 50, x: 100 + TAP_SLOP_PX + 5, y: 100 }));
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS + 10);
      const longPresses = events.filter((e) => e.type === 'LONG_PRESS');
      expect(longPresses).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  describe('pan', () => {
    it('emits PAN_START and PAN_MOVE for touch drag beyond slop', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      const panStarts = events.filter((e) => e.type === 'PAN_START');
      const panMoves = events.filter((e) => e.type === 'PAN_MOVE');
      expect(panStarts).toHaveLength(1);
      expect(panMoves.length).toBeGreaterThanOrEqual(1);
    });

    it('does not pan on primary-button mouse drag', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'mouse', button: 0, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'mouse', button: 0, x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      const panStarts = events.filter((e) => e.type === 'PAN_START');
      expect(panStarts).toHaveLength(0);
    });

    it('pans on middle-button mouse drag', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'mouse', button: 1, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'mouse', button: 1, x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      const panStarts = events.filter((e) => e.type === 'PAN_START');
      expect(panStarts).toHaveLength(1);
    });
  });

  describe('pinch', () => {
    it('emits PINCH_START when second pointer lands', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, x: 200, y: 100, timestamp: 10 }));
      const pinchStarts = events.filter((e) => e.type === 'PINCH_START');
      expect(pinchStarts).toHaveLength(1);
    });

    it('emits PINCH_MOVE with distance ratio and midpoint delta', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, x: 200, y: 100, timestamp: 10 }));
      fsm.pointerMove(makePointer({ pointerId: 1, x: 80, y: 100, timestamp: 20 }));
      fsm.pointerMove(makePointer({ pointerId: 2, x: 220, y: 100, timestamp: 20 }));
      const pinchMoves = events.filter((e) => e.type === 'PINCH_MOVE');
      expect(pinchMoves.length).toBeGreaterThanOrEqual(1);
      const last = pinchMoves[pinchMoves.length - 1]!;
      if (last.type === 'PINCH_MOVE') {
        expect(last.distanceRatio).toBeGreaterThan(1);
      }
    });

    it('suppresses taps after multi-pointer sequence', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, x: 200, y: 100, timestamp: 10 }));
      fsm.pointerUp(makePointer({ pointerId: 1, timestamp: 20 }));
      fsm.pointerUp(makePointer({ pointerId: 2, timestamp: 20 }));
      fsm.pointerDown(makePointer({ pointerId: 3, x: 100, y: 100, timestamp: 30 }));
      fsm.pointerUp(makePointer({ pointerId: 3, timestamp: 50 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });
  });

  describe('cancel', () => {
    it('aborts to IDLE silently on pointercancel', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerCancel();
      expect(fsm.getState()).toBe('IDLE');
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });

    it('aborts a pan silently', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      fsm.pointerCancel();
      expect(fsm.getState()).toBe('IDLE');
      const panEnds = events.filter((e) => e.type === 'PAN_END');
      expect(panEnds).toHaveLength(1);
    });

    it('aborts from PRESSED state with no events', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerCancel();
      expect(events).toHaveLength(0);
    });
  });

  describe('state transitions', () => {
    it('starts in IDLE state', () => {
      const { fsm } = collectEvents();
      expect(fsm.getState()).toBe('IDLE');
    });

    it('transitions to PRESSED after pointerDown', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      expect(fsm.getState()).toBe('PRESSED');
    });

    it('transitions to IDLE after pointerUp (tap)', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      expect(fsm.getState()).toBe('IDLE');
    });

    it('transitions to PANNING after movement beyond slop', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      expect(fsm.getState()).toBe('PANNING');
    });

    it('transitions to IDLE after pointerUp (from pan)', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', timestamp: 100 }));
      expect(fsm.getState()).toBe('IDLE');
    });

    it('transitions to PINCHING after second pointer down', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, timestamp: 10 }));
      expect(fsm.getState()).toBe('PINCHING');
    });

    it('transitions to IDLE after all pointers up (from pinch)', () => {
      const { fsm } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, timestamp: 10 }));
      fsm.pointerUp(makePointer({ pointerId: 1, timestamp: 20 }));
      fsm.pointerUp(makePointer({ pointerId: 2, timestamp: 30 }));
      expect(fsm.getState()).toBe('IDLE');
    });
  });

  describe('TAP event details', () => {
    it('emits TAP with correct coordinates from tracked pointer', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ x: 100, y: 200, timestamp: 0 }));
      fsm.pointerMove(makePointer({ x: 105, y: 203, timestamp: 50 }));
      fsm.pointerUp(makePointer({ x: 105, y: 203, timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
      if (taps[0]!.type === 'TAP') {
        expect(taps[0]!.x).toBe(105);
        expect(taps[0]!.y).toBe(203);
      }
    });

    it('emits TAP with correct pointerType', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', timestamp: 0 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
      if (taps[0]!.type === 'TAP') {
        expect(taps[0]!.pointerType).toBe('touch');
      }
    });

    it('pointerUp without pointerDown does nothing', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      expect(events).toHaveLength(0);
      expect(fsm.getState()).toBe('IDLE');
    });

    it('pointerMove without pointerDown does nothing', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerMove(makePointer({ timestamp: 50 }));
      expect(events).toHaveLength(0);
      expect(fsm.getState()).toBe('IDLE');
    });

    it('wrong pointer ID pointerUp does not resolve state', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, timestamp: 0 }));
      fsm.pointerUp(makePointer({ pointerId: 999, timestamp: 100 }));
      expect(fsm.getState()).toBe('PRESSED');
      expect(events).toHaveLength(0);
    });

    it('sequential taps both emit TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      fsm.pointerDown(makePointer({ timestamp: 200 }));
      fsm.pointerUp(makePointer({ timestamp: 300 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(2);
    });

    it('tap after pinch suppression window expires emits TAP', () => {
      vi.useFakeTimers();
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerId: 1, timestamp: 0 }));
      fsm.pointerDown(makePointer({ pointerId: 2, timestamp: 10 }));
      fsm.pointerUp(makePointer({ pointerId: 1, timestamp: 20 }));
      fsm.pointerUp(makePointer({ pointerId: 2, timestamp: 30 }));
      vi.advanceTimersByTime(150);
      fsm.pointerDown(makePointer({ pointerId: 3, timestamp: 200 }));
      fsm.pointerUp(makePointer({ pointerId: 3, timestamp: 250 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
      vi.useRealTimers();
    });

    it('long press then finger lift emits only LONG_PRESS, no TAP', () => {
      vi.useFakeTimers();
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ timestamp: 0 }));
      vi.advanceTimersByTime(LONG_PRESS_DURATION_MS + 10);
      fsm.pointerUp(makePointer({ timestamp: LONG_PRESS_DURATION_MS + 50 }));
      const longPresses = events.filter((e) => e.type === 'LONG_PRESS');
      const taps = events.filter((e) => e.type === 'TAP');
      expect(longPresses).toHaveLength(1);
      expect(taps).toHaveLength(0);
      vi.useRealTimers();
    });

    it('pan then release emits only PAN_END, no TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', timestamp: 100 }));
      const panEnds = events.filter((e) => e.type === 'PAN_END');
      const taps = events.filter((e) => e.type === 'TAP');
      expect(panEnds).toHaveLength(1);
      expect(taps).toHaveLength(0);
    });
  });

  describe('pen pointer type', () => {
    it('pen with button 0 does not transition to PANNING', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'pen', button: 0, x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'pen', button: 0, x: 100 + TAP_SLOP_PX + 5, y: 100, timestamp: 50 }));
      expect(fsm.getState()).toBe('PRESSED');
      const panStarts = events.filter((e) => e.type === 'PAN_START');
      expect(panStarts).toHaveLength(0);
    });

    it('pen TAP is emitted correctly', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'pen', timestamp: 0 }));
      fsm.pointerUp(makePointer({ pointerType: 'pen', timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
      if (taps[0]!.type === 'TAP') {
        expect(taps[0]!.pointerType).toBe('pen');
      }
    });
  });

  describe('slop boundary tests', () => {
    it('movement of exactly TAP_SLOP_PX suppresses TAP (d < TAP_SLOP_PX means exactly 10 is NOT OK)', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ x: 100 + TAP_SLOP_PX, y: 100, timestamp: 50 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });

    it('movement of TAP_SLOP_PX - 1 emits TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ x: 100 + TAP_SLOP_PX - 1, y: 100, timestamp: 50 }));
      fsm.pointerUp(makePointer({ timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
    });

    it('movement of TAP_SLOP_PX + 1 suppresses TAP and emits PAN for touch', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 100 + TAP_SLOP_PX + 1, y: 100, timestamp: 50 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      const panStarts = events.filter((e) => e.type === 'PAN_START');
      expect(taps).toHaveLength(0);
      expect(panStarts).toHaveLength(1);
    });

    it('diagonal movement of 8px in x + 8px in y (distance ~11.3px) suppresses TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 108, y: 108, timestamp: 50 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });

    it('realistic sloppy tap within slop emits TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ x: 105, y: 103, timestamp: 50 }));
      fsm.pointerUp(makePointer({ x: 105, y: 103, timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(1);
    });

    it('realistic sloppy tap exceeding slop suppresses TAP', () => {
      const { fsm, events } = collectEvents();
      fsm.pointerDown(makePointer({ pointerType: 'touch', x: 100, y: 100, timestamp: 0 }));
      fsm.pointerMove(makePointer({ pointerType: 'touch', x: 107, y: 108, timestamp: 50 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', timestamp: 100 }));
      const taps = events.filter((e) => e.type === 'TAP');
      expect(taps).toHaveLength(0);
    });
  });
});
