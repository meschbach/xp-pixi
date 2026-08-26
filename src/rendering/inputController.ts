import type {AxialCoord} from '../simulation/hex';
import {checkPlacement, getDefaultTowerTypeId} from '../simulation/placement';
import {getBalance} from '../simulation/registry';
import {computeCoverage} from '../simulation/towers';
import type {World} from '../simulation/world';
import type {Application, FederatedPointerEvent} from 'pixi.js';
import type {BoardLayout} from './hexLayout';
import type {PlacementPreview, SceneUiState} from './sceneView';
import {clampPan, clampScale, fitCamera, zoomAroundPoint} from './camera';
import type {Camera} from './camera';
import {GestureFsm} from './gestureFsm';
import type {GestureEvent, PointerType} from './gestureFsm';
import {createCoordinateConverter} from './coordinateConverter';
import {createGestureHandler} from './gestureHandler';

export const FLOAT_COLOR_REJECT = 0xff8787;

const WHEEL_ZOOM_STEP = 1.1;
const TRACKPAD_K_PIXEL = 0.005;

export interface InputController {
    ui: SceneUiState;
    readonly lastPointerType: PointerType;

    refresh(world: World): void;

    reset(): void;
}

export interface InputCallbacks {
    onCellClicked(cell: AxialCoord): void;

    onCellSelected(cell: AxialCoord | null): void;
}

interface CachedPreview {
    key: string;
    preview: PlacementPreview | null;
}

export function attachInput(
    app: Application,
    layout: BoardLayout,
    getWorld: () => World,
    callbacks: InputCallbacks,
    getCamera: () => Camera,
    setCamera: (camera: Camera) => void,
    logger?: (...args: unknown[]) => void,
): InputController {
    const ui: SceneUiState = {hover: null, selected: null, preview: null};
    let cache: CachedPreview | null = null;
    let lastPointerType: PointerType = 'mouse';

    function log(...args: unknown[]): void {
        logger?.(...args);
    }

    app.canvas.style.touchAction = 'none';

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;

    const boardDims = {width: layout.widthPx, height: layout.heightPx};

    const coordinateConverter = createCoordinateConverter(getCamera, layout, getWorld);
    const gestureHandler = createGestureHandler({
        coordinateConverter,
        callbacks,
        setCamera,
        getCamera,
        boardDims,
        getViewportSize,
        ui,
        logger,
    });

    const fsm = new GestureFsm((event: GestureEvent) => {
        if (event.type === 'TAP' || event.type === 'LONG_PRESS') {
            lastPointerType = event.pointerType;
        }
        log('[gesture]', event);
        gestureHandler.handleGesture(event);
    });

    function getViewportSize(): { width: number; height: number } {
        return {width: app.screen.width, height: app.screen.height};
    }

    function getPointerPosition(event: FederatedPointerEvent): { x: number; y: number } {
        const nativeEvent = event.nativeEvent as PointerEvent;
        const rect = app.canvas.getBoundingClientRect();
        return {
            x: nativeEvent.clientX - rect.left,
            y: nativeEvent.clientY - rect.top,
        };
    }

    function onPointerDown(event: FederatedPointerEvent): void {
        const pointerType = mapPointerType(event.pointerType);
        lastPointerType = pointerType;
        const nativeEvent = event.nativeEvent as PointerEvent;
        if (nativeEvent.target instanceof Element && nativeEvent.target.setPointerCapture) {
            nativeEvent.target.setPointerCapture(nativeEvent.pointerId);
        }

        const { x, y } = getPointerPosition(event);
        const rect = app.canvas.getBoundingClientRect();
        const cell = pickCell(x, y);

        log('[pointerdown]', {
            pointerType,
            eventGlobal: {x: event.global.x, y: event.global.y},
            logical: {x, y},
            native: {clientX: nativeEvent.clientX, clientY: nativeEvent.clientY},
            rect: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
            resolution: app.renderer.resolution,
            camera: getCamera(),
            viewport: getViewportSize(),
            cell,
        });

        if (pointerType === 'mouse' && event.button === 0) {
            if (cell) {
                // Mouse left-click: immediate tower placement via onCellClicked.
                // Sets ui.selected for visual feedback (hex outline, coverage overlay)
                // but does NOT set selectedCell (that variable is exclusively for the
                // touch confirmation flow via onCellSelected).
                ui.selected = cell;
                callbacks.onCellClicked(cell);
            }
            return;
        }

        fsm.pointerDown({
            pointerId: event.data.pointerId ?? 0,
            x,
            y,
            pointerType,
            button: event.button ?? 0,
            timestamp: performance.now(),
        });
    }

    function onPointerMove(event: FederatedPointerEvent): void {
        const pointerType = mapPointerType(event.pointerType);
        lastPointerType = pointerType;

        const { x, y } = getPointerPosition(event);
        const rect = app.canvas.getBoundingClientRect();
        const cell = pickCell(x, y);

        log('[pointermove]', {
            pointerType,
            eventGlobal: {x: event.global.x, y: event.global.y},
            logical: {x, y},
            native: {clientX: (event.nativeEvent as PointerEvent).clientX, clientY: (event.nativeEvent as PointerEvent).clientY},
            rect: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
            resolution: app.renderer.resolution,
            camera: getCamera(),
            viewport: getViewportSize(),
            cell,
        });

        if (pointerType === 'mouse') {
            ui.hover = cell;
        }

        fsm.pointerMove({
            pointerId: event.data.pointerId ?? 0,
            x,
            y,
            pointerType,
            button: event.button ?? 0,
            timestamp: performance.now(),
        });
    }

    function onPointerUp(event: FederatedPointerEvent): void {
        const pointerType = mapPointerType(event.pointerType);
        const { x, y } = getPointerPosition(event);
        const rect = app.canvas.getBoundingClientRect();
        const cell = pickCell(x, y);

        log('[pointerup]', {
            pointerType,
            eventGlobal: {x: event.global.x, y: event.global.y},
            logical: {x, y},
            native: {clientX: (event.nativeEvent as PointerEvent).clientX, clientY: (event.nativeEvent as PointerEvent).clientY},
            rect: {left: rect.left, top: rect.top, width: rect.width, height: rect.height},
            resolution: app.renderer.resolution,
            camera: getCamera(),
            viewport: getViewportSize(),
            cell,
        });

        fsm.pointerUp({
            pointerId: event.data.pointerId ?? 0,
            x,
            y,
            pointerType,
            button: event.button ?? 0,
            timestamp: performance.now(),
        });
    }

    function onPointerCancel(): void {
        fsm.pointerCancel();
    }

    app.stage.on('pointerdown', onPointerDown);
    app.stage.on('pointermove', onPointerMove);
    app.stage.on('pointerup', onPointerUp);
    app.stage.on('pointercancel', onPointerCancel);

    app.canvas.addEventListener('pointerleave', () => {
        ui.hover = null;
    });

    app.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    app.canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1) {
            e.preventDefault();
        }
    });

    app.canvas.addEventListener('wheel', (e: WheelEvent) => {
        e.preventDefault();
        const camera = getCamera();
        const viewport = getViewportSize();
        const rect = app.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        let factor: number;
        if (e.deltaMode === 0) {
            factor = 1 + (-e.deltaY * TRACKPAD_K_PIXEL);
        } else {
            factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
        }

        if (e.ctrlKey) {
            // trackpad pinch on macOS - already handled by deltaMode check
        }

        let updated = zoomAroundPoint(camera, factor, px, py);
        const fit = fitCamera(boardDims, viewport);
        updated = {...updated, scale: clampScale(updated.scale, fit.scale)};
        updated = clampPan(updated, boardDims, viewport);
        setCamera(updated);
    }, {passive: false});

    function pickCell(px: number, py: number): AxialCoord | null {
        return coordinateConverter.screenToCell(px, py);
    }

    function mapPointerType(pt: string | undefined): PointerType {
        if (pt === 'touch') return 'touch';
        if (pt === 'pen') return 'pen';
        return 'mouse';
    }

    return {
        ui,
        get lastPointerType() {
            return lastPointerType;
        },
        refresh(world: World) {
            const activeFocus = ui.hover ?? ui.selected;
            if (!activeFocus || world.state !== 'running') {
                ui.preview = null;
                cache = null;
                return;
            }

            const def = getBalance().towers.get(getDefaultTowerTypeId());
            if (!def) {
                ui.preview = null;
                return;
            }
            const affordable = world.money >= def.cost;
            const focusSource = ui.hover ? 'hover' : 'selected';
            const key = `${cellKeyOf(activeFocus)}|${focusSource}|${world.towers.length}|${affordable}`;
            if (cache && cache.key === key) {
                ui.preview = cache.preview;
                return;
            }

            const check = checkPlacement(world, activeFocus, def.cost);
            const preview: PlacementPreview = check.ok
                ? {cell: activeFocus, valid: true, coverage: computeCoverage(world.map, activeFocus, def.rangeHops)}
                : {cell: activeFocus, valid: false, coverage: new Set<string>()};
            cache = {key, preview};
            ui.preview = preview;
        },
        reset() {
            ui.hover = null;
            ui.selected = null;
            ui.preview = null;
            cache = null;
        },
    };
}

function cellKeyOf(c: AxialCoord): string {
    return `${c.q},${c.r}`;
}
