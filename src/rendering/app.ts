import { Application } from 'pixi.js';

const BACKGROUND = '#101018';

export interface BootResult {
  app: Application;
  /** Positioned wrapper around the canvas; HUD layers attach here. */
  root: HTMLDivElement;
}

export async function bootRenderer(host: HTMLElement, widthPx: number, heightPx: number): Promise<BootResult> {
  const app = new Application();
  await app.init({
    width: widthPx,
    height: heightPx,
    background: BACKGROUND,
    antialias: true,
  });

  const root = document.createElement('div');
  root.className = 'game-root';
  root.appendChild(app.canvas);
  host.appendChild(root);

  return { app, root };
}
