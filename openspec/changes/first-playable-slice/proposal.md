# Proposal: First Playable Slice

## Why

The project is greenfield: no code, no toolchain, no deploy path. Before deeper game development can proceed, we need (
a) the foundational decisions made during exploration turned into a working skeleton — Vite + TypeScript + PixiJS, a
simulation/rendering architectural split, static CDN-style deploys via GitHub Pages — and (b) proof that the whole
pipeline works end-to-end in the form of a small but genuinely playable tower defense slice: hex map, enemies that march
and leak, one tower type that shoots them, and an economy that gates building.

## What Changes

- Introduce the project skeleton: Vite + TypeScript + PixiJS with a strict `simulation/` vs `rendering/` source split (
  simulation is pure, headless-testable logic with zero Pixi/geometry dependencies).
- Establish the dev experience: instant Vite dev server, HMR for code, and live hot-apply of balance/tuning data (tower
  stats, wave definitions) without losing the running game state.
- Establish static deployment: `vite build` produces a fully self-contained `dist/` deployable to any static host;
  GitHub Actions workflow deploys to GitHub Pages on pushes to main, with the CDN/base URL driven by env config so
  migration to an external CDN later is a config flip.
- Implement the hex map capability: map modeled in the simulation purely as a cell graph (adjacency, hop distances);
  rendering owns all axial→pixel conversion (orientation pinned pointy-top), tile drawing, and click picking.
- Implement the first playable game loop: scripted wave definitions spawning enemies at a spawn cell, enemies path
  toward a goal cell, a single tower type placeable on buildable tiles with path-aware range (coverage reaches only
  along open-cell routes), money earned per kill and spent per placement, a finite seven-wave campaign ending in a
  victory state, and a loss condition when too many enemies leak.
- Add headless unit tests for the simulation layer (pathfinding, targeting, economy) runnable in Node without a browser.

## Capabilities

### New Capabilities

- `project-toolchain`: Build/dev toolchain and source conventions — Vite+TS+Pixi scaffold, simulation/rendering
  separation rules, dev server behavior including HMR semantics and hot-applied tuning data (tuning hot-reload owned
  here as dev-workflow behavior).
- `static-deployment`: Production build and release — fully static CDN-ready output, configurable base path, GitHub
  Pages deployment via GitHub Actions.
- `hex-map`: Hexagonal game board — cell-graph model in simulation space, hex rendering, coordinate mapping, and click
  picking.
- `enemy-waves`: Wave system — declarative wave definitions, timed spawning, graph-space pathing/movement, and goal-leak
  handling (player lives tracked here because they couple to leak events).
- `towers-combat`: Towers, combat, and economy — placement on buildable unoccupied tiles, path-aware target acquisition,
  damage/kill resolution, kill rewards, placement costs, and loss condition (money/economy tracked here because payouts
  couple to combat outcomes).

### Modified Capabilities

(none — greenfield)

## Impact

- **New files/systems**: entire repository scaffolding (`package.json`, `vite.config.ts`, `tsconfig.json`,
  `src/simulation/`, `src/rendering/`, `src/data/`, tests).
- **Dependencies added**: `pixi.js`, `typescript`, `vite`, a Node test runner (Vitest) for headless sim tests.
- **CI/CD**: new GitHub Actions workflow (`.github/workflows/deploy.yml`) using `actions/upload-pages-artifact` +
  `actions/deploy-pages`; requires repo Pages setting switched to "GitHub Actions" source.
- **Deployment target**: `https://<user>.github.io/xp-pixi/` — Vite `base` must be derived from `CDN_BASE` env var;
  local dev unaffected.
- **Out of scope** (deferred): multiple tower types, upgrades, multiple maps, enemy collision/separation, pause or speed
  controls, audio, save/persistence, custom domain/CDN bucket, versioned-deploy pointer scheme, visual polish beyond
  functional sprites/shapes, window-resize/responsive canvas handling (fixed-size canvas; dimensions tunable later).
