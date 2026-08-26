import { describe, expect, it } from 'vitest';
import {
  clampPan,
  clampScale,
  FIT_MAX_SCALE,
  fitCamera,
  screenToWorld,
  worldToScreen,
  zoomAroundPoint,
  ZOOM_MAX_FACTOR,
} from './camera';

const board = { width: 800, height: 600 };

describe('fitCamera', () => {
  it('fits a small viewport to the board by width', () => {
    const cam = fitCamera(board, { width: 400, height: 600 });
    expect(cam.scale).toBeCloseTo(0.5);
    expect(cam.x).toBeCloseTo(0);
    expect(cam.y).toBeCloseTo(150);
  });

  it('fits a small viewport to the board by height', () => {
    const cam = fitCamera(board, { width: 1000, height: 300 });
    expect(cam.scale).toBeCloseTo(0.5);
    expect(cam.x).toBeCloseTo(300);
    expect(cam.y).toBeCloseTo(0);
  });

  it('caps scale at FIT_MAX_SCALE on large viewports', () => {
    const cam = fitCamera(board, { width: 2000, height: 2000 });
    expect(cam.scale).toBe(FIT_MAX_SCALE);
  });

  it('centers the board when capped', () => {
    const cam = fitCamera(board, { width: 2000, height: 2000 });
    const scaledW = board.width * FIT_MAX_SCALE;
    const scaledH = board.height * FIT_MAX_SCALE;
    expect(cam.x).toBeCloseTo((2000 - scaledW) / 2);
    expect(cam.y).toBeCloseTo((2000 - scaledH) / 2);
  });
});

describe('screenToWorld / worldToScreen round-trip', () => {
  const states = [
    { x: 0, y: 0, scale: 1 },
    { x: 100, y: 50, scale: 2 },
    { x: -30, y: -20, scale: 0.5 },
    { x: 200, y: 150, scale: 3.5 },
  ];

  for (const cam of states) {
    it(`round-trips at scale=${cam.scale} offset=(${cam.x},${cam.y})`, () => {
      const world = { x: 123, y: 456 };
      const screen = worldToScreen(cam, world.x, world.y);
      const back = screenToWorld(cam, screen.x, screen.y);
      expect(back.x).toBeCloseTo(world.x, 6);
      expect(back.y).toBeCloseTo(world.y, 6);
    });
  }
});

describe('zoomAroundPoint', () => {
  it('keeps the anchor point fixed on screen', () => {
    const cam = { x: 100, y: 50, scale: 1 };
    const anchorX = 300;
    const anchorY = 200;
    const worldBefore = screenToWorld(cam, anchorX, anchorY);
    const zoomed = zoomAroundPoint(cam, 2, anchorX, anchorY);
    const worldAfter = screenToWorld(zoomed, anchorX, anchorY);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });

  it('multiplies scale by the factor', () => {
    const cam = { x: 0, y: 0, scale: 1 };
    const zoomed = zoomAroundPoint(cam, 1.5, 100, 100);
    expect(zoomed.scale).toBeCloseTo(1.5);
  });

  it('keeps anchor fixed at various zoom levels', () => {
    const cam = fitCamera(board, { width: 500, height: 500 });
    const anchorX = 250;
    const anchorY = 250;
    const worldBefore = screenToWorld(cam, anchorX, anchorY);
    const zoomed = zoomAroundPoint(cam, 2.5, anchorX, anchorY);
    const worldAfter = screenToWorld(zoomed, anchorX, anchorY);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6);
  });
});

describe('clampPan', () => {
  it('pins center when board fits entirely in viewport', () => {
    const cam = { x: 999, y: 999, scale: 0.5 };
    const clamped = clampPan(cam, board, { width: 1000, height: 1000 });
    const scaledW = board.width * 0.5;
    const scaledH = board.height * 0.5;
    expect(clamped.x).toBeCloseTo((1000 - scaledW) / 2);
    expect(clamped.y).toBeCloseTo((1000 - scaledH) / 2);
  });

  it('keeps board edges inside viewport when zoomed in', () => {
    const cam = { x: -500, y: -500, scale: 2 };
    const clamped = clampPan(cam, board, { width: 800, height: 600 });
    const scaledW = board.width * 2;
    const scaledH = board.height * 2;
    expect(clamped.x).toBe(Math.max(800 - scaledW, Math.min(0, -500)));
    expect(clamped.y).toBe(Math.max(600 - scaledH, Math.min(0, -500)));
  });

  it('allows panning within bounds', () => {
    const cam = { x: -100, y: -100, scale: 2 };
    const clamped = clampPan(cam, board, { width: 800, height: 600 });
    expect(clamped.x).toBe(-100);
    expect(clamped.y).toBe(-100);
  });

  it('clamps to the right edge', () => {
    const cam = { x: 1000, y: 0, scale: 2 };
    const clamped = clampPan(cam, board, { width: 800, height: 600 });
    expect(clamped.x).toBe(0);
  });

  it('clamps to the left edge', () => {
    const cam = { x: -2000, y: 0, scale: 2 };
    const clamped = clampPan(cam, board, { width: 800, height: 600 });
    expect(clamped.x).toBe(800 - board.width * 2);
  });
});

describe('clampScale', () => {
  it('clamps below fitScale', () => {
    expect(clampScale(0.1, 0.5)).toBe(0.5);
  });

  it('clamps above fitScale * ZOOM_MAX_FACTOR', () => {
    expect(clampScale(100, 0.5)).toBe(0.5 * ZOOM_MAX_FACTOR);
  });

  it('passes through valid scale', () => {
    expect(clampScale(1.0, 0.5)).toBe(1.0);
  });
});
