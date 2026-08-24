import { Container, Graphics, Text } from 'pixi.js';
import { cellKey } from '../simulation/hex';
import type { AxialCoord } from '../simulation/hex';
import { getBalance } from '../simulation/registry';
import type { World } from '../simulation/world';
import type { BoardLayout } from './hexLayout';
import { axialToPixel, hexPolygon } from './hexLayout';

/**
 * Per-frame dynamic layer: enemies (type-distinct circles with an hp hint),
 * towers (triangles), visual-only hit flashes, selection/hover outlines, and
 * the placement preview (would-be true coverage region + validity).
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

const ENEMY_PALETTE = [0xff8787, 0xffd43b, 0x74c0fc, 0xb197fc, 0x63e6be];
const DEFAULT_ENEMY_COLOR = 0xadb5bd;
const DEFAULT_ENEMY_RADIUS = 8;
const FLASH_TTL_MS = 220;
const PULSE_TTL_MS = 450;
const FLOAT_TTL_MS = 1000;

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

interface FlashEffect {
  x: number;
  y: number;
  ageMs: number;
}

interface PulseEffect {
  key: string;
  ageMs: number;
}

interface FloatText {
  text: Text;
  ageMs: number;
}

export interface SceneView {
  container: Container;
  update(world: World, ui: SceneUiState, dtMs: number): void;
  /** Ring at a pixel position — a shot connecting with its target. */
  addFlash(x: number, y: number): void;
  addCellPulse(cell: AxialCoord): void;
  addFloatText(cell: AxialCoord, message: string, color: number): void;
  reset(): void;
}

export function createSceneView(layout: BoardLayout): SceneView {
  const container = new Container();
  const focusG = new Graphics();
  const previewG = new Graphics();
  const outlineG = new Graphics();
  const entitiesG = new Graphics();
  const fxG = new Graphics();
  container.addChild(focusG, previewG, outlineG, entitiesG, fxG);

  const flashes: FlashEffect[] = [];
  const pulses: PulseEffect[] = [];
  const floats: FloatText[] = [];
  const lastHpById = new Map<number, number>();

  return {
    container,
    addFlash(x, y) {
      flashes.push({ x, y, ageMs: 0 });
    },
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
    reset() {
      for (const f of floats) {
        f.text.destroy();
      }
      floats.length = 0;
      flashes.length = 0;
      pulses.length = 0;
      lastHpById.clear();
    },
    update(world, ui, dtMs) {
      drawCoverageFocus(focusG, world, ui);
      drawPreview(previewG, layout, ui);
      drawOutlines(outlineG, layout, ui);
      drawEntities(world);
      advanceEffects(dtMs);
    },
  };

  function drawCoverageFocus(g: Graphics, world: World, ui: SceneUiState): void {
    g.clear();
    if (!ui.hover && !ui.selected) {
      return;
    }
    const focusKeys = new Set([ui.hover, ui.selected].filter((c) => c !== null).map(cellKey));
    for (const tower of world.towers) {
      if (!focusKeys.has(cellKey(tower.cell))) {
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
      drawTriangle(entitiesG, x, y, layout.tileSize * 0.62);
    }

    const seenIds = new Set<number>();
    for (const enemy of world.enemies) {
      seenIds.add(enemy.id);

      const from = axialToPixel(layout, enemy.fromCell);
      const to = axialToPixel(layout, enemy.toCell);
      const x = from.x + (to.x - from.x) * enemy.progress;
      const y = from.y + (to.y - from.y) * enemy.progress;

      // Visual-only hit feedback: an hp drop since last frame lands a flash.
      const prevHp = lastHpById.get(enemy.id);
      if (prevHp !== undefined && enemy.hp < prevHp) {
        flashes.push({ x, y, ageMs: 0 });
      }
      lastHpById.set(enemy.id, enemy.hp);

      const visual = enemy.typeId ? visuals.get(enemy.typeId) : undefined;
      const radius = visual?.radius ?? DEFAULT_ENEMY_RADIUS;
      const color = visual?.color ?? DEFAULT_ENEMY_COLOR;
      entitiesG.circle(x, y, radius).fill(color).stroke({ width: 1.5, color: 0x101018, alpha: 0.7 });

      const fraction = Math.max(0, Math.min(1, enemy.hp / enemy.maxHp));
      const barWidth = radius * 2.2;
      const barY = y - radius - 6;
      entitiesG
        .rect(x - barWidth / 2, barY, barWidth, 3)
        .fill(COLOR_HP_BAR_BG)
        .rect(x - barWidth / 2, barY, barWidth * fraction, 3)
        .fill(hpColor(fraction));
    }

    if (lastHpById.size !== seenIds.size) {
      for (const id of [...lastHpById.keys()]) {
        if (!seenIds.has(id)) {
          lastHpById.delete(id);
        }
      }
    }
  }

  function advanceEffects(dtMs: number): void {
    fxG.clear();

    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i]!;
      flash.ageMs += dtMs;
      if (flash.ageMs >= FLASH_TTL_MS) {
        flashes.splice(i, 1);
        continue;
      }
      const t = flash.ageMs / FLASH_TTL_MS;
      fxG
        .circle(flash.x, flash.y, 5 + t * 11)
        .stroke({ width: 2, color: 0xffffff, alpha: 1 - t });
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
}

function drawPreview(g: Graphics, layout: BoardLayout, ui: SceneUiState): void {
  g.clear();
  const preview = ui.preview;
  if (!preview || !sameAs(ui.hover, preview.cell)) {
    return;
  }

  if (preview.valid) {
    for (const key of preview.coverage) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      g.poly(hexPolygon(layout, { q, r }, 0.94)).fill({ color: COLOR_PREVIEW_VALID, alpha: 0.16 });
    }
    const { x, y } = axialToPixel(layout, preview.cell);
    drawTriangle(g, x, y, layout.tileSize * 0.62, { color: 0xffffff, alpha: 0.45 });
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
  if (ui.hover) {
    g.poly(hexPolygon(layout, ui.hover, 0.94)).stroke({ width: 2, color: COLOR_HOVER, alpha: 0.65 });
  }
  if (ui.selected && !sameAs(ui.hover, ui.selected)) {
    g.poly(hexPolygon(layout, ui.selected, 0.94)).stroke({ width: 2.5, color: COLOR_SELECTED, alpha: 0.95 });
  }
}

function drawTriangle(
  g: Graphics,
  cx: number,
  cy: number,
  circumradius: number,
  fill?: { color: number; alpha: number },
): void {
  const points = [
    cx,
    cy - circumradius,
    cx - (circumradius * Math.sqrt(3)) / 2,
    cy + circumradius / 2,
    cx + (circumradius * Math.sqrt(3)) / 2,
    cy + circumradius / 2,
  ];
  g.poly(points).fill(fill ?? { color: COLOR_TOWER, alpha: 1 }).stroke({ width: 2, color: COLOR_TOWER_STROKE });
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
