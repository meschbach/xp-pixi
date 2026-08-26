import { Application } from 'pixi.js';

const BACKGROUND = '#101018';

export interface BootResult {
  app: Application;
  root: HTMLDivElement;
}

export async function bootRenderer(host: HTMLElement, viewportWidth: number, viewportHeight: number): Promise<BootResult> {
  const app = new Application();
  await app.init({
    width: viewportWidth,
    height: viewportHeight,
    background: BACKGROUND,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });

  const root = document.createElement('div');
  root.className = 'game-root';
  root.appendChild(app.canvas);
  host.appendChild(root);

  return { app, root };
}
