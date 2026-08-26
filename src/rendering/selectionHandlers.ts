import type {AxialCoord} from '../simulation/hex';
import type {World} from '../simulation/world';
import {checkPlacement, getDefaultTowerTypeId, tryPlaceTower} from '../simulation/placement';
import {getBalance} from '../simulation/registry';
import {rejectionMessage} from './placementMessage';
import type {BuildSheet} from './buildSheet';
import type {SceneUiState} from './sceneView';

export const FLOAT_COLOR_REJECT = 0xff8787;

export interface SceneViewLike {
    addCellPulse(cell: AxialCoord): void;

    addFloatText(cell: AxialCoord, text: string, color: number): void;
}

export interface SelectionDependencies {
    getSelectedCell: () => AxialCoord | null;
    setSelectedCell: (cell: AxialCoord | null) => void;
    getWorld: () => World | undefined;
    buildSheet: BuildSheet;
    sceneView: SceneViewLike;
    input: {
        ui: SceneUiState;
    };
    logger?: (...args: unknown[]) => void;
}

export interface SelectionHandlers {
    clearSelection(): void;

    onCellSelected(cell: AxialCoord | null): void;

    onCellClicked(cell: AxialCoord): void;

    onConfirm(): void;

    onClose(): void;
}

export function createSelectionHandlers(deps: SelectionDependencies): SelectionHandlers {
    function log(...args: unknown[]): void {
        deps.logger?.(...args);
    }

    function clearSelection(): void {
        log('[selectionHandlers] clearSelection');
        deps.setSelectedCell(null);
        deps.input.ui.selected = null;
        deps.input.ui.preview = null;
        deps.buildSheet.hide();
    }

    function onCellSelected(cell: AxialCoord | null): void {
        log('[selectionHandlers] onCellSelected', { cell, currentSelected: deps.input.ui.selected });
        try {
            if (!cell) {
                log('[selectionHandlers] onCellSelected: null cell, clearing');
                clearSelection();
                return;
            }

            const currentSelected = deps.input.ui.selected;
            if (currentSelected && currentSelected.q === cell.q && currentSelected.r === cell.r) {
                log('[selectionHandlers] onCellSelected: same cell, clearing');
                clearSelection();
                return;
            }

            deps.input.ui.selected = cell;
            deps.setSelectedCell(cell);

            const w = deps.getWorld();
            if (!w) {
                log('[selectionHandlers] onCellSelected: no world, clearing');
                clearSelection();
                return;
            }

            const def = getBalance().towers.get(getDefaultTowerTypeId());
            if (!def) {
                log('[selectionHandlers] onCellSelected: no tower def, clearing');
                clearSelection();
                return;
            }

            const check = checkPlacement(w, cell, def.cost);
            log('[selectionHandlers] onCellSelected: placement check', { ok: check.ok, reason: check.ok ? undefined : check.reason });

            if (check.ok) {
                deps.buildSheet.showBuild();
            } else {
                deps.buildSheet.showRejection(check.reason);
            }
        } catch (err) {
            log('[selectionHandlers] onCellSelected: exception', err);
            clearSelection();
        }
    }

    function onCellClicked(cell: AxialCoord): void {
        const w = deps.getWorld();
        if (!w) return;

        const result = tryPlaceTower(w, cell);
        if (!result.ok && result.reason !== 'out-of-bounds') {
            deps.sceneView.addCellPulse(cell);
            deps.sceneView.addFloatText(cell, rejectionMessage(result.reason), FLOAT_COLOR_REJECT);
        }
    }

    function onConfirm(): void {
        const selectedCell = deps.getSelectedCell();
        const w = deps.getWorld();

        if (selectedCell && w) {
            const result = tryPlaceTower(w, selectedCell);
            if (!result.ok && result.reason !== 'out-of-bounds') {
                deps.sceneView.addCellPulse(selectedCell);
                deps.sceneView.addFloatText(selectedCell, rejectionMessage(result.reason), FLOAT_COLOR_REJECT);
            }
            clearSelection();
        }
    }

    function onClose(): void {
        clearSelection();
    }

    return {
        clearSelection,
        onCellSelected,
        onCellClicked,
        onConfirm,
        onClose,
    };
}
