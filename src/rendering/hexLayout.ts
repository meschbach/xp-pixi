import type { AxialCoord } from '../simulation/hex';
import { cubeRound } from '../simulation/hex';

/**
 * Pixel-space hex layout (design D3): pointy-top tiles, offset rows via
 * axial rhombus coordinates. All axial→pixel conversion lives in rendering.
 */

export const TILE_SIZE = 34;
export const BOARD_PADDING = 16;

const SQRT3 = Math.sqrt(3);

export interface BoardLayout {
  tileSize: number;
  /** Canvas-space position of the (0, 0) cell center. */
  originX: number;
  originY: number;
  widthPx: number;
  heightPx: number;
}

/** Sizes the canvas once at load to exactly fit a `width × height` rhombus. */
export function computeBoardLayout(
  width: number,
  height: number,
  tileSize: number = TILE_SIZE,
  padding: number = BOARD_PADDING,
): BoardLayout {
  const maxX = SQRT3 * tileSize * (width - 1 + (height - 1) / 2);
  const maxY = 1.5 * tileSize * (height - 1);
  return {
    tileSize,
    originX: padding + (SQRT3 / 2) * tileSize,
    originY: padding + tileSize,
    widthPx: Math.ceil(maxX + SQRT3 * tileSize + 2 * padding),
    heightPx: Math.ceil(maxY + 2 * tileSize + 2 * padding),
  };
}

export function axialToPixel(layout: BoardLayout, c: AxialCoord): { x: number; y: number } {
  return {
    x: layout.originX + SQRT3 * layout.tileSize * (c.q + c.r / 2),
    y: layout.originY + 1.5 * layout.tileSize * c.r,
  };
}

/** Inverse of `axialToPixel`, resolved to the containing cell by cube rounding. */
export function pixelToAxial(layout: BoardLayout, px: number, py: number): AxialCoord {
  const x = px - layout.originX;
  const y = py - layout.originY;
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / layout.tileSize;
  const rf = ((2 / 3) * y) / layout.tileSize;
  return cubeRound(qf, rf);
}

/** Pointy-top hexagon vertex list centered at (cx, cy), circumradius `size`. */
export function hexPolygonAt(cx: number, cy: number, size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 90) * Math.PI) / 180;
    points.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
  }
  return points;
}

export function hexPolygon(layout: BoardLayout, c: AxialCoord, sizeScale = 1): number[] {
  const { x, y } = axialToPixel(layout, c);
  return hexPolygonAt(x, y, layout.tileSize * sizeScale);
}
