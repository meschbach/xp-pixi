import { describe, expect, it } from 'vitest';

import {
  HEX_DIRECTIONS,
  cellKey,
  cubeRound,
  hexDistance,
  lexLess,
  neighborOf,
  sameCell,
} from './hex';

describe('HEX_DIRECTIONS', () => {
  it('has exactly six unique directions that sum to zero', () => {
    expect(HEX_DIRECTIONS).toHaveLength(6);
    const keys = new Set(HEX_DIRECTIONS.map(cellKey));
    expect(keys.size).toBe(6);

    const sum = HEX_DIRECTIONS.reduce((acc, d) => ({ q: acc.q + d.q, r: acc.r + d.r }), { q: 0, r: 0 });
    expect(sum).toEqual({ q: 0, r: 0 });
  });

  it('every direction is a single hop away', () => {
    const origin = { q: 0, r: 0 };
    for (const dir of HEX_DIRECTIONS) {
      expect(hexDistance(origin, neighborOf(origin, dir))).toBe(1);
    }
  });
});

describe('hexDistance', () => {
  it('is zero for identical cells', () => {
    expect(hexDistance({ q: 2, r: -3 }, { q: 2, r: -3 })).toBe(0);
  });

  it('measures axis-aligned hops', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 4, r: 0 })).toBe(4);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 5 })).toBe(5);
  });

  it('measures diagonal hops correctly', () => {
    // (|dq| + |dr| + |dq+dr|) / 2 = (3 + 2 + 1) / 2 = 3
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 })).toBe(3);
    // (3 + 3 + 0) / 2 = 3
    expect(hexDistance({ q: -1, r: 2 }, { q: 2, r: -1 })).toBe(3);
  });

  it('is symmetric', () => {
    const a = { q: 7, r: -2 };
    const b = { q: -3, r: 5 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });
});

describe('neighborOf', () => {
  it('offsets by the given direction', () => {
    expect(neighborOf({ q: 1, r: 2 }, { q: -1, r: 1 })).toEqual({ q: 0, r: 3 });
  });
});

describe('cubeRound', () => {
  it('leaves integer coordinates unchanged, including negatives', () => {
    for (const c of [{ q: 0, r: 0 }, { q: 3, r: -7 }, { q: -12, r: 5 }]) {
      expect(cubeRound(c.q, c.r)).toEqual(c);
    }
  });

  it('rounds small fractional noise back to the nearest cell', () => {
    expect(cubeRound(1.03, -0.07)).toEqual({ q: 1, r: 0 });
    expect(cubeRound(-2.04, 3.06)).toEqual({ q: -2, r: 3 });
  });

  it('resolves midpoints deterministically to a valid cube coordinate', () => {
    for (const [qf, rf] of [[0.5, 0], [0.5, -0.25], [-0.5, 0.5], [10.5, -5.5]] as const) {
      const rounded = cubeRound(qf, rf);
      // cube constraint: x + y + z == 0 is enforced by construction; axial stays integral
      expect(Number.isInteger(rounded.q)).toBe(true);
      expect(Number.isInteger(rounded.r)).toBe(true);
      // deterministic: same input, same output
      expect(cubeRound(qf, rf)).toEqual(rounded);
    }
    expect(cubeRound(0.6, -0.05)).toEqual({ q: 1, r: 0 });
    expect(cubeRound(0.4, -0.05)).toEqual({ q: 0, r: 0 });
  });
});

describe('helpers', () => {
  it('cellKey encodes coordinates stably', () => {
    expect(cellKey({ q: 3, r: -4 })).toBe('3,-4');
  });

  it('sameCell and lexLess order coordinates deterministically', () => {
    expect(sameCell({ q: 1, r: 1 }, { q: 1, r: 1 })).toBe(true);
    expect(sameCell({ q: 1, r: 1 }, { q: 1, r: 2 })).toBe(false);
    expect(lexLess({ q: 1, r: 0 }, { q: 1, r: 1 })).toBe(true);
    expect(lexLess({ q: 0, r: 9 }, { q: 1, r: 0 })).toBe(true);
    expect(lexLess({ q: 1, r: 0 }, { q: 0, r: 9 })).toBe(false);
  });
});
