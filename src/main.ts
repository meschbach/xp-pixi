import { bootRenderer } from './rendering/app';
import { computeBoardLayout } from './rendering/hexLayout';
import { createBoardView } from './rendering/boardView';
import { createSceneView } from './rendering/sceneView';
import { attachInput } from './rendering/inputController';
import { createHud } from './rendering/hud';
import { SLICE_MAP } from './data/maps/slice';
import { STARTING_LIVES, STARTING_MONEY } from './data/rules';
import { createGameMap } from './simulation/map';
import { createWorld, TICK_RATE_HZ } from './simulation/world';
import type { World } from './simulation/world';
import { subscribeLiveTuning } from './simulation/hotApply';
import { Container, Rectangle } from 'pixi.js';
import { clampPan, clampScale, fitCamera } from './rendering/camera';
import type { Camera } from './rendering/camera';
import { createBuildSheet } from './rendering/buildSheet';
import { createSelectionHandlers } from './rendering/selectionHandlers';
import type { AxialCoord } from './simulation/hex';

const STEP_MS = 1000 / TICK_RATE_HZ;
const MAX_CATCH_UP_TICKS = 5;

declare global {
    interface Window {
        __debugInput?: boolean;
    }
}

const debugLogger = (...args: unknown[]): void => {
    if (window.__debugInput) {
        console.log('[input]', ...args);
    }
};

interface CarryOver {
  world?: World;
}

let world: World | undefined;
let activeCleanup: (() => void) | null = null;
/** Bumped per boot; lets a superseded async boot abandon itself safely. */
let bootGeneration = 0;

// Rendering/simulation module edits bubble to this boundary: the running
// World is carried across the swap (design D5) instead of being lost to a
// full reload. Data modules self-accept earlier in the graph, so tuning
// edits never reach here.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    (data as CarryOver).world = world;
    activeCleanup?.();
    activeCleanup = null;
  });
  import.meta.hot.accept();
}

function freshWorld(): World {
  const map = createGameMap(SLICE_MAP);
  return createWorld({ map, startingMoney: STARTING_MONEY, startingLives: STARTING_LIVES });
}

/**
 * Boots one full session around `carry ?? freshWorld()`: layout and canvas
 * derive from that world's map, so every entry path — initial load, restart,
 * HMR swap — plays on a view matching the world it simulates.
 */
async function bootSession(carry?: World): Promise<void> {
  const generation = ++bootGeneration;
  const host = document.getElementById('app');
  if (!host) {
    throw new Error('#app mount element not found');
  }

  world = carry ?? freshWorld();

  const layout = computeBoardLayout(world.map.width, world.map.height);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { app, root } = await bootRenderer(host, vw, vh);
  if (generation !== bootGeneration) {
    app.destroy(true, { children: true });
    root.remove();
    return;
  }

  const worldContainer = new Container();
  const boardView = createBoardView(layout);
  const sceneView = createSceneView(layout);
  worldContainer.addChild(boardView.container, sceneView.container);
  app.stage.addChild(worldContainer);

  let camera: Camera = fitCamera(
    { width: layout.widthPx, height: layout.heightPx },
    { width: vw, height: vh },
  );
  applyCamera();

  function applyCamera(): void {
    worldContainer.scale.set(camera.scale);
    worldContainer.position.set(camera.x, camera.y);
  }

  function getViewportSize(): { width: number; height: number } {
    const vv = window.visualViewport;
    if (vv) {
      return { width: vv.width, height: vv.height };
    }
    return { width: window.innerWidth, height: window.innerHeight };
  }

  let resizeTimer: ReturnType<typeof setTimeout> | null = null;
  function onViewportResize(): void {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      const { width: newVw, height: newVh } = getViewportSize();
      app.renderer.resize(newVw, newVh);
      app.stage.hitArea = new Rectangle(0, 0, newVw, newVh);

      const oldFit = fitCamera(
        { width: layout.widthPx, height: layout.heightPx },
        { width: vw, height: vh },
      );
      const zoomFactor = camera.scale / oldFit.scale;
      const newFit = fitCamera(
        { width: layout.widthPx, height: layout.heightPx },
        { width: newVw, height: newVh },
      );
      const newScale = clampScale(newFit.scale * zoomFactor, newFit.scale);
      const centerX = layout.widthPx / 2;
      const centerY = layout.heightPx / 2;
      camera = clampPan(
        {
          x: newVw / 2 - centerX * newScale,
          y: newVh / 2 - centerY * newScale,
          scale: newScale,
        },
        { width: layout.widthPx, height: layout.heightPx },
        { width: newVw, height: newVh },
      );
      applyCamera();
    }, 150);
  }

  window.addEventListener('resize', onViewportResize);
  window.visualViewport?.addEventListener('resize', onViewportResize);

  const hudRoot = document.createElement('div');
  hudRoot.className = 'hud-root';
  root.appendChild(hudRoot);

  let selectedCell: AxialCoord | null = null;

  const buildSheet = createBuildSheet(hudRoot, {
    onConfirm: () => {
      handlers.onConfirm();
    },
    onClose: () => {
      handlers.onClose();
    },
  });

  // eslint-disable-next-line prefer-const
  let handlers: ReturnType<typeof createSelectionHandlers>;

  const input = attachInput(app, layout, () => world!, {
    onCellClicked: (cell) => {
      handlers.onCellClicked(cell);
    },
    onCellSelected: (cell) => {
      handlers.onCellSelected(cell);
    },
  }, () => camera, (newCamera) => {
    camera = newCamera;
    applyCamera();
  }, debugLogger);

  handlers = createSelectionHandlers({
    getSelectedCell: () => selectedCell,
    setSelectedCell: (cell) => {
        selectedCell = cell;
        },
    getWorld: () => world,
    buildSheet,
    sceneView,
    input,
    logger: debugLogger,
  });

  const hud = createHud(hudRoot, {
    onStartWave() {
      handlers.clearSelection();
      world!.requestStartWave();
    },
    onRestart() {
      startSession();
    },
  }, () => input.lastPointerType);

  const unsubscribeTuning = subscribeLiveTuning(world);

  let accumulator = 0;
  app.ticker.add((ticker) => {
    const dtMs = Math.min(ticker.deltaMS, 250);

    accumulator += dtMs;
    let steps = 0;
    while (accumulator >= STEP_MS && steps < MAX_CATCH_UP_TICKS) {
      world!.tick();
      accumulator -= STEP_MS;
      steps++;
    }
    if (steps === MAX_CATCH_UP_TICKS) {
      accumulator = 0;
    }

    input.refresh(world!);
    boardView.update(world!);
    sceneView.update(world!, input.ui, dtMs);
    hud.update(world!);

    if (world!.state !== 'running' && buildSheet.isVisible()) {
      handlers.clearSelection();
    }
  });

  activeCleanup = () => {
    unsubscribeTuning();
    accumulator = 0;
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
    window.removeEventListener('resize', onViewportResize);
    window.visualViewport?.removeEventListener('resize', onViewportResize);
    app.destroy(true, { children: true });
    root.remove();
  };
}

/**
 * Session entry point: tears down any live session, then boots — optionally
 * adopting a carried run. Initial load, restart, and HMR swaps all funnel
 * through here, so a replaced world is never paired with a stale canvas.
 */
function startSession(carry?: World): void {
  activeCleanup?.();
  activeCleanup = null;
  void bootSession(carry);
}

// Adopt the carried run when this module hot-swaps; fresh otherwise.
startSession((import.meta.hot?.data as CarryOver | undefined)?.world);
