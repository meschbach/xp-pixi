import { Container, Graphics } from 'pixi.js';
import { cellKey } from '../simulation/hex';
import type { GameCell } from '../simulation/map';
import type { World } from '../simulation/world';
import type { BoardLayout } from './hexLayout';
import { hexPolygon } from './hexLayout';

/**
 * Static board layer: one hexagon per map cell colored by role
 * (spawn / goal / buildable / rock / tower-occupied), plus the true
 * coverage region of every placed tower as a flood-fill tint.
 */

const COLOR_BUILDABLE_FILL = 0x274036;
const COLOR_BUILDABLE_STROKE = 0x3a5c4b;
const COLOR_ROCK_FILL = 0x3d3d46;
const COLOR_ROCK_STROKE = 0x5a5a66;
const COLOR_SPAWN_FILL = 0xa63a3a;
const COLOR_SPAWN_STROKE = 0xd97b7b;
const COLOR_GOAL_FILL = 0x2f5da6;
const COLOR_GOAL_STROKE = 0x74a8f0;
const COLOR_TOWER_FILL = 0x6b5618;
const COLOR_TOWER_STROKE = 0xa8871e;
const COLOR_COVERAGE = 0x74c0fc;

/** Tiles shrink slightly so the background shows through as grout lines. */
const TILE_INSET = 0.94;

export interface BoardView {
  container: Container;
  /** Redraws tiles/coverage if the tower set changed since the last call. */
  update(world: World): void;
  /** Forces a redraw on the next update (e.g. after a world reset). */
  invalidate(): void;
}

export function createBoardView(layout: BoardLayout): BoardView {
  const container = new Container();
  const coverageG = new Graphics();
  const tilesG = new Graphics();
  container.addChild(coverageG, tilesG);

  let signature = '';

  function roleOf(world: World, key: string, cell: GameCell): 'spawn' | 'goal' | 'rock' | 'tower' | 'buildable' {
    if (key === cellKey(world.map.spawn)) return 'spawn';
    if (key === cellKey(world.map.goal)) return 'goal';
    if (cell.blocked) return cell.buildable ? 'tower' : 'rock';
    return 'buildable';
  }

  function drawTiles(world: World): void {
    const palette: Record<string, { fill: number; stroke: number }> = {
      spawn: { fill: COLOR_SPAWN_FILL, stroke: COLOR_SPAWN_STROKE },
      goal: { fill: COLOR_GOAL_FILL, stroke: COLOR_GOAL_STROKE },
      rock: { fill: COLOR_ROCK_FILL, stroke: COLOR_ROCK_STROKE },
      tower: { fill: COLOR_TOWER_FILL, stroke: COLOR_TOWER_STROKE },
      buildable: { fill: COLOR_BUILDABLE_FILL, stroke: COLOR_BUILDABLE_STROKE },
    };

    tilesG.clear();
    for (const cell of world.map.cells.values()) {
      const key = cellKey(cell);
      const colors = palette[roleOf(world, key, cell)]!;
      tilesG
        .poly(hexPolygon(layout, cell, TILE_INSET))
        .fill(colors.fill)
        .stroke({ width: 1.5, color: colors.stroke, alpha: 0.9 });
    }
  }

  function drawCoverage(world: World): void {
    coverageG.clear();
    for (const tower of world.towers) {
      for (const key of tower.coverage) {
        drawCoverageCell(coverageG, key, 0.12);
      }
    }
  }

  function drawCoverageCell(g: Graphics, key: string, alpha: number): void {
    const [q, r] = key.split(',').map(Number) as [number, number];
    g.poly(hexPolygon(layout, { q, r }, TILE_INSET)).fill({ color: COLOR_COVERAGE, alpha });
  }

  return {
    container,
    invalidate() {
      signature = '';
    },
    update(world: World) {
      const next = world.towers.map((t) => t.id).join(',');
      if (next === signature) {
        return;
      }
      signature = next;
      drawTiles(world);
      drawCoverage(world);
    },
  };
}
