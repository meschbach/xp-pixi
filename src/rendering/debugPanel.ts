import type { BuildSheet } from './buildSheet';

export interface DebugLogger {
  log(msg: string): void;
  error(msg: string, err?: unknown): void;
  setField(key: string, value: string): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
}

export function createDebugPanel(root: HTMLElement, buildSheet: BuildSheet): DebugLogger {
  console.log(`[${Date.now()}] createDebugPanel called, root has ${root.children.length} children`);
  const el = document.createElement('div');
  el.className = 'hud-debug hidden';
  el.innerHTML = `
    <div class="hud-debug-fields">
      <span class="hud-debug-field-label">ptr:</span>
      <span class="hud-debug-field-value" data-field="ptr">-</span>
      <span class="hud-debug-field-label">gesture:</span>
      <span class="hud-debug-field-value" data-field="gesture">-</span>
      <span class="hud-debug-field-label">cell:</span>
      <span class="hud-debug-field-value" data-field="cell">-</span>
      <span class="hud-debug-field-label">sel:</span>
      <span class="hud-debug-field-value" data-field="sel">-</span>
      <span class="hud-debug-field-label">sheet:</span>
      <span class="hud-debug-field-value" data-field="sheet">-</span>
      <span class="hud-debug-field-label">world:</span>
      <span class="hud-debug-field-value" data-field="world">-</span>
      <span class="hud-debug-field-label">phase:</span>
      <span class="hud-debug-field-value" data-field="phase">-</span>
      <span class="hud-debug-field-label">$:</span>
      <span class="hud-debug-field-value" data-field="$">-</span>
    </div>
    <div class="hud-debug-log"></div>
    <div class="hud-debug-buttons">
      <button class="hud-debug-btn" data-action="show-sheet">Show Sheet</button>
      <button class="hud-debug-btn" data-action="clear">Clear</button>
    </div>
  `;
  root.appendChild(el);
  console.log(`[${Date.now()}] debugPanel appended to root, root now has ${root.children.length} children`);

  const logEl = el.querySelector('.hud-debug-log') as HTMLElement;
  const fields = new Map<string, HTMLElement>();
  el.querySelectorAll('[data-field]').forEach((node) => {
    const key = (node as HTMLElement).dataset.field!;
    fields.set(key, node as HTMLElement);
  });

  el.querySelector('[data-action="show-sheet"]')?.addEventListener('click', () => {
    buildSheet.showBuild();
  });

  el.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    logEl.innerHTML = '';
  });

  const MAX_ENTRIES = 10;

  function timestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  function addEntry(msg: string, isError: boolean): void {
    const entry = document.createElement('div');
    entry.className = `hud-debug-entry${isError ? ' error' : ''}`;
    entry.textContent = `[${timestamp()}] ${msg}`;
    logEl.appendChild(entry);
    while (logEl.children.length > MAX_ENTRIES) {
      logEl.removeChild(logEl.firstChild!);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  return {
    log(msg: string) {
      addEntry(msg, false);
    },
    error(msg: string, err?: unknown) {
      const detail = err instanceof Error ? err.message : err ? String(err) : '';
      addEntry(detail ? `${msg}: ${detail}` : msg, true);
    },
    setField(key: string, value: string) {
      const field = fields.get(key);
      if (field) {
        field.textContent = value;
      }
    },
    show() {
      el.classList.remove('hidden');
    },
    hide() {
      el.classList.add('hidden');
    },
    isVisible() {
      return !el.classList.contains('hidden');
    },
  };
}
