import { bootRenderer } from './rendering/app';
import { computeBoardLayout } from './rendering/hexLayout';
import { createBoardView } from './rendering/boardView';
import { createSceneView } from './rendering/sceneView';
import { attachInput, FLOAT_COLOR_REJECT } from './rendering/inputController';
import { createHud } from './rendering/hud';
import { SLICE_MAP } from './data/maps/slice';
import { STARTING_LIVES, STARTING_MONEY } from './data/rules';
import { createGameMap } from './simulation/map';
import { createWorld, TICK_RATE_HZ } from './simulation/world';
import type { World } from './simulation/world';
import { getDefaultTowerTypeId, tryPlaceTower } from './simulation/placement';
import { getBalance } from './simulation/registry';
import { subscribeLiveTuning } from './simulation/hotApply';

const STEP_MS = 1000 / TICK_RATE_HZ;
const MAX_CATCH_UP_TICKS = 5;

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
  const { app, root } = await bootRenderer(host, layout.widthPx, layout.heightPx);
  if (generation !== bootGeneration) {
    // Superseded while the renderer initialized (restart/HMR race).
    app.destroy(true, { children: true });
    root.remove();
    return;
  }

  const boardView = createBoardView(layout);
  const sceneView = createSceneView(layout);
  app.stage.addChild(boardView.container, sceneView.container);

  const hudRoot = document.createElement('div');
  hudRoot.className = 'hud-root';
  root.appendChild(hudRoot);

  function rejectionMessage(reason: string): string {
    switch (reason) {
      case 'unaffordable':
        return `Need $${getBalance().towers.get(getDefaultTowerTypeId())?.cost ?? '?'}`;
      case 'blocked':
      case 'level-marker':
        return 'Occupied';
      case 'not-buildable':
        return "Can't build here";
      case 'would-seal-spawn':
      case 'would-strand-enemy':
        return 'Path must stay open';
      default:
        return 'Rejected';
    }
  }

  const input = attachInput(app, layout, () => world!, {
    onCellClicked(cell) {
      const result = tryPlaceTower(world!, cell);
      if (!result.ok && result.reason !== 'out-of-bounds') {
        sceneView.addCellPulse(cell);
        sceneView.addFloatText(cell, rejectionMessage(result.reason), FLOAT_COLOR_REJECT);
      }
    },
  });

  const hud = createHud(hudRoot, {
    onStartWave() {
      world!.requestStartWave();
    },
    onRestart() {
      startSession();
    },
  });

  // Placed towers track hot-applied balance until this session dies; the
  // listener must not outlive it or it would mutate a discarded world.
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
      accumulator = 0; // shed backlog instead of spiraling
    }

    input.refresh(world!);
    boardView.update(world!);
    sceneView.update(world!, input.ui, dtMs);
    hud.update(world!);
  });

  activeCleanup = () => {
    unsubscribeTuning();
    accumulator = 0;
    app.destroy(true, { children: true });
    root.remove(); // takes the HUD subtree with it
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
