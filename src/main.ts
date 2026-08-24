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

// Rendering/simulation module edits bubble to this boundary: the running
// World is carried across the swap (design D5) instead of being lost to a
// full reload. Data modules self-accept earlier in the graph, so tuning
// edits never reach here.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    (data as CarryOver).world = world;
    activeCleanup?.();
  });
  import.meta.hot.accept();
}

function freshWorld(): World {
  const map = createGameMap(SLICE_MAP);
  return createWorld({ map, startingMoney: STARTING_MONEY, startingLives: STARTING_LIVES });
}

async function start(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) {
    throw new Error('#app mount element not found');
  }

  // Adopt the carried run when this module hot-swaps; fresh otherwise.
  world = (import.meta.hot?.data as CarryOver | undefined)?.world ?? freshWorld();

  const layout = computeBoardLayout(SLICE_MAP.width, SLICE_MAP.height);
  const { app, root } = await bootRenderer(host, layout.widthPx, layout.heightPx);

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
      world = freshWorld();
      input.reset();
      sceneView.reset();
      boardView.invalidate();
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
    hudRoot.remove();
  };
}

void start();
