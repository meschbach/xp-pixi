import { describe, it, expect, vi } from 'vitest';
import { createGestureHandler } from './gestureHandler';
import type { GestureHandlerDeps } from './gestureHandler';
import type { CoordinateConverter } from './coordinateConverter';
import type { Camera } from './camera';
import type { SceneUiState } from './sceneView';
import type { GestureEvent } from './gestureFsm';

function createMockDeps(overrides: Partial<GestureHandlerDeps> = {}): GestureHandlerDeps {
  const mockCoordinateConverter: CoordinateConverter = {
    screenToCell: vi.fn(),
  };

  const mockCallbacks = {
    onCellClicked: vi.fn(),
    onCellSelected: vi.fn(),
  };

  const mockCamera: Camera = {
    x: 0,
    y: 0,
    scale: 1,
  };

  const mockUi: SceneUiState = {
    selected: null,
    hover: null,
    preview: null,
  };

  return {
    coordinateConverter: mockCoordinateConverter,
    callbacks: mockCallbacks,
    setCamera: vi.fn(),
    getCamera: vi.fn(() => mockCamera),
    boardDims: { width: 800, height: 600 },
    getViewportSize: vi.fn(() => ({ width: 800, height: 600 })),
    ui: mockUi,
    ...overrides,
  };
}

describe('gestureHandler', () => {
  describe('TAP events', () => {
    it('calls onCellSelected for touch TAP on valid cell', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 5, r: 5 }));
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: 100,
        y: 100,
        pointerType: 'touch',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith({ q: 5, r: 5 });
      expect(deps.ui.selected).toBeNull();
    });

    it('does not call onCellSelected for mouse TAP', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 5, r: 5 }));
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: 100,
        y: 100,
        pointerType: 'mouse',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).not.toHaveBeenCalled();
      expect(deps.ui.selected).toBeNull();
    });

    it('calls onCellSelected(null) for out-of-bounds TAP', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => null);
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: -1000,
        y: -1000,
        pointerType: 'touch',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith(null);
      expect(deps.ui.selected).toBeNull();
    });

  });

  describe('LONG_PRESS events', () => {
    it('calls onCellSelected(null) to dismiss selection', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const longPressEvent: GestureEvent = {
        type: 'LONG_PRESS',
        x: 100,
        y: 100,
        pointerType: 'touch',
      };

      handler.handleGesture(longPressEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith(null);
    });
  });

  describe('PAN events', () => {
    it('updates camera position on PAN_MOVE', () => {
      const initialCamera: Camera = { x: -100, y: -100, scale: 1 };
      const deps = createMockDeps({
        boardDims: { width: 1600, height: 1200 },
        getViewportSize: () => ({ width: 800, height: 600 }),
        getCamera: () => initialCamera,
      });
      const handler = createGestureHandler(deps);

      const panMoveEvent: GestureEvent = {
        type: 'PAN_MOVE',
        dx: 50,
        dy: 30,
      };

      handler.handleGesture(panMoveEvent);

      expect(deps.setCamera).toHaveBeenCalled();
      const mockSetCamera = deps.setCamera as unknown as { mock: { calls: Camera[][] } };
      const newCamera = mockSetCamera.mock.calls[0][0];
      expect(newCamera.x).toBe(-50);
      expect(newCamera.y).toBe(-70);
    });

    it('does nothing on PAN_START', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const panStartEvent: GestureEvent = {
        type: 'PAN_START',
        x: 100,
        y: 100,
      };

      handler.handleGesture(panStartEvent);

      expect(deps.setCamera).not.toHaveBeenCalled();
    });

    it('does nothing on PAN_END', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const panEndEvent: GestureEvent = {
        type: 'PAN_END',
      };

      handler.handleGesture(panEndEvent);

      expect(deps.setCamera).not.toHaveBeenCalled();
    });
  });

  describe('PINCH events', () => {
    it('updates camera zoom on PINCH_MOVE', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const pinchMoveEvent: GestureEvent = {
        type: 'PINCH_MOVE',
        midX: 400,
        midY: 300,
        distance: 200,
        dmidX: 0,
        dmidY: 0,
        distanceRatio: 1.5,
      };

      handler.handleGesture(pinchMoveEvent);

      expect(deps.setCamera).toHaveBeenCalled();
      const mockSetCamera = deps.setCamera as unknown as { mock: { calls: Camera[][] } };
      const newCamera = mockSetCamera.mock.calls[0][0];
      expect(newCamera.scale).toBeGreaterThan(1);
    });

    it('does nothing on PINCH_START', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const pinchStartEvent: GestureEvent = {
        type: 'PINCH_START',
        midX: 400,
        midY: 300,
        distance: 100,
      };

      handler.handleGesture(pinchStartEvent);

      expect(deps.setCamera).not.toHaveBeenCalled();
    });

    it('does nothing on PINCH_END', () => {
      const deps = createMockDeps();
      const handler = createGestureHandler(deps);

      const pinchEndEvent: GestureEvent = {
        type: 'PINCH_END',
      };

      handler.handleGesture(pinchEndEvent);

      expect(deps.setCamera).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles multiple TAP events in sequence', () => {
      const deps = createMockDeps();
      let callCount = 0;
      deps.coordinateConverter.screenToCell = vi.fn(() => {
        callCount++;
        return { q: callCount, r: callCount };
      });
      const handler = createGestureHandler(deps);

      handler.handleGesture({ type: 'TAP', x: 100, y: 100, pointerType: 'touch' });
      handler.handleGesture({ type: 'TAP', x: 200, y: 200, pointerType: 'touch' });
      handler.handleGesture({ type: 'TAP', x: 300, y: 300, pointerType: 'touch' });

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledTimes(3);
      expect(deps.callbacks.onCellSelected).toHaveBeenNthCalledWith(1, { q: 1, r: 1 });
      expect(deps.callbacks.onCellSelected).toHaveBeenNthCalledWith(2, { q: 2, r: 2 });
      expect(deps.callbacks.onCellSelected).toHaveBeenNthCalledWith(3, { q: 3, r: 3 });
    });

    it('handles pen pointer type like touch', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 5, r: 5 }));
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: 100,
        y: 100,
        pointerType: 'pen',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith({ q: 5, r: 5 });
      expect(deps.ui.selected).toBeNull();
    });

    it('pen TAP on valid cell calls onCellSelected', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 5, r: 5 }));
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: 100,
        y: 100,
        pointerType: 'pen',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith({ q: 5, r: 5 });
      expect(deps.ui.selected).toBeNull();
    });

    it('pen TAP on out-of-bounds calls onCellSelected(null)', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => null);
      const handler = createGestureHandler(deps);

      const tapEvent: GestureEvent = {
        type: 'TAP',
        x: -1000,
        y: -1000,
        pointerType: 'pen',
      };

      handler.handleGesture(tapEvent);

      expect(deps.callbacks.onCellSelected).toHaveBeenCalledWith(null);
      expect(deps.ui.selected).toBeNull();
    });

    it('touch TAP does not set ui.selected', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 3, r: 7 }));
      const handler = createGestureHandler(deps);

      handler.handleGesture({ type: 'TAP', x: 100, y: 100, pointerType: 'touch' });

      expect(deps.ui.selected).toBeNull();
    });

    it('pen TAP does not set ui.selected', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 3, r: 7 }));
      const handler = createGestureHandler(deps);

      handler.handleGesture({ type: 'TAP', x: 100, y: 100, pointerType: 'pen' });

      expect(deps.ui.selected).toBeNull();
    });

    it('mouse TAP does not set ui.selected', () => {
      const deps = createMockDeps();
      deps.coordinateConverter.screenToCell = vi.fn(() => ({ q: 3, r: 7 }));
      const handler = createGestureHandler(deps);

      handler.handleGesture({ type: 'TAP', x: 100, y: 100, pointerType: 'mouse' });

      expect(deps.ui.selected).toBeNull();
    });
  });
});
