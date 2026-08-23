# xp-pixi

Hex-grid tower defense prototype built on Vite + TypeScript + PixiJS.
Simulation logic is pure, headless-testable TypeScript (`src/simulation/`); all
pixel work lives in `src/rendering/`; balance/tuning data lives in `src/data/`.

## Setup

```sh
npm install
```

## Develop

```sh
npm run dev
```

Starts the dev server (default http://localhost:5173). HMR applies code edits
live; balance data edits hot-apply to a running game without losing state.

## Test & quality gates

```sh
npm test           # headless unit tests (simulation runs in bare Node)
npm run typecheck
npm run lint
```

Lint enforces the simulation purity rule: modules under `src/simulation/`
may not import PixiJS or touch DOM globals.

## Production build

```sh
npm run build                        # base path '/'
CDN_BASE=/xp-pixi/ npm run build     # subpath deploy (e.g. GitHub Pages)
npm run preview                      # serve dist/ locally (--strictPort)
```

The output in `dist/` is fully static and self-contained.

## Deploy

On push to `main`, GitHub Actions runs the quality gates, builds with
`CDN_BASE=/<repo-name>/`, and deploys to GitHub Pages (workflow:
`.github/workflows/deploy.yml`). Requires the repo's Pages source set to
"GitHub Actions" (one-time setting). Rollback: re-run a previous successful
deploy workflow run.

## Controls

- Click an unoccupied buildable tile to place a tower (costs money).
- Press **Start wave** to begin the first wave; later waves start automatically.
- Enemies march from spawn to goal; each leak costs a life. Lose all lives and
  the run ends — survive all seven waves to win.
