import type { AxialCoord } from '../simulation/hex';
import { isInBounds } from '../simulation/map';
import type { World } from '../simulation/world';
import type { Camera } from './camera';
import { screenToWorld } from './camera';
import type { BoardLayout } from './hexLayout';
import { pixelToAxial } from './hexLayout';

export interface CoordinateConverter {
  screenToCell(screenX: number, screenY: number): AxialCoord | null;
}

export function createCoordinateConverter(
  getCamera: () => Camera,
  layout: BoardLayout,
  getWorld: () => World,
): CoordinateConverter {
  return {
    screenToCell(screenX: number, screenY: number): AxialCoord | null {
      const world = screenToWorld(getCamera(), screenX, screenY);
      const cell = pixelToAxial(layout, world.x, world.y);
      return isInBounds(getWorld().map, cell) ? cell : null;
    },
  };
}
