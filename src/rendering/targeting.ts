import type { AxialCoord } from '../simulation/hex';

/**
 * Pure, headless-testable render helpers for tower-target visuals. None of
 * these import pixi — they compute values (angles, colors, offsets, phases)
 * that sceneView composes into drawn graphics.
 */

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Interpolated drawn position of an enemy along its committed hop
 * (design D7): `from + (to − from) × progress`.
 */
export function interpolatedPosition(from: AxialCoord, to: AxialCoord, progress: number, toPoint: (c: AxialCoord) => PixelPoint): PixelPoint {
  const f = toPoint(from);
  const t = toPoint(to);
  return {
    x: f.x + (t.x - f.x) * progress,
    y: f.y + (t.y - f.y) * progress,
  };
}

/**
 * Aim angle from a tower toward a target's drawn position, expressed as the
 * clockwise rotation (radians) from the neutral "up" (−Y) orientation that
 * the triangle's authored pose already has. Returns undefined when the
 * target sits on the tower center (degenerate: from/to the same cell), so
 * the caller can hold its prior angle instead of snapping to an arbitrary
 * direction (design D12, task 2.1).
 */
export function aimAngle(towerCenter: PixelPoint, target: PixelPoint): number | undefined {
  const dx = target.x - towerCenter.x;
  const dy = target.y - towerCenter.y;
  if (dx === 0 && dy === 0) {
    return undefined;
  }
  // atan2(dy, dx) is the target's angle from +X; neutral "up" is −Y (angle
  // −π/2 from +X), so the clockwise rotation to face the target is +π/2.
  return Math.atan2(dy, dx) + Math.PI / 2;
}

export const ACCENT_PALETTE = [0x22d3ee, 0xcc55ff, 0xee2d8a, 0xb8e986, 0x0d9aa3] as const;

export type TetherPattern = 'solid' | 'long-dash' | 'short-dash' | 'dash-dot' | 'dotted';
export type MarkerGlyph = 'ring' | 'dot' | 'diamond' | 'square' | 'triangle';

const TETHER_PATTERNS: readonly TetherPattern[] = ['solid', 'long-dash', 'short-dash', 'dash-dot', 'dotted'];
const MARKER_GLYPHS: readonly MarkerGlyph[] = ['ring', 'dot', 'diamond', 'square', 'triangle'];

export interface TowerIdentity {
  color: number;
  pattern: TetherPattern;
  glyph: MarkerGlyph;
}

/**
 * Per-tower identity booking (design D8/D13): color + tether pattern + enemy
 * marker glyph, all keyed by `id % N` so they never drift out of phase.
 */
export function towerIdentity(id: number): TowerIdentity {
  const n = ACCENT_PALETTE.length;
  const idx = ((id % n) + n) % n; // positive modulo for id ≥ 0 / negative ids
  return {
    color: ACCENT_PALETTE[idx]!,
    pattern: TETHER_PATTERNS[idx]!,
    glyph: MARKER_GLYPHS[idx]!,
  };
}

export type TowerShape = 'triangle';

/** Known tower types → drawn shape. Unknown types fall back to the default. */
const TOWER_SHAPES: ReadonlyMap<string, TowerShape> = new Map<string, TowerShape>([['arrow', 'triangle']]);

export const DEFAULT_TOWER_SHAPE: TowerShape = 'triangle';

/** Resolves a tower's drawn shape by its stable typeId (design D9). */
export function resolveTowerShape(typeId: string): TowerShape {
  return TOWER_SHAPES.get(typeId) ?? DEFAULT_TOWER_SHAPE;
}

/**
 * Fan-out offset of a tower's enemy marker around a shared target's center
 * (design D15): deterministic by tower id for a given count N, so links
 * separate by position. N=1 centered, N=2 left/right, N≥3 a regular polygon.
 * The returned offset is relative to the enemy center (add to center x/y).
 */
export function enemyMarkerOffset(towerId: number, count: number, radius: number): PixelPoint {
  const n = Math.max(1, count);
  const corner = ((towerId % n) + n) % n;

  if (n === 1) {
    return { x: 0, y: 0 };
  }
  if (n === 2) {
    // Left / right along the horizontal axis.
    return corner === 0 ? { x: -radius, y: 0 } : { x: radius, y: 0 };
  }
  // Regular polygon, starting at the top vertex.
  const angle = (corner / n) * Math.PI * 2 - Math.PI / 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** Slow pulse period in ticks (design D16: "~2s" at 30 Hz). */
export const PULSE_PERIOD_TICKS = 60;

/**
 * Sawtooth 0→1 progress for the traveling tether pulse (design D16), with an
 * id-based phase offset so parallel tethers do not move in lockstep.
 */
export function tetherPulse(towerId: number, timeTicks: number): number {
  const n = ACCENT_PALETTE.length;
  const phase = ((towerId % n) + n) % n;
  const advance = timeTicks / PULSE_PERIOD_TICKS;
  return (phase / n + advance) % 1;
}
