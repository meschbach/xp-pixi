import { describe, it, expect } from 'vitest';
import { createCoordinateConverter } from './coordinateConverter';
import type { Camera } from './camera';
import type { BoardLayout } from './hexLayout';
import { axialToPixel } from './hexLayout';
import type { World } from '../simulation/world';
import type { GameMap } from '../simulation/map';

function createTestLayout(): BoardLayout {
  return {
    tileSize: 34,
    originX: 50,
    originY: 50,
    widthPx: 800,
    heightPx: 600,
  };
}

function createTestCamera(overrides: Partial<Camera> = {}): Camera {
  return {
    x: 0,
    y: 0,
    scale: 1,
    ...overrides,
  };
}

function createTestMap(width = 10, height = 10): GameMap {
  const cells = new Map<string, { q: number; r: number; buildable: boolean; blocked: boolean }>();
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      cells.set(`${q},${r}`, {
        q,
        r,
        buildable: true,
        blocked: false,
      });
    }
  }
  return {
    width,
    height,
    cells,
    spawn: { q: 0, r: 0 },
    goal: { q: width - 1, r: height - 1 },
  };
}

function createTestWorld(map?: GameMap): World {
  const testMap = map ?? createTestMap();
  return {
    map: testMap,
    distanceField: new Map<string, number>(),
    money: 100,
    lives: 10,
    state: 'running',
    enemies: [],
    tickCount: 0,
    nextEntityId: 1,
    combatEvents: [],
    wavePhase: 'awaiting-start',
    currentWaveIndex: -1,
    pendingSpawns: [],
    ticksToNextWave: 0,
    towers: [],
    tick: () => {},
    requestStartWave: () => true,
    spawnEnemy: () => {},
    creditMoney: () => {},
    trySpend: () => true,
    emitShot: () => {},
    ackEvents: () => {},
  } as World;
}

describe('coordinateConverter', () => {
  describe('screenToCell', () => {
    it('converts screen coords at cell center to correct cell', () => {
      const layout = createTestLayout();
      const camera = createTestCamera();
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const result = converter.screenToCell(cellCenter.x, cellCenter.y);

      expect(result).toEqual({ q: 5, r: 5 });
    });

    it('converts multiple different cells correctly', () => {
      const layout = createTestLayout();
      const camera = createTestCamera();
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const testCells = [
        { q: 0, r: 0 },
        { q: 3, r: 2 },
        { q: 7, r: 4 },
        { q: 9, r: 9 },
      ];

      for (const cell of testCells) {
        const cellCenter = axialToPixel(layout, cell);
        const result = converter.screenToCell(cellCenter.x, cellCenter.y);
        expect(result).toEqual(cell);
      }
    });

    it('returns null for out-of-bounds coords', () => {
      const layout = createTestLayout();
      const camera = createTestCamera();
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const result = converter.screenToCell(-1000, -1000);
      expect(result).toBeNull();
    });

    it('returns null for coords far outside map', () => {
      const layout = createTestLayout();
      const camera = createTestCamera();
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const result = converter.screenToCell(10000, 10000);
      expect(result).toBeNull();
    });

    it('accounts for camera offset', () => {
      const layout = createTestLayout();
      const camera = createTestCamera({ x: 100, y: 50, scale: 1 });
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const screenX = cellCenter.x * camera.scale + camera.x;
      const screenY = cellCenter.y * camera.scale + camera.y;

      const result = converter.screenToCell(screenX, screenY);
      expect(result).toEqual({ q: 5, r: 5 });
    });

    it('accounts for camera zoom', () => {
      const layout = createTestLayout();
      const camera = createTestCamera({ x: 0, y: 0, scale: 2 });
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const screenX = cellCenter.x * camera.scale;
      const screenY = cellCenter.y * camera.scale;

      const result = converter.screenToCell(screenX, screenY);
      expect(result).toEqual({ q: 5, r: 5 });
    });

    it('accounts for both camera offset and zoom', () => {
      const layout = createTestLayout();
      const camera = createTestCamera({ x: 150, y: 75, scale: 1.5 });
      const world = createTestWorld();
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const screenX = cellCenter.x * camera.scale + camera.x;
      const screenY = cellCenter.y * camera.scale + camera.y;

      const result = converter.screenToCell(screenX, screenY);
      expect(result).toEqual({ q: 5, r: 5 });
    });

    it('handles small map boundaries', () => {
      const layout = createTestLayout();
      const camera = createTestCamera();
      const world = createTestWorld(createTestMap(3, 3));
      const converter = createCoordinateConverter(() => camera, layout, () => world);

      const validCell = axialToPixel(layout, { q: 1, r: 1 });
      const result = converter.screenToCell(validCell.x, validCell.y);
      expect(result).toEqual({ q: 1, r: 1 });

      const outOfBounds = converter.screenToCell(-500, -500);
      expect(outOfBounds).toBeNull();
    });
  });
});
