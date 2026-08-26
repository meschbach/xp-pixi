import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCoordinateConverter } from './coordinateConverter';
import { createGestureHandler } from './gestureHandler';
import { createSelectionHandlers } from './selectionHandlers';
import { GestureFsm } from './gestureFsm';
import type { Camera } from './camera';
import type { BoardLayout } from './hexLayout';
import { axialToPixel } from './hexLayout';
import type { World } from '../simulation/world';
import type { GameMap } from '../simulation/map';
import type { BuildSheet } from './buildSheet';
import type { GestureEvent, PointerRecord } from './gestureFsm';
import type { SceneUiState } from './sceneView';

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
    nextEnemyId: 1,
    wavePhase: 'awaiting-start',
    currentWaveIndex: -1,
    pendingSpawns: [],
    ticksToNextWave: 0,
    towers: [],
    nextTowerId: 1,
    tick: () => {},
    requestStartWave: () => true,
    spawnEnemy: () => {},
    creditMoney: () => {},
    trySpend: () => true,
  } as World;
}

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

function createMockBuildSheet(): BuildSheet {
  return {
    showBuild: vi.fn(),
    showRejection: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(() => false),
  };
}

describe('Touch Integration', () => {
  let layout: BoardLayout;
  let camera: Camera;
  let world: World;
  let buildSheet: BuildSheet;
  let selectedCell: { q: number; r: number } | null;
  let ui: SceneUiState;

  beforeEach(() => {
    layout = createTestLayout();
    camera = createTestCamera();
    world = createTestWorld();
    buildSheet = createMockBuildSheet();
    selectedCell = null;
    ui = { selected: null, preview: null, hover: null };
  });

  it('full touch flow: TAP → selection → build sheet', () => {
    // Setup coordinate converter
    const coordinateConverter = createCoordinateConverter(
      () => camera,
      layout,
      () => world,
    );

    // Setup selection handlers
    const selectionHandlers = createSelectionHandlers({
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => world,
      buildSheet,
      sceneView: {
        addCellPulse: vi.fn(),
        addFloatText: vi.fn(),
      },
      input: { ui },
    });

    // Setup gesture handler
    const gestureHandler = createGestureHandler({
      coordinateConverter,
      callbacks: {
        onCellClicked: vi.fn(),
        onCellSelected: selectionHandlers.onCellSelected,
      },
      setCamera: vi.fn(),
      getCamera: () => camera,
      boardDims: { width: layout.widthPx, height: layout.heightPx },
      getViewportSize: () => ({ width: 800, height: 600 }),
      ui,
    });

    // Simulate touch on cell (5, 5)
    const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
    const tapEvent: GestureEvent = {
      type: 'TAP',
      x: cellCenter.x,
      y: cellCenter.y,
      pointerType: 'touch',
    };

    gestureHandler.handleGesture(tapEvent);

    // Verify the flow
    expect(selectedCell).toEqual({ q: 5, r: 5 });
    expect(ui.selected).toEqual({ q: 5, r: 5 });
    expect(buildSheet.showBuild).toHaveBeenCalled();
  });

  it('touch out of bounds does not show build sheet', () => {
    const coordinateConverter = createCoordinateConverter(
      () => camera,
      layout,
      () => world,
    );

    const selectionHandlers = createSelectionHandlers({
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => world,
      buildSheet,
      sceneView: {
        addCellPulse: vi.fn(),
        addFloatText: vi.fn(),
      },
      input: { ui },
    });

    const gestureHandler = createGestureHandler({
      coordinateConverter,
      callbacks: {
        onCellClicked: vi.fn(),
        onCellSelected: selectionHandlers.onCellSelected,
      },
      setCamera: vi.fn(),
      getCamera: () => camera,
      boardDims: { width: layout.widthPx, height: layout.heightPx },
      getViewportSize: () => ({ width: 800, height: 600 }),
      ui,
    });

    // Simulate touch out of bounds
    const tapEvent: GestureEvent = {
      type: 'TAP',
      x: -1000,
      y: -1000,
      pointerType: 'touch',
    };

    gestureHandler.handleGesture(tapEvent);

    // Verify no selection and no build sheet
    expect(selectedCell).toBeNull();
    expect(ui.selected).toBeNull();
    expect(buildSheet.showBuild).not.toHaveBeenCalled();
  });

  it('mouse click does not trigger touch selection flow', () => {
    const coordinateConverter = createCoordinateConverter(
      () => camera,
      layout,
      () => world,
    );

    const selectionHandlers = createSelectionHandlers({
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => world,
      buildSheet,
      sceneView: {
        addCellPulse: vi.fn(),
        addFloatText: vi.fn(),
      },
      input: { ui },
    });

    const gestureHandler = createGestureHandler({
      coordinateConverter,
      callbacks: {
        onCellClicked: vi.fn(),
        onCellSelected: selectionHandlers.onCellSelected,
      },
      setCamera: vi.fn(),
      getCamera: () => camera,
      boardDims: { width: layout.widthPx, height: layout.heightPx },
      getViewportSize: () => ({ width: 800, height: 600 }),
      ui,
    });

    // Simulate mouse click
    const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
    const tapEvent: GestureEvent = {
      type: 'TAP',
      x: cellCenter.x,
      y: cellCenter.y,
      pointerType: 'mouse',
    };

    gestureHandler.handleGesture(tapEvent);

    // Verify no touch selection flow
    expect(selectedCell).toBeNull();
    expect(ui.selected).toBeNull();
    expect(buildSheet.showBuild).not.toHaveBeenCalled();
  });

  it('touch with camera offset still selects correct cell', () => {
    camera = createTestCamera({ x: 100, y: 50, scale: 1 });

    const coordinateConverter = createCoordinateConverter(
      () => camera,
      layout,
      () => world,
    );

    const selectionHandlers = createSelectionHandlers({
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => world,
      buildSheet,
      sceneView: {
        addCellPulse: vi.fn(),
        addFloatText: vi.fn(),
      },
      input: { ui },
    });

    const gestureHandler = createGestureHandler({
      coordinateConverter,
      callbacks: {
        onCellClicked: vi.fn(),
        onCellSelected: selectionHandlers.onCellSelected,
      },
      setCamera: vi.fn(),
      getCamera: () => camera,
      boardDims: { width: layout.widthPx, height: layout.heightPx },
      getViewportSize: () => ({ width: 800, height: 600 }),
      ui,
    });

    // Simulate touch on cell (5, 5) with camera offset
    const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
    const screenX = cellCenter.x * camera.scale + camera.x;
    const screenY = cellCenter.y * camera.scale + camera.y;

    const tapEvent: GestureEvent = {
      type: 'TAP',
      x: screenX,
      y: screenY,
      pointerType: 'touch',
    };

    gestureHandler.handleGesture(tapEvent);

    // Verify correct cell is selected despite camera offset
    expect(selectedCell).toEqual({ q: 5, r: 5 });
    expect(ui.selected).toEqual({ q: 5, r: 5 });
    expect(buildSheet.showBuild).toHaveBeenCalled();
  });

  it('touch with camera zoom still selects correct cell', () => {
    camera = createTestCamera({ x: 0, y: 0, scale: 2 });

    const coordinateConverter = createCoordinateConverter(
      () => camera,
      layout,
      () => world,
    );

    const selectionHandlers = createSelectionHandlers({
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => world,
      buildSheet,
      sceneView: {
        addCellPulse: vi.fn(),
        addFloatText: vi.fn(),
      },
      input: { ui },
    });

    const gestureHandler = createGestureHandler({
      coordinateConverter,
      callbacks: {
        onCellClicked: vi.fn(),
        onCellSelected: selectionHandlers.onCellSelected,
      },
      setCamera: vi.fn(),
      getCamera: () => camera,
      boardDims: { width: layout.widthPx, height: layout.heightPx },
      getViewportSize: () => ({ width: 800, height: 600 }),
      ui,
    });

    // Simulate touch on cell (5, 5) with camera zoom
    const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
    const screenX = cellCenter.x * camera.scale;
    const screenY = cellCenter.y * camera.scale;

    const tapEvent: GestureEvent = {
      type: 'TAP',
      x: screenX,
      y: screenY,
      pointerType: 'touch',
    };

    gestureHandler.handleGesture(tapEvent);

    // Verify correct cell is selected despite camera zoom
    expect(selectedCell).toEqual({ q: 5, r: 5 });
    expect(ui.selected).toEqual({ q: 5, r: 5 });
    expect(buildSheet.showBuild).toHaveBeenCalled();
  });

  describe('FSM to sheet pipeline', () => {
    function makePointer(overrides: Partial<PointerRecord> = {}): PointerRecord {
      return {
        pointerId: 1,
        x: 100,
        y: 100,
        pointerType: 'touch',
        button: 0,
        timestamp: 0,
        ...overrides,
      };
    }

    it('touch pointerDown -> pointerUp through FSM shows build sheet', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const selectionHandlers = createSelectionHandlers({
        getSelectedCell: () => selectedCell,
        setSelectedCell: (cell) => { selectedCell = cell; },
        getWorld: () => world,
        buildSheet,
        sceneView: {
          addCellPulse: vi.fn(),
          addFloatText: vi.fn(),
        },
        input: { ui },
        });

      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked: vi.fn(),
          onCellSelected: selectionHandlers.onCellSelected,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      fsm.pointerDown(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(selectedCell).toEqual({ q: 5, r: 5 });
      expect(ui.selected).toEqual({ q: 5, r: 5 });
      expect(buildSheet.showBuild).toHaveBeenCalled();
    });

    it('pen pointer through full pipeline shows build sheet', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const selectionHandlers = createSelectionHandlers({
        getSelectedCell: () => selectedCell,
        setSelectedCell: (cell) => { selectedCell = cell; },
        getWorld: () => world,
        buildSheet,
        sceneView: {
          addCellPulse: vi.fn(),
          addFloatText: vi.fn(),
        },
        input: { ui },
        });

      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked: vi.fn(),
          onCellSelected: selectionHandlers.onCellSelected,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      fsm.pointerDown(makePointer({ pointerType: 'pen', x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ pointerType: 'pen', x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(selectedCell).toEqual({ q: 5, r: 5 });
      expect(ui.selected).toEqual({ q: 5, r: 5 });
      expect(buildSheet.showBuild).toHaveBeenCalled();
    });
    it('double-tap same cell: first tap selects, second tap deselects', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const selectionHandlers = createSelectionHandlers({
        getSelectedCell: () => selectedCell,
        setSelectedCell: (cell) => { selectedCell = cell; },
        getWorld: () => world,
        buildSheet,
        sceneView: {
          addCellPulse: vi.fn(),
          addFloatText: vi.fn(),
        },
        input: { ui },
        });

      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked: vi.fn(),
          onCellSelected: selectionHandlers.onCellSelected,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      // First tap: should select the cell
      fsm.pointerDown(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(selectedCell).toEqual({ q: 5, r: 5 });
      expect(ui.selected).toEqual({ q: 5, r: 5 });
      expect(buildSheet.showBuild).toHaveBeenCalledTimes(1);

      // Second tap on same cell: should deselect
      fsm.pointerDown(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 200 }));
      fsm.pointerUp(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 300 }));

      expect(selectedCell).toBeNull();
      expect(ui.selected).toBeNull();
      expect(buildSheet.hide).toHaveBeenCalledTimes(1);
    });

    it('touch followed by synthetic mouse at same location', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const selectionHandlers = createSelectionHandlers({
        getSelectedCell: () => selectedCell,
        setSelectedCell: (cell) => { selectedCell = cell; },
        getWorld: () => world,
        buildSheet,
        sceneView: {
          addCellPulse: vi.fn(),
          addFloatText: vi.fn(),
        },
        input: { ui },
        });

      const onCellClicked = vi.fn();
      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked,
          onCellSelected: selectionHandlers.onCellSelected,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      fsm.pointerDown(makePointer({ pointerType: 'touch', x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ pointerType: 'touch', x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(selectedCell).toEqual({ q: 5, r: 5 });
      expect(ui.selected).toEqual({ q: 5, r: 5 });
      expect(buildSheet.showBuild).toHaveBeenCalledTimes(1);

      fsm.pointerDown(makePointer({ pointerType: 'mouse', button: 0, x: cellCenter.x, y: cellCenter.y, timestamp: 150 }));
      fsm.pointerUp(makePointer({ pointerType: 'mouse', button: 0, x: cellCenter.x, y: cellCenter.y, timestamp: 200 }));

      expect(onCellClicked).not.toHaveBeenCalled();
    });

    it('single tap results in exactly one onCellSelected call', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const onCellSelectedSpy = vi.fn();
      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked: vi.fn(),
          onCellSelected: onCellSelectedSpy,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      fsm.pointerDown(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(onCellSelectedSpy).toHaveBeenCalledTimes(1);
      expect(onCellSelectedSpy).toHaveBeenCalledWith({ q: 5, r: 5 });
    });

    it('build sheet remains visible after single tap', () => {
      const coordinateConverter = createCoordinateConverter(
        () => camera,
        layout,
        () => world,
      );

      const selectionHandlers = createSelectionHandlers({
        getSelectedCell: () => selectedCell,
        setSelectedCell: (cell) => { selectedCell = cell; },
        getWorld: () => world,
        buildSheet,
        sceneView: {
          addCellPulse: vi.fn(),
          addFloatText: vi.fn(),
        },
        input: { ui },
        });

      const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks: {
          onCellClicked: vi.fn(),
          onCellSelected: selectionHandlers.onCellSelected,
        },
        setCamera: vi.fn(),
        getCamera: () => camera,
        boardDims: { width: layout.widthPx, height: layout.heightPx },
        getViewportSize: () => ({ width: 800, height: 600 }),
        ui,
        });

      const cellCenter = axialToPixel(layout, { q: 5, r: 5 });
      const fsm = new GestureFsm((event) => gestureHandler.handleGesture(event));

      fsm.pointerDown(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 0 }));
      fsm.pointerUp(makePointer({ x: cellCenter.x, y: cellCenter.y, timestamp: 100 }));

      expect(selectedCell).toEqual({ q: 5, r: 5 });
      expect(ui.selected).toEqual({ q: 5, r: 5 });
      expect(buildSheet.showBuild).toHaveBeenCalledTimes(1);
      expect(buildSheet.hide).not.toHaveBeenCalled();
    });
  });
});
