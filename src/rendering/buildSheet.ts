import { getDefaultTowerTypeId } from '../simulation/placement';
import { getBalance } from '../simulation/registry';
import { rejectionMessage } from './placementMessage';
import type { PlacementIssue } from '../simulation/placement';

export interface BuildSheet {
  showBuild(): void;
  showRejection(reason: PlacementIssue): void;
  hide(): void;
  isVisible(): boolean;
}

export interface BuildSheetCallbacks {
  onConfirm(): void;
  onClose(): void;
}

export function createBuildSheet(root: HTMLElement, callbacks: BuildSheetCallbacks): BuildSheet {
  const el = document.createElement('div');
  el.className = 'build-sheet hidden';
  el.innerHTML = `
    <div class="build-sheet-backdrop"></div>
    <div class="build-sheet-panel">
      <button class="build-sheet-close" type="button" aria-label="Close">&times;</button>
      <div class="build-sheet-title"></div>
      <button class="build-sheet-confirm" type="button">Build</button>
    </div>
  `;
  root.appendChild(el);

  const titleEl = el.querySelector('.build-sheet-title') as HTMLElement;
  const confirmBtn = el.querySelector('.build-sheet-confirm') as HTMLButtonElement;
  const closeBtn = el.querySelector('.build-sheet-close') as HTMLButtonElement;
  const backdrop = el.querySelector('.build-sheet-backdrop') as HTMLElement;

  let shownAt = 0;

  confirmBtn.addEventListener('click', () => {
    callbacks.onConfirm();
  });
  closeBtn.addEventListener('click', () => {
    callbacks.onClose();
  });
  backdrop.addEventListener('click', () => {
    // Ignore clicks that happen too soon after showing (prevents the initial tap from closing)
    if (performance.now() - shownAt < 200) return;
    callbacks.onClose();
  });

  return {
    showBuild() {
      const def = getBalance().towers.get(getDefaultTowerTypeId());
      const cost = def?.cost ?? '?';
      titleEl.textContent = `Build Turret $${cost}`;
      confirmBtn.textContent = 'Build';
      confirmBtn.disabled = false;
      el.classList.remove('hidden');
      shownAt = performance.now();
    },
    showRejection(reason: PlacementIssue) {
      titleEl.textContent = rejectionMessage(reason);
      confirmBtn.textContent = 'OK';
      confirmBtn.disabled = true;
      el.classList.remove('hidden');
      shownAt = performance.now();
    },
    hide() {
      el.classList.add('hidden');
    },
    isVisible() {
      return !el.classList.contains('hidden');
    },
  };
}
