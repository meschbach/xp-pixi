import { describe, expect, it } from 'vitest';

import {
  aimAngle,
  enemyMarkerOffset,
  interpolatedPosition,
  resolveTowerShape,
  tetherPulse,
  towerIdentity,
  ACCENT_PALETTE,
} from './targeting';

const toPoint = (c: { q: number; r: number }) => ({ x: c.q * 34, y: c.r * 34 });

describe('interpolatedPosition (2.1)', () => {
  it('places a mid-hop target between from and to', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 2, r: 0 };
    const p = interpolatedPosition(from, to, 0.5, toPoint);
    expect(p.x).toBe(34);
    expect(p.y).toBe(0);
  });

  it('returns from at progress 0 and to at progress 1', () => {
    const from = { q: 0, r: 0 };
    const to = { q: 3, r: 1 };
    expect(interpolatedPosition(from, to, 0, toPoint)).toEqual({ x: 0, y: 0 });
    expect(interpolatedPosition(from, to, 1, toPoint)).toEqual({ x: 102, y: 34 });
  });
});

describe('aimAngle (2.1)', () => {
  it('aims east (up → +X) as a +π/2 clockwise rotation', () => {
    // Target directly to the right of the tower center: a quarter turn.
    expect(aimAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('aims up (target directly above) as zero rotation (already pointing up)', () => {
    expect(aimAngle({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0, 6);
  });

  it('returns undefined for the degenerate self-cell (same position)', () => {
    expect(aimAngle({ x: 5, y: 5 }, { x: 5, y: 5 })).toBeUndefined();
  });

  it('points down-right for a target below-right (3π/4 from up)', () => {
    const angle = aimAngle({ x: 0, y: 0 }, { x: 10, y: 10 })!;
    expect(angle).toBeCloseTo((3 * Math.PI) / 4, 6);
  });
});

describe('towerIdentity (2.3)', () => {
  it('keys every tower into one of the five accent identities', () => {
    for (let id = 0; id < 10; id++) {
      const identity = towerIdentity(id);
      expect(ACCENT_PALETTE).toContain(identity.color);
      expect(identity.pattern.length).toBeGreaterThan(0);
      expect(identity.glyph.length).toBeGreaterThan(0);
    }
  });

  it('is stable across id sequences (placement order does not shift it)', () => {
    const a = towerIdentity(3);
    // Placing towers 0,1,2 first must not change tower 3's booking.
    for (let id = 0; id < 3; id++) {
      towerIdentity(id);
    }
    expect(towerIdentity(3)).toEqual(a);
  });

  it('identical ids yield identical (color, pattern, glyph) bookings', () => {
    expect(towerIdentity(7)).toEqual(towerIdentity(7));
  });

  it('adjacent ids cycle distinct colors', () => {
    for (let id = 0; id < ACCENT_PALETTE.length; id++) {
      expect(towerIdentity(id).color).toBe(ACCENT_PALETTE[id]);
    }
  });
});

describe('resolveTowerShape (2.3)', () => {
  it('resolves a known type to its shape', () => {
    expect(resolveTowerShape('arrow')).toBe('triangle');
  });

  it('falls back to the default for unknown types', () => {
    expect(resolveTowerShape('no-such-type')).toBe('triangle');
  });
});

describe('enemyMarkerOffset (2.4)', () => {
  it('N=1 is centered', () => {
    expect(enemyMarkerOffset(0, 1, 7)).toEqual({ x: 0, y: 0 });
    expect(enemyMarkerOffset(5, 1, 7)).toEqual({ x: 0, y: 0 });
  });

  it('N=2 is left/right', () => {
    const left = enemyMarkerOffset(0, 2, 7);
    const right = enemyMarkerOffset(1, 2, 7);
    expect(left.x).toBe(-7);
    expect(left.y).toBe(0);
    expect(right.x).toBe(7);
    expect(right.y).toBe(0);
  });

  it('N=3 forms a triangle with radius r', () => {
    const offsets = [enemyMarkerOffset(0, 3, 7), enemyMarkerOffset(1, 3, 7), enemyMarkerOffset(2, 3, 7)];
    for (const o of offsets) {
      expect(Math.hypot(o.x, o.y)).toBeCloseTo(7, 6);
    }
    // Distinct directions.
    expect(new Set(offsets.map((o) => `${Math.round(o.x)},${Math.round(o.y)}`)).size).toBe(3);
  });

  it('N=4 forms a square with radius r', () => {
    const offsets = [0, 1, 2, 3].map((id) => enemyMarkerOffset(id, 4, 7));
    for (const o of offsets) {
      expect(Math.hypot(o.x, o.y)).toBeCloseTo(7, 6);
    }
    expect(new Set(offsets.map((o) => `${Math.round(o.x)},${Math.round(o.y)}`)).size).toBe(4);
  });

  it('is deterministic across id sequences and counts', () => {
    expect(enemyMarkerOffset(4, 3, 7)).toEqual(enemyMarkerOffset(4, 3, 7));
    expect(enemyMarkerOffset(9, 3, 7)).toEqual(enemyMarkerOffset(9, 3, 7));
  });
});

describe('tetherPulse (2.4)', () => {
  it('is a 0→1 sawtooth over the period', () => {
    const period = 60;
    const a = tetherPulse(0, 0);
    const b = tetherPulse(0, period); // one full period later, same phase
    const c = tetherPulse(0, period / 2);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeCloseTo(a, 8);
    expect(c).toBeGreaterThan(a);
    expect(c).toBeLessThan(1);
  });

  it('adjacent ids have distinct phases for simultaneous time', () => {
    const phases = new Set<number>();
    for (let id = 0; id < ACCENT_PALETTE.length; id++) {
      phases.add(tetherPulse(id, 1234));
    }
    expect(phases.size).toBe(ACCENT_PALETTE.length);
  });
});
