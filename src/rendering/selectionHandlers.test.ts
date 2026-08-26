import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSelectionHandlers } from './selectionHandlers';
import type { SelectionDependencies } from './selectionHandlers';
import type { BuildSheet } from './buildSheet';
import type { SceneViewLike } from './selectionHandlers';
import type { World } from '../simulation/world';
import type { AxialCoord } from '../simulation/hex';
import * as placement from '../simulation/placement';
import * as registry from '../simulation/registry';

vi.mock('../simulation/placement');
vi.mock('../simulation/registry');

describe('selectionHandlers', () => {
  let deps: SelectionDependencies;
  let mockBuildSheet: BuildSheet;
  let mockSceneView: SceneViewLike;
  let selectedCell: AxialCoord | null;
  let mockWorld: World;

  beforeEach(() => {
    vi.clearAllMocks();
    selectedCell = null;

    mockBuildSheet = {
      showBuild: vi.fn(),
      showRejection: vi.fn(),
      hide: vi.fn(),
      isVisible: vi.fn(() => false),
    };

    mockSceneView = {
      addCellPulse: vi.fn(),
      addFloatText: vi.fn(),
    };

    mockWorld = {
      map: {
        width: 10,
        height: 10,
        cells: [],
        spawn: { q: 0, r: 0 },
        goal: { q: 9, r: 9 },
      },
      money: 100,
      lives: 10,
      state: 'running',
      enemies: [],
      towers: [],
      tick: vi.fn(),
      requestStartWave: vi.fn(),
      spawnEnemy: vi.fn(),
      creditMoney: vi.fn(),
      trySpend: vi.fn(() => true),
    } as unknown as World;

    deps = {
      getSelectedCell: () => selectedCell,
      setSelectedCell: (cell) => { selectedCell = cell; },
      getWorld: () => mockWorld,
      buildSheet: mockBuildSheet,
      sceneView: mockSceneView,
      input: {
        ui: {
          selected: null,
          preview: null,
          hover: null,
        },
      },
    };
  });

  describe('clearSelection', () => {
    it('resets selectedCell to null', () => {
      selectedCell = { q: 5, r: 5 };
      const handlers = createSelectionHandlers(deps);

      handlers.clearSelection();

      expect(selectedCell).toBeNull();
    });

    it('clears input.ui.selected', () => {
      deps.input.ui.selected = { q: 5, r: 5 };
      const handlers = createSelectionHandlers(deps);

      handlers.clearSelection();

      expect(deps.input.ui.selected).toBeNull();
    });

    it('clears input.ui.preview', () => {
      deps.input.ui.preview = { cell: { q: 5, r: 5 }, valid: true, coverage: new Set() };
      const handlers = createSelectionHandlers(deps);

      handlers.clearSelection();

      expect(deps.input.ui.preview).toBeNull();
    });

    it('hides build sheet', () => {
      const handlers = createSelectionHandlers(deps);

      handlers.clearSelection();

      expect(mockBuildSheet.hide).toHaveBeenCalled();
    });

  });

  describe('onCellSelected', () => {
    it('calls clearSelection when cell is null', () => {
      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected(null);

      expect(selectedCell).toBeNull();
      expect(mockBuildSheet.hide).toHaveBeenCalled();
    });

    it('calls clearSelection when same cell is tapped again', () => {
      selectedCell = { q: 5, r: 5 };
      deps.input.ui.selected = { q: 5, r: 5 };
      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 5, r: 5 });

      expect(selectedCell).toBeNull();
      expect(deps.input.ui.selected).toBeNull();
      expect(mockBuildSheet.hide).toHaveBeenCalled();
    });

    it('sets ui.selected when selecting a new cell', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(placement.checkPlacement).mockReturnValue({ ok: true, field: {} as any });
      vi.mocked(registry.getBalance).mockReturnValue({
        towers: new Map([['arrow', { id: 'arrow', cost: 50 }]]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(placement.getDefaultTowerTypeId).mockReturnValue('arrow');

      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 5, r: 5 });

      expect(deps.input.ui.selected).toEqual({ q: 5, r: 5 });
    });

    it('clears ui.selected when same cell is tapped again', () => {
      selectedCell = { q: 5, r: 5 };
      deps.input.ui.selected = { q: 5, r: 5 };
      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 5, r: 5 });

      expect(deps.input.ui.selected).toBeNull();
    });

    it('updates ui.selected when selecting a different cell', () => {
      selectedCell = { q: 3, r: 3 };
      deps.input.ui.selected = { q: 3, r: 3 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(placement.checkPlacement).mockReturnValue({ ok: true, field: {} as any });
      vi.mocked(registry.getBalance).mockReturnValue({
        towers: new Map([['arrow', { id: 'arrow', cost: 50 }]]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(placement.getDefaultTowerTypeId).mockReturnValue('arrow');

      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 7, r: 7 });

      expect(deps.input.ui.selected).toEqual({ q: 7, r: 7 });
      expect(selectedCell).toEqual({ q: 7, r: 7 });
    });

    it('sets selectedCell when different cell is tapped', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(placement.checkPlacement).mockReturnValue({ ok: true, field: {} as any });
       
      vi.mocked(registry.getBalance).mockReturnValue({
        towers: new Map([['arrow', { id: 'arrow', cost: 50 }]]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(placement.getDefaultTowerTypeId).mockReturnValue('arrow');

      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 5, r: 5 });

      expect(selectedCell).toEqual({ q: 5, r: 5 });
    });

    it('calls clearSelection when world is null', () => {
      deps.getWorld = () => undefined;
      const handlers = createSelectionHandlers(deps);

      handlers.onCellSelected({ q: 5, r: 5 });

      expect(selectedCell).toBeNull();
    });

    it('shows build sheet when placement is valid', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(placement.checkPlacement).mockReturnValue({ ok: true, field: {} as any });
       
      vi.mocked(registry.getBalance).mockReturnValue({
        towers: new Map([['arrow', { id: 'arrow', cost: 50 }]]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(placement.getDefaultTowerTypeId).mockReturnValue('arrow');

      const handlers = createSelectionHandlers(deps);
      handlers.onCellSelected({ q: 5, r: 5 });

      expect(mockBuildSheet.showBuild).toHaveBeenCalled();
    });

    it('shows rejection sheet when placement is invalid', () => {
      vi.mocked(placement.checkPlacement).mockReturnValue({ ok: false, reason: 'unaffordable' });
       
      vi.mocked(registry.getBalance).mockReturnValue({
        towers: new Map([['arrow', { id: 'arrow', cost: 50 }]]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      vi.mocked(placement.getDefaultTowerTypeId).mockReturnValue('arrow');

      const handlers = createSelectionHandlers(deps);
      handlers.onCellSelected({ q: 5, r: 5 });

      expect(mockBuildSheet.showRejection).toHaveBeenCalledWith('unaffordable');
    });

  });

  describe('onCellClicked', () => {
    it('does nothing when world is null', () => {
      deps.getWorld = () => undefined;
      const handlers = createSelectionHandlers(deps);

      handlers.onCellClicked({ q: 5, r: 5 });

      expect(mockSceneView.addCellPulse).not.toHaveBeenCalled();
      expect(mockSceneView.addFloatText).not.toHaveBeenCalled();
    });

    it('shows rejection feedback when placement fails', () => {
      vi.mocked(placement.tryPlaceTower).mockReturnValue({ ok: false, reason: 'not-buildable' });

      const handlers = createSelectionHandlers(deps);

      handlers.onCellClicked({ q: 5, r: 5 });

      expect(mockSceneView.addCellPulse).toHaveBeenCalledWith({ q: 5, r: 5 });
      expect(mockSceneView.addFloatText).toHaveBeenCalled();
    });
  });

  describe('onConfirm', () => {
    it('calls clearSelection after confirmation', () => {
      selectedCell = { q: 5, r: 5 };
      vi.mocked(placement.tryPlaceTower).mockReturnValue({ ok: true });

      const handlers = createSelectionHandlers(deps);

      handlers.onConfirm();

      expect(mockBuildSheet.hide).toHaveBeenCalled();
    });

    it('does nothing when selectedCell is null', () => {
      const handlers = createSelectionHandlers(deps);

      handlers.onConfirm();

      expect(mockSceneView.addCellPulse).not.toHaveBeenCalled();
      expect(mockSceneView.addFloatText).not.toHaveBeenCalled();
    });

    it('places tower when selectedCell exists', () => {
      selectedCell = { q: 5, r: 5 };
      vi.mocked(placement.tryPlaceTower).mockReturnValue({ ok: true });

      const handlers = createSelectionHandlers(deps);

      handlers.onConfirm();

      expect(placement.tryPlaceTower).toHaveBeenCalledWith(mockWorld, { q: 5, r: 5 });
    });
  });

  describe('onClose', () => {
    it('calls clearSelection', () => {
      selectedCell = { q: 5, r: 5 };
      const handlers = createSelectionHandlers(deps);

      handlers.onClose();

      expect(selectedCell).toBeNull();
      expect(mockBuildSheet.hide).toHaveBeenCalled();
    });
  });

});
