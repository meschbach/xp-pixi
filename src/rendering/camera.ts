export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface BoardDimensions {
  width: number;
  height: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export const FIT_MAX_SCALE = 1.5;
export const ZOOM_MAX_FACTOR = 2.5;

export function fitCamera(
  board: BoardDimensions,
  viewport: ViewportDimensions,
): Camera {
  const fitScale = Math.min(
    viewport.width / board.width,
    viewport.height / board.height,
  );
  const scale = Math.min(fitScale, FIT_MAX_SCALE);
  const x = (viewport.width - board.width * scale) / 2;
  const y = (viewport.height - board.height * scale) / 2;
  return { x, y, scale };
}

export function zoomAroundPoint(
  camera: Camera,
  factor: number,
  anchorX: number,
  anchorY: number,
): Camera {
  const newScale = camera.scale * factor;
  const worldX = (anchorX - camera.x) / camera.scale;
  const worldY = (anchorY - camera.y) / camera.scale;
  return {
    x: anchorX - worldX * newScale,
    y: anchorY - worldY * newScale,
    scale: newScale,
  };
}

export function clampPan(
  camera: Camera,
  board: BoardDimensions,
  viewport: ViewportDimensions,
): Camera {
  const scaledW = board.width * camera.scale;
  const scaledH = board.height * camera.scale;

  let { x, y } = camera;

  if (scaledW <= viewport.width) {
    x = (viewport.width - scaledW) / 2;
  } else {
    x = Math.min(0, Math.max(viewport.width - scaledW, x));
  }

  if (scaledH <= viewport.height) {
    y = (viewport.height - scaledH) / 2;
  } else {
    y = Math.min(0, Math.max(viewport.height - scaledH, y));
  }

  return { x, y, scale: camera.scale };
}

export function screenToWorld(
  camera: Camera,
  px: number,
  py: number,
): { x: number; y: number } {
  return {
    x: (px - camera.x) / camera.scale,
    y: (py - camera.y) / camera.scale,
  };
}

export function worldToScreen(
  camera: Camera,
  wx: number,
  wy: number,
): { x: number; y: number } {
  return {
    x: wx * camera.scale + camera.x,
    y: wy * camera.scale + camera.y,
  };
}

export function clampScale(
  scale: number,
  fitScale: number,
): number {
  return Math.max(fitScale, Math.min(fitScale * ZOOM_MAX_FACTOR, scale));
}
