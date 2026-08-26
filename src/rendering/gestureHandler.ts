import type { AxialCoord } from '../simulation/hex';
import type { Camera } from './camera';
import { clampPan, zoomAroundPoint, clampScale, fitCamera } from './camera';
import type { CoordinateConverter } from './coordinateConverter';
import type { GestureEvent } from './gestureFsm';
import type { SceneUiState } from './sceneView';

export interface InputCallbacks {
  onCellClicked(cell: AxialCoord): void;
  onCellSelected(cell: AxialCoord | null): void;
}

export interface BoardDimensions {
  width: number;
  height: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface GestureHandler {
  handleGesture(event: GestureEvent): void;
}

export interface GestureHandlerDeps {
  coordinateConverter: CoordinateConverter;
  callbacks: InputCallbacks;
  setCamera: (camera: Camera) => void;
  getCamera: () => Camera;
  boardDims: BoardDimensions;
  getViewportSize: () => ViewportDimensions;
  ui: SceneUiState;
  logger?: (...args: unknown[]) => void;
}

/**
 * Creates a gesture handler that translates raw gesture events (tap, pan, pinch,
 * long-press) into high-level callbacks (onCellSelected, onCellClicked) and
 * camera mutations.
 *
 * NONGOALS:
 * - Does NOT manage selection state (ui.selected). That is the responsibility
 *   of the selection handler invoked via the callbacks. Setting ui.selected here
 *   before invoking the callback causes false double-tap detection, since the
 *   selection handler compares ui.selected against the incoming cell to detect
 *   re-taps.
 * - Does NOT place towers or show/hide the build sheet. Those are handled by
 *   the selection handler and confirmation flow.
 * - Does NOT track hover state (ui.hover). That is managed by the input
 *   controller for mouse movement.
 */
export function createGestureHandler(deps: GestureHandlerDeps): GestureHandler {
  const {
    coordinateConverter,
    callbacks,
    setCamera,
    getCamera,
    boardDims,
    getViewportSize,
    ui,
    logger,
  } = deps;

  function log(...args: unknown[]): void {
    logger?.(...args);
  }

  return {
    handleGesture(event: GestureEvent): void {
      const camera = getCamera();
      const viewport = getViewportSize();

      log('[gestureHandler]', { type: event.type, event, camera, viewport });

      switch (event.type) {
        case 'TAP': {
          if (event.pointerType === 'touch' || event.pointerType === 'pen') {
            const cell = coordinateConverter.screenToCell(event.x, event.y);
            log('[gestureHandler] TAP', { screenX: event.x, screenY: event.y, cell, uiSelected: ui.selected });
            if (cell) {
              callbacks.onCellSelected(cell);
            } else {
              ui.selected = null;
              callbacks.onCellSelected(null);
            }
          }
          break;
        }
        case 'LONG_PRESS': {
          callbacks.onCellSelected(null);
          break;
        }
        case 'PAN_START':
          break;
        case 'PAN_MOVE': {
          const newCamera = clampPan(
            { x: camera.x + event.dx, y: camera.y + event.dy, scale: camera.scale },
            boardDims,
            viewport,
          );
          setCamera(newCamera);
          break;
        }
        case 'PAN_END':
          break;
        case 'PINCH_START':
          break;
        case 'PINCH_MOVE': {
          let updated = zoomAroundPoint(camera, event.distanceRatio, event.midX, event.midY);
          const fit = fitCamera(boardDims, viewport);
          updated = { ...updated, scale: clampScale(updated.scale, fit.scale) };
          updated = clampPan(
            { x: updated.x + event.dmidX, y: updated.y + event.dmidY, scale: updated.scale },
            boardDims,
            viewport,
          );
          setCamera(updated);
          break;
        }
        case 'PINCH_END':
          break;
      }
    },
  };
}
