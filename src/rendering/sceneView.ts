import { Container, Graphics, Text } from 'pixi.js';
import { cellKey } from '../simulation/hex';
import type { AxialCoord } from '../simulation/hex';
import { getBalance } from '../simulation/registry';
import type { World } from '../simulation/world';
import type { BoardLayout } from './hexLayout';
import { axialToPixel, hexPolygon } from './hexLayout';
import { createEventDrainer } from './eventDrain';
import {
  aimAngle,
  enemyMarkerOffset,
  interpolatedPosition,
  resolveTowerShape,
  tetherPulse,
  towerIdentity,
} from './targeting';
import type { MarkerGlyph, TetherPattern, TowerIdentity, TowerShape } from './targeting';

/**
 * Per-frame dynamic layer: enemies (type-distinct circles with an hp hint),
 * towers (shapes by type), persistent targeting (aim orientation, tether,
 * enemy marker, accent ring), and transient fire feedback (muzzle + beam +
 * impact ring) driven by consumed shot events.
 */

const COLOR_HOVER = 0xffffff;
const COLOR_SELECTED = 0xffd43b;
const COLOR_PREVIEW_VALID = 0x8ce99a;
const COLOR_PREVIEW_INVALID = 0xff6b6b;
const COLOR_TOWER = 0xf59f00;
const COLOR_TOWER_STROKE = 0xffd43b;
const COLOR_COVERAGE_FOCUS = 0x74c0fc;
const COLOR_HP_FULL = 0x51cf66;
const COLOR_HP_MID = 0xffa94d;
const COLOR_HP_LOW = 0xff6b6b;
const COLOR_HP_BAR_BG = 0x16161d;
const COLOR_ENTITY_OUTLINE = 0x101018;

const ENEMY_PALETTE = [0xff8787, 0xffd43b, 0x74c0fc, 0xb197fc, 0x63e6be];
const DEFAULT_ENEMY_COLOR = 0xadb5bd;
const DEFAULT_ENEMY_RADIUS = 8;

/** Transient combat effect lifetime in ticks (task 3.3; replaces FLASH_TTL_MS). */
const EFFECT_TTL_TICKS = 7;
const PULSE_TTL_MS = 450;
const FLOAT_TTL_MS = 1000;

/** Idle-settle / aim rotation rate, in radians per tick. */
const AIM_RATE_RAD_PER_TICK = Math.PI / 16;

/** Marker fan-out radius around an enemy center. */
const MARKER_FANOUT_RADIUS = 9;

/** Dash definitions (in px) per tether pattern (design D8). */
const DASH_PATTERNS: Record<TetherPattern, number[] | null> = {
  solid: null,
  'long-dash': [12, 6],
  'short-dash': [6, 4],
  'dash-dot': [8, 4, 2, 4],
  dotted: [2, 4],
};

interface ShotEffect {
  kind: 'shot';
  towerId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
  ageTicks: number;
}

interface PulseEffect {
  key: string;
  ageMs: number;
}

interface FloatText {
  text: Text;
  ageMs: number;
}

export interface PlacementPreview {
  cell: AxialCoord;
  valid: boolean;
  /** Would-be coverage region; empty when invalid. */
  coverage: ReadonlySet<string>;
}

export interface SceneUiState {
  hover: AxialCoord | null;
  selected: AxialCoord | null;
  preview: PlacementPreview | null;
}

export interface SceneView {
  container: Container;
  update(world: World, ui: SceneUiState, dtMs: number): void;
  addCellPulse(cell: AxialCoord): void;
  addFloatText(cell: AxialCoord, message: string, color: number): void;
}

export function createSceneView(layout: BoardLayout): SceneView {
  const container = new Container();
  const focusG = new Graphics();
  const previewG = new Graphics();
  const outlineG = new Graphics();
  const entitiesG = new Graphics();
  const targetingG = new Graphics();
  const fxG = new Graphics();
  container.addChild(focusG, previewG, outlineG, entitiesG, targetingG, fxG);

  // Transient fire feedback spawned from consumed shot events.
  const shotEffects: ShotEffect[] = [];
  const pulses: PulseEffect[] = [];
  const floats: FloatText[] = [];

  // Persistent per-tower aim orientation, keyed by tower id (task 3.1).
  const orientationByTower = new Map<number, number>();

  // Event outbox watermark (design D2/D3): seeded at the head on creation so a
  // recreated view never replays pre-existing events (HMR-safe).
  const eventDrainer = createEventDrainer();

  // Combat effects age against the sim clock (D6): closure-local tick watermark.
  let lastTickCount = 0;

  return {
    container,
    addCellPulse(cell) {
      pulses.push({ key: cellKey(cell), ageMs: 0 });
    },
    addFloatText(cell, message, color) {
      const { x, y } = axialToPixel(layout, cell);
      const text = new Text({
        text: message,
        style: {
          fontFamily: 'monospace',
          fontSize: 14,
          fontWeight: 'bold',
          fill: color,
          stroke: { color: 0x101018, width: 3 },
        },
      });
      text.anchor.set(0.5);
      text.position.set(x, y - layout.tileSize);
      container.addChild(text);
      floats.push({ text, ageMs: 0 });
    },
    update(world, ui, dtMs) {
      const tickDelta = Math.max(0, world.tickCount - lastTickCount);
      lastTickCount = world.tickCount;

      // Order within the frame (D6): drain → spawn → draw → ack, so the sim
      // never reclaims a not-yet-spawned/drawn event.
      const drained = eventDrainer.drain(world.combatEvents);
      for (const event of drained) {
        if (event.kind !== 'shot') {
          continue;
        }
        spawnShotEffect(world, event.towerId, {
          cell: event.targetCell,
          toCell: event.targetToCell,
          progress: event.targetProgress,
        });
      }

      advanceEffects(tickDelta, dtMs);
      drawCoverageFocus(focusG, world, ui);
      drawPreview(previewG, layout, ui);
      drawOutlines(outlineG, layout, ui);
      drawEntities(world);
      drawTargeting(world, tickDelta);

      // Ack after everything was spawned and drawn.
      world.ackEvents(eventDrainer.getCursor());
    },
  };

  function spawnShotEffect(
    world: World,
    towerId: number,
    target: { cell: AxialCoord; toCell: AxialCoord; progress: number },
  ): void {
    const tower = world.towers.find((t) => t.id === towerId);
    const color = towerIdentity(towerId).color;
    if (!tower) {
      // Tower gone; still show the impact at the reconstructed fire-time point.
      const impact = interpolatedPosition(target.cell, target.toCell, target.progress, (c) => axialToPixel(layout, c));
      shotEffects.push({
        kind: 'shot',
        towerId,
        x1: impact.x,
        y1: impact.y,
        x2: impact.x,
        y2: impact.y,
        color,
        ageTicks: 0,
      });
      return;
    }
    const { x, y } = axialToPixel(layout, tower.cell);
    const impact = interpolatedPosition(target.cell, target.toCell, target.progress, (c) => axialToPixel(layout, c));
    shotEffects.push({ kind: 'shot', towerId, x1: x, y1: y, x2: impact.x, y2: impact.y, color, ageTicks: 0 });
  }

  function advanceEffects(tickDelta: number, dtMs: number): void {
    fxG.clear();

    // Transient combat effects age against the sim clock (D6).
    for (let i = shotEffects.length - 1; i >= 0; i--) {
      const effect = shotEffects[i]!;
      effect.ageTicks += tickDelta;
      if (effect.ageTicks >= EFFECT_TTL_TICKS) {
        shotEffects.splice(i, 1);
        continue;
      }
      drawShotEffect(effect);
    }

    for (let i = pulses.length - 1; i >= 0; i--) {
      const pulse = pulses[i]!;
      pulse.ageMs += dtMs;
      if (pulse.ageMs >= PULSE_TTL_MS) {
        pulses.splice(i, 1);
        continue;
      }
      const [q, r] = pulse.key.split(',').map(Number) as [number, number];
      const t = pulse.ageMs / PULSE_TTL_MS;
      fxG
        .poly(hexPolygon(layout, { q, r }, 0.94))
        .fill({ color: COLOR_PREVIEW_INVALID, alpha: 0.28 * (1 - t) })
        .stroke({ width: 2, color: COLOR_PREVIEW_INVALID, alpha: 1 - t });
    }

    for (let i = floats.length - 1; i >= 0; i--) {
      const float = floats[i]!;
      float.ageMs += dtMs;
      if (float.ageMs >= FLOAT_TTL_MS) {
        float.text.destroy();
        floats.splice(i, 1);
        continue;
      }
      const t = float.ageMs / FLOAT_TTL_MS;
      float.text.y -= dtMs * 0.03;
      float.text.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
  }

  function drawShotEffect(effect: ShotEffect): void {
    const t = effect.ageTicks / EFFECT_TTL_TICKS;
    const fade = 1 - t;
    const bright = effect.color;

    // Impact ring at the reconstructed fire-time position (task 3.3).
    fxG
      .circle(effect.x2, effect.y2, 5 + t * 11)
      .stroke({ width: 2, color: bright, alpha: fade });

    // Beam from tower to impact, bright layer in the firing tower's accent color.
    fxG
      .moveTo(effect.x1, effect.y1)
      .lineTo(effect.x2, effect.y2)
      .stroke({ width: 2, color: bright, alpha: 0.9 * fade });

    // Muzzle flash at the tower.
    fxG.circle(effect.x1, effect.y1, 4 + t * 5).stroke({ width: 2, color: 0xffffff, alpha: fade });
  }

  function drawCoverageFocus(g: Graphics, world: World, ui: SceneUiState): void {
    g.clear();
    const activeFocus = ui.hover ?? ui.selected;
    if (!activeFocus) {
      return;
    }
    const focusKey = cellKey(activeFocus);
    for (const tower of world.towers) {
      if (cellKey(tower.cell) !== focusKey) {
        continue;
      }
      for (const key of tower.coverage) {
        const [q, r] = key.split(',').map(Number) as [number, number];
        g.poly(hexPolygon(layout, { q, r }, 0.94)).fill({ color: COLOR_COVERAGE_FOCUS, alpha: 0.22 });
      }
    }
  }

  function drawEntities(world: World): void {
    entitiesG.clear();
    const visuals = resolveEnemyVisuals();

    for (const tower of world.towers) {
      const { x, y } = axialToPixel(layout, tower.cell);
      const radius = layout.tileSize * 0.62;
      const orientation = orientationByTower.get(tower.id) ?? 0;
      drawTowerShape(entitiesG, x, y, radius, resolveTowerShape(tower.typeId), orientation);
    }

    for (const enemy of world.enemies) {
      const from = axialToPixel(layout, enemy.fromCell);
      const to = axialToPixel(layout, enemy.toCell);
      const x = from.x + (to.x - from.x) * enemy.progress;
      const y = from.y + (to.y - from.y) * enemy.progress;

      const visual = enemy.typeId ? visuals.get(enemy.typeId) : undefined;
      const radius = visual?.radius ?? DEFAULT_ENEMY_RADIUS;
      const color = visual?.color ?? DEFAULT_ENEMY_COLOR;
      entitiesG.circle(x, y, radius).fill(color).stroke({ width: 1.5, color: COLOR_ENTITY_OUTLINE, alpha: 0.7 });

      const fraction = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
      const barWidth = radius * 2.2;
      const barY = y - radius - 6;
      entitiesG
        .rect(x - barWidth / 2, barY, barWidth, 3)
        .fill(COLOR_HP_BAR_BG)
        .rect(x - barWidth / 2, barY, barWidth * fraction, 3)
        .fill(hpColor(fraction));
    }
  }

  function drawTargeting(world: World, tickDelta: number): void {
    targetingG.clear();
    const countMap = computeTargetCounts(world);

    for (const tower of world.towers) {
      const tPoint = axialToPixel(layout, tower.cell);
      const identity: TowerIdentity = towerIdentity(tower.id);

      // Accent ring around the tower (design D13) — always shown.
      targetingG.circle(tPoint.x, tPoint.y, layout.tileSize * 0.62 + 3).stroke({ width: 1.5, color: identity.color, alpha: 0.9 });

      const target = tower.targetId === null ? undefined : world.enemies.find((e) => e.id === tower.targetId);

      // Aim orientation easing (task 3.1): eased toward the target (or toward
      // neutral "up" when idle) at a bounded rate on the sim clock.
      let targetAngle = 0; // neutral "up"
      if (target) {
        const pos = interpolatedPosition(target.fromCell, target.toCell, target.progress, (c) => axialToPixel(layout, c));
        const angle = aimAngle(tPoint, pos);
        if (angle !== undefined) {
          targetAngle = angle;
        }
      }
      const current = orientationByTower.get(tower.id) ?? 0;
      const next = easeAngleToward(current, targetAngle, AIM_RATE_RAD_PER_TICK * tickDelta);
      orientationByTower.set(tower.id, next);

      // Nothing persistent shown when no target or an unresolvable (just-killed) target.
      if (!target) {
        continue;
      }
      const count = countMap.get(target.id) ?? 1;
      const offset = enemyMarkerOffset(tower.id, count, MARKER_FANOUT_RADIUS);
      const markerX = targetMarkX(target, offset.x);
      const markerY = targetMarkY(target, offset.y);

      // Tether from tower center to the marker offset point (design D17), with
      // the tower's dash pattern.
      drawDashedLine(targetingG, tPoint.x, tPoint.y, markerX, markerY, identity.pattern, identity.color, 0.45);

      // Dim phase-keyed pulse traveling along the tether (design D16).
      drawTetherPulse(targetingG, tPoint.x, tPoint.y, markerX, markerY, tower.id, world.tickCount, identity.color);

      // Marker glyph at the offset point.
      drawMarker(targetingG, markerX, markerY, identity.glyph, identity.color);
    }
  }

  function targetMarkX(target: { fromCell: AxialCoord; toCell: AxialCoord; progress: number }, offsetX: number): number {
    const pos = interpolatedPosition(target.fromCell, target.toCell, target.progress, (c) => axialToPixel(layout, c));
    return pos.x + offsetX;
  }
  function targetMarkY(target: { fromCell: AxialCoord; toCell: AxialCoord; progress: number }, offsetY: number): number {
    const pos = interpolatedPosition(target.fromCell, target.toCell, target.progress, (c) => axialToPixel(layout, c));
    return pos.y + offsetY;
  }
}

/**
 * Maps each enemy id to the number of towers currently targeting it, so the
 * enemy-marker fan-out knows how many links share one enemy (design D15).
 */
function computeTargetCounts(world: World): Map<number, number> {
  const counts = new Map<number, number>();
  for (const tower of world.towers) {
    if (tower.targetId === null) {
      continue;
    }
    counts.set(tower.targetId, (counts.get(tower.targetId) ?? 0) + 1);
  }
  return counts;
}

/** Eases `current` toward `target`, wrapping the shortest angular path. */
function easeAngleToward(current: number, target: number, rate: number): number {
  let diff = target - current;
  // Normalize to [-π, π] so the turn takes the shortest route (no full spins).
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(diff) <= rate) {
    return target;
  }
  return current + Math.sign(diff) * rate;
}

/** Draws a tower shape by type, rotated (on Pixi's clockwise-positive axes). */
function drawTowerShape(
  g: Graphics,
  cx: number,
  cy: number,
  circumradius: number,
  shape: TowerShape,
  rotation: number,
): void {
  switch (shape) {
    case 'triangle':
      drawTriangle(g, cx, cy, circumradius, rotation);
      break;
    default:
      drawTriangle(g, cx, cy, circumradius, rotation);
      break;
  }
}

/** Rotated triangle (apex at top for rotation 0) around (cx, cy). */
function drawTriangle(
  g: Graphics,
  cx: number,
  cy: number,
  circumradius: number,
  rotation: number,
  fill?: { color: number; alpha: number },
): void {
  const points: number[] = [];
  for (const a of [-Math.PI / 2 + rotation, -Math.PI / 2 + rotation + (2 * Math.PI) / 3, -Math.PI / 2 + rotation - (2 * Math.PI) / 3]) {
    points.push(cx + circumradius * Math.cos(a), cy + circumradius * Math.sin(a));
  }
  g.poly(points).fill(fill ?? { color: COLOR_TOWER, alpha: 1 }).stroke({ width: 2, color: COLOR_TOWER_STROKE });
}

/**
 * Draws a line with the tower's dash pattern. `pattern === null` is a solid
 * line. The array is a repeating [dash, gap, ...] in pixels.
 */
function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pattern: TetherPattern,
  color: number,
  alpha: number,
): void {
  if (pattern === 'solid') {
    g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.5, color, alpha });
    return;
  }
  const dashes = DASH_PATTERNS[pattern]!;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return;
  }
  const ux = dx / length;
  const uy = dy / length;
  let pos = 0;
  let i = 0;
  while (pos < length) {
    const dashLen = dashes[i % dashes.length]!;
    const isDash = i % 2 === 0;
    if (isDash) {
      const end = Math.min(pos + dashLen, length);
      g.moveTo(x1 + ux * pos, y1 + uy * pos).lineTo(x1 + ux * end, y1 + uy * end).stroke({ width: 1.5, color, alpha });
    }
    pos += dashLen;
    i++;
  }
}

/** Draws the dim traveling pulse along a tether (design D16). */
function drawTetherPulse(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  towerId: number,
  timeTicks: number,
  color: number,
): void {
  const progress = tetherPulse(towerId, timeTicks);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return;
  }
  const ux = dx / length;
  const uy = dy / length;
  const p0 = progress * length;
  const seg = 6;
  g.moveTo(x1 + ux * p0, y1 + uy * p0)
    .lineTo(x1 + ux * Math.min(p0 + seg, length), y1 + uy * Math.min(p0 + seg, length))
    .stroke({ width: 3, color, alpha: 0.85 });
}

/** Draws an enemy marker glyph at (x, y) scaled to fit the fan-out. */
function drawMarker(g: Graphics, x: number, y: number, glyph: MarkerGlyph, color: number): void {
  const r = 4;
  switch (glyph) {
    case 'ring':
      g.circle(x, y, r).stroke({ width: 1.5, color, alpha: 0.95 });
      break;
    case 'dot':
      g.circle(x, y, Math.max(1.5, r * 0.5)).fill({ color, alpha: 0.95 });
      break;
    case 'diamond':
      g.poly([x, y - r, x + r, y, x, y + r, x - r, y]).stroke({ width: 1.5, color, alpha: 0.95 });
      break;
    case 'square':
      g.rect(x - r, y - r, r * 2, r * 2).stroke({ width: 1.5, color, alpha: 0.95 });
      break;
    case 'triangle':
      g.poly([x, y - r, x + r, y + r, x - r, y + r]).stroke({ width: 1.5, color, alpha: 0.95 });
      break;
  }
}

function drawPreview(g: Graphics, layout: BoardLayout, ui: SceneUiState): void {
  g.clear();
  const preview = ui.preview;
  const activeFocus = ui.hover ?? ui.selected;
  if (!preview || !sameAs(activeFocus, preview.cell)) {
    return;
  }

  if (preview.valid) {
    for (const key of preview.coverage) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      g.poly(hexPolygon(layout, { q, r }, 0.94)).fill({ color: COLOR_PREVIEW_VALID, alpha: 0.16 });
    }
    const { x, y } = axialToPixel(layout, preview.cell);
    drawTriangle(g, x, y, layout.tileSize * 0.62, 0, { color: 0xffffff, alpha: 0.45 });
    g
      .poly(hexPolygon(layout, preview.cell, 0.94))
      .stroke({ width: 2, color: COLOR_PREVIEW_VALID, alpha: 0.95 });
  } else {
    g
      .poly(hexPolygon(layout, preview.cell, 0.94))
      .fill({ color: COLOR_PREVIEW_INVALID, alpha: 0.22 })
      .stroke({ width: 2, color: COLOR_PREVIEW_INVALID, alpha: 0.9 });
  }
}

function drawOutlines(g: Graphics, layout: BoardLayout, ui: SceneUiState): void {
  g.clear();
  const activeFocus = ui.hover ?? ui.selected;
  if (activeFocus) {
    const color = ui.hover ? COLOR_HOVER : COLOR_SELECTED;
    const alpha = ui.hover ? 0.65 : 0.95;
    const width = ui.hover ? 2 : 2.5;
    g.poly(hexPolygon(layout, activeFocus, 0.94)).stroke({ width, color, alpha });
  }
}

function hpColor(fraction: number): number {
  if (fraction > 0.5) return COLOR_HP_FULL;
  if (fraction > 0.25) return COLOR_HP_MID;
  return COLOR_HP_LOW;
}

function sameAs(a: AxialCoord | null, b: AxialCoord | null): boolean {
  return a !== null && b !== null && a.q === b.q && a.r === b.r;
}

/**
 * Type→visual mapping derived live from the registry so hot-applied balance
 * data restyles immediately. Higher-hp types render larger; colors cycle a
 * fixed palette by data order.
 */
function resolveEnemyVisuals(): ReadonlyMap<string, { color: number; radius: number }> {
  const types = [...getBalance().enemies.values()];
  const ranked = [...types].sort((a, b) => b.hp - a.hp || (a.id < b.id ? -1 : 1));
  const map = new Map<string, { color: number; radius: number }>();
  types.forEach((type, index) => {
    const rank = ranked.findIndex((t) => t.id === type.id);
    map.set(type.id, {
      color: ENEMY_PALETTE[index % ENEMY_PALETTE.length]!,
      radius: 12 - Math.min(rank, 2) * 3,
    });
  });
  return map;
}
