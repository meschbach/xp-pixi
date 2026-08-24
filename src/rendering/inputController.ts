import type { AxialCoord } from '../simulation/hex';
import { isInBounds } from '../simulation/map';
import { checkPlacement, getDefaultTowerTypeId } from '../simulation/placement';
import { getBalance } from '../simulation/registry';
import { computeCoverage } from '../simulation/towers';
import type { World } from '../simulation/world';
import type { Application, FederatedPointerEvent } from 'pixi.js';
import type { BoardLayout } from './hexLayout';
import { pixelToAxial } from './hexLayout';
import type { PlacementPreview, SceneUiState } from './sceneView';

/**
 * Click picking and placement UX: pointer events resolve to cells via
 * pixel→axial conversion + cube rounding; clicks dispatch placement intents
 * into the simulation; rejected placements surface visible feedback without
 * charging the player.
 */

export const FLOAT_COLOR_REJECT = 0xff8787;

export interface InputController {
  ui: SceneUiState;
  /** Refreshes the hover preview against the current world (call per frame). */
  refresh(world: World): void;
  reset(): void;
}

export interface InputCallbacks {
  onCellClicked(cell: AxialCoord): void;
}

interface CachedPreview {
  key: string;
  preview: PlacementPreview | null;
}

export function attachInput(
  app: Application,
  layout: BoardLayout,
  getWorld: () => World,
  callbacks: InputCallbacks,
): InputController {
  const ui: SceneUiState = { hover: null, selected: null, preview: null };
  let cache: CachedPreview | null = null;

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  app.stage.on('pointermove', (event: FederatedPointerEvent) => {
    ui.hover = pickCell(event.global.x, event.global.y);
  });
  app.stage.on('pointerdown', (event: FederatedPointerEvent) => {
    const cell = pickCell(event.global.x, event.global.y);
    if (!cell) {
      return;
    }
    ui.selected = cell;
    callbacks.onCellClicked(cell);
  });
  // Leaving the canvas drops stale hover/preview visuals.
  app.canvas.addEventListener('pointerleave', () => {
    ui.hover = null;
  });

  function pickCell(px: number, py: number): AxialCoord | null {
    const cell = pixelToAxial(layout, px, py);
    return isInBounds(getWorld().map, cell) ? cell : null;
  }

  return {
    ui,
    refresh(world: World) {
      const hover = ui.hover;
      if (!hover || world.state !== 'running') {
        ui.preview = null;
        cache = null;
        return;
      }

      const def = getBalance().towers.get(getDefaultTowerTypeId());
      if (!def) {
        ui.preview = null;
        return;
      }
      const affordable = world.money >= def.cost;
      const key = `${cellKeyOf(hover)}|${world.towers.length}|${affordable}`;
      if (cache && cache.key === key) {
        ui.preview = cache.preview;
        return;
      }

      const check = checkPlacement(world, hover, def.cost);
      const preview: PlacementPreview = check.ok
        ? { cell: hover, valid: true, coverage: computeCoverage(world.map, hover, def.rangeHops) }
        : { cell: hover, valid: false, coverage: new Set<string>() };
      cache = { key, preview };
      ui.preview = preview;
    },
    reset() {
      ui.hover = null;
      ui.selected = null;
      ui.preview = null;
      cache = null;
    },
  };
}

function cellKeyOf(c: AxialCoord): string {
  return `${c.q},${c.r}`;
}
