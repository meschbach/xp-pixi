import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHud } from './hud';
import { createBuildSheet } from './buildSheet';
import type { World } from '../simulation/world';

describe('hud', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('DOM structure', () => {
    it('creates HUD elements without clobbering existing children', () => {
      const existingChild = document.createElement('div');
      existingChild.className = 'existing-child';
      root.appendChild(existingChild);

      createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');

      expect(root.querySelector('.existing-child')).toBeInTheDocument();
      expect(root.querySelector('.hud-container')).toBeInTheDocument();
      expect(root.querySelector('.hud-stats')).toBeInTheDocument();
      expect(root.querySelector('.hud-money')).toBeInTheDocument();
      expect(root.querySelector('.hud-lives')).toBeInTheDocument();
      expect(root.querySelector('.hud-wave')).toBeInTheDocument();
    });

    it('does not clobber build sheet appended before HUD creation', () => {
      const buildSheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');

      expect(root.querySelector('.build-sheet')).toBeInTheDocument();
      expect(buildSheet.isVisible()).toBe(false);

      buildSheet.showBuild();
      expect(buildSheet.isVisible()).toBe(true);
    });

  });

  describe('HUD functionality', () => {
    it('updates money display', () => {
      const hud = createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');
      const mockWorld = { money: 100, lives: 10, state: 'running', wavePhase: 'awaiting-start' } as unknown as World;

      hud.update(mockWorld);

      expect(root.querySelector('.hud-money')?.textContent).toBe('$100');
    });

    it('updates lives display', () => {
      const hud = createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');
      const mockWorld = { money: 100, lives: 5, state: 'running', wavePhase: 'awaiting-start' } as unknown as World;

      hud.update(mockWorld);

      expect(root.querySelector('.hud-lives')?.textContent).toBe('Lives 5');
    });

    it('shows start button when wave is awaiting start', () => {
      const hud = createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');
      const mockWorld = { money: 100, lives: 10, state: 'running', wavePhase: 'awaiting-start' } as unknown as World;

      hud.update(mockWorld);

      const startBtn = root.querySelector('.hud-start') as HTMLButtonElement;
      expect(startBtn.classList.contains('hidden')).toBe(false);
    });

    it('hides start button when wave is active', () => {
      const hud = createHud(root, { onStartWave: vi.fn(), onRestart: vi.fn() }, () => 'mouse');
      const mockWorld = { money: 100, lives: 10, state: 'running', wavePhase: 'active', currentWaveIndex: 0 } as unknown as World;

      hud.update(mockWorld);

      const startBtn = root.querySelector('.hud-start') as HTMLButtonElement;
      expect(startBtn.classList.contains('hidden')).toBe(true);
    });
  });
});
