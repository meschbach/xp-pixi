import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { createBuildSheet } from './buildSheet';

describe('buildSheet', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('DOM structure', () => {
    it('creates correct DOM structure', () => {
      createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      expect(root.querySelector('.build-sheet')).toBeInTheDocument();
      expect(root.querySelector('.build-sheet-backdrop')).toBeInTheDocument();
      expect(root.querySelector('.build-sheet-panel')).toBeInTheDocument();
      expect(root.querySelector('.build-sheet-close')).toBeInTheDocument();
      expect(root.querySelector('.build-sheet-title')).toBeInTheDocument();
      expect(root.querySelector('.build-sheet-confirm')).toBeInTheDocument();
    });

    it('starts hidden', () => {
      createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      const el = root.querySelector('.build-sheet');
      expect(el?.classList.contains('hidden')).toBe(true);
    });

    it('has close button with aria-label', () => {
      createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      const closeBtn = screen.getByLabelText('Close');
      expect(closeBtn).toBeInTheDocument();
    });

    it('has confirm button with Build text', () => {
      createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      const confirmBtn = screen.getByRole('button', { name: 'Build' });
      expect(confirmBtn).toBeInTheDocument();
    });
  });

  describe('visibility', () => {
    it('showBuild removes hidden class', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showBuild();

      const el = root.querySelector('.build-sheet');
      expect(el?.classList.contains('hidden')).toBe(false);
    });

    it('showBuild sets title with cost', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showBuild();

      expect(screen.getByText('Build Turret $50')).toBeInTheDocument();
    });

    it('showBuild enables confirm button', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showBuild();

      const confirmBtn = screen.getByRole('button', { name: 'Build' });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('showRejection removes hidden class', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showRejection('unaffordable');

      const el = root.querySelector('.build-sheet');
      expect(el?.classList.contains('hidden')).toBe(false);
    });

    it('showRejection disables confirm button and changes text to OK', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showRejection('unaffordable');

      const confirmBtn = screen.getByRole('button', { name: 'OK' });
      expect(confirmBtn).toBeDisabled();
    });

    it('hide adds hidden class', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });
      sheet.showBuild();

      sheet.hide();

      const el = root.querySelector('.build-sheet');
      expect(el?.classList.contains('hidden')).toBe(true);
    });

    it('isVisible returns false when hidden', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      expect(sheet.isVisible()).toBe(false);
    });

    it('isVisible returns true when visible', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });
      sheet.showBuild();

      expect(sheet.isVisible()).toBe(true);
    });
  });

  describe('event handlers', () => {
    it('clicking confirm button calls onConfirm callback', async () => {
      const onConfirm = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm, onClose: vi.fn() });
      sheet.showBuild();

      const confirmBtn = screen.getByRole('button', { name: 'Build' });
      await userEvent.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it('clicking close button calls onClose callback', async () => {
      const onClose = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose });
      sheet.showBuild();

      const closeBtn = screen.getByLabelText('Close');
      await userEvent.click(closeBtn);

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('clicking backdrop calls onClose callback', async () => {
      const onClose = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose });
      sheet.showBuild();

      // Wait for the timing guard to expire
      await new Promise(resolve => setTimeout(resolve, 250));

      const backdrop = root.querySelector('.build-sheet-backdrop') as HTMLElement;
      await userEvent.click(backdrop);

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('clicking backdrop immediately after showBuild does NOT call onClose', async () => {
      const onClose = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose });
      sheet.showBuild();

      // Click backdrop immediately (within the 200ms guard period)
      const backdrop = root.querySelector('.build-sheet-backdrop') as HTMLElement;
      await userEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('clicking backdrop immediately after showRejection does NOT call onClose', async () => {
      const onClose = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose });
      sheet.showRejection('unaffordable');

      // Click backdrop immediately (within the 200ms guard period)
      const backdrop = root.querySelector('.build-sheet-backdrop') as HTMLElement;
      await userEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();
    });

    it('timing guard resets when sheet is shown again', async () => {
      const onClose = vi.fn();
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose });

      // First show
      sheet.showBuild();
      await new Promise(resolve => setTimeout(resolve, 250));

      // Hide and show again
      sheet.hide();
      sheet.showBuild();

      // Click backdrop immediately after second show
      const backdrop = root.querySelector('.build-sheet-backdrop') as HTMLElement;
      await userEvent.click(backdrop);

      // Should NOT close because timing guard reset
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('can show/hide multiple times', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showBuild();
      expect(sheet.isVisible()).toBe(true);

      sheet.hide();
      expect(sheet.isVisible()).toBe(false);

      sheet.showBuild();
      expect(sheet.isVisible()).toBe(true);
    });

    it('can switch between build and rejection', () => {
      const sheet = createBuildSheet(root, { onConfirm: vi.fn(), onClose: vi.fn() });

      sheet.showBuild();
      expect(screen.getByText('Build Turret $50')).toBeInTheDocument();

      sheet.showRejection('unaffordable');
      expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();

      sheet.showBuild();
      expect(screen.getByText('Build Turret $50')).toBeInTheDocument();
    });
  });
});
