import { Application, Graphics, Text } from 'pixi.js';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

const BACKGROUND = '#101018';
const HEX_FILL = 0x2f9e63;
const HEX_STROKE = 0x7ee2a8;
const TITLE_COLOR = '#e8ecf1';

export async function bootRenderer(host: HTMLElement): Promise<Application> {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    background: BACKGROUND,
    antialias: true,
  });
  host.appendChild(app.canvas);

  drawPlaceholderFrame(app);
  return app;
}

function drawPlaceholderFrame(app: Application): void {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;

  const hex = new Graphics();
  hex.poly(pointyTopHexagon(cx, cy, 140)).fill(HEX_FILL).stroke({ width: 3, color: HEX_STROKE });
  app.stage.addChild(hex);

  const title = new Text({
    text: 'xp-pixi',
    style: { fontFamily: 'monospace', fontSize: 32, fill: TITLE_COLOR },
  });
  title.anchor.set(0.5);
  title.position.set(cx, cy);
  app.stage.addChild(title);
}

function pointyTopHexagon(cx: number, cy: number, size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i - 90) * Math.PI) / 180;
    points.push(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
  }
  return points;
}
