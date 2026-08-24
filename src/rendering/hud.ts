import type { World } from '../simulation/world';
import { getBalance } from '../simulation/registry';
import { TICK_RATE_HZ } from '../simulation/clock';

/**
 * DOM HUD layered over the canvas: money/lives/wave readout, the first-wave
 * start control, intermission countdown, and game-over/victory overlays with
 * a restart button. Rendering owns DOM; simulation stays pure.
 */

export interface Hud {
  update(world: World): void;
}

export interface HudCallbacks {
  onStartWave(): void;
  onRestart(): void;
}

export function createHud(root: HTMLElement, callbacks: HudCallbacks): Hud {
  root.innerHTML = `
    <div class="hud-stats">
      <span class="hud-money"></span>
      <span class="hud-lives"></span>
      <span class="hud-wave"></span>
    </div>
    <button class="hud-start hidden" type="button">Start wave</button>
    <div class="hud-hint">Click a buildable tile to place a tower</div>
    <div class="hud-overlay hidden">
      <div class="hud-panel">
        <h1></h1>
        <p></p>
        <button class="hud-restart" type="button">Restart</button>
      </div>
    </div>
  `;

  const moneyEl = root.querySelector('.hud-money') as HTMLElement;
  const livesEl = root.querySelector('.hud-lives') as HTMLElement;
  const waveEl = root.querySelector('.hud-wave') as HTMLElement;
  const startBtn = root.querySelector('.hud-start') as HTMLButtonElement;
  const overlay = root.querySelector('.hud-overlay') as HTMLElement;
  const overlayTitle = overlay.querySelector('h1') as HTMLElement;
  const overlayText = overlay.querySelector('p') as HTMLElement;

  startBtn.addEventListener('click', () => callbacks.onStartWave());
  (overlay.querySelector('.hud-restart') as HTMLButtonElement).addEventListener('click', () =>
    callbacks.onRestart(),
  );

  let lastMoney = Number.NaN;
  let lastLives = Number.NaN;
  let lastWave = '';
  let lastStartVisible: boolean | null = null;
  let lastOverlay = '';

  return {
    update(world: World) {
      if (world.money !== lastMoney) {
        lastMoney = world.money;
        moneyEl.textContent = `$${world.money}`;
      }
      if (world.lives !== lastLives) {
        lastLives = world.lives;
        livesEl.textContent = `Lives ${world.lives}`;
      }

      const waveLabel = waveLabelText(world);
      if (waveLabel !== lastWave) {
        lastWave = waveLabel;
        waveEl.textContent = waveLabel;
      }

      const startVisible = world.state === 'running' && world.wavePhase === 'awaiting-start';
      if (startVisible !== lastStartVisible) {
        lastStartVisible = startVisible;
        startBtn.classList.toggle('hidden', !startVisible);
      }

      const overlayState = world.state === 'running' ? '' : world.state;
      if (overlayState !== lastOverlay) {
        lastOverlay = overlayState;
        overlay.classList.toggle('hidden', overlayState === '');
        if (overlayState === 'lost') {
          overlayTitle.textContent = 'Defeat';
          overlayTitle.style.color = '#ff8787';
          overlayText.textContent = 'The horde broke through.';
        } else if (overlayState === 'victory') {
          overlayTitle.textContent = 'Victory!';
          overlayTitle.style.color = '#8ce99a';
          overlayText.textContent = 'All waves cleared.';
        }
      }
    },
  };
}

function waveLabelText(world: World): string {
  const total = getBalance().waves.length;
  switch (world.wavePhase) {
    case 'awaiting-start':
      return `Wave 1/${total}`;
    case 'active':
      return `Wave ${world.currentWaveIndex + 1}/${total}`;
    case 'intermission': {
      const seconds = Math.max(1, Math.ceil(world.ticksToNextWave / TICK_RATE_HZ));
      return `Wave ${world.currentWaveIndex + 1}/${total} · next in ${seconds}s`;
    }
    case 'complete':
      return 'Campaign complete';
  }
}
