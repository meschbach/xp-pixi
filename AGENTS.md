# AGENTS.md

Guidance for AI agents working in this repo.

## Project

A Pixi.js tower-defense game. Vite + TypeScript + Vitest + ESLint. The repo is organized around an OpenSpec change
workflow (`openspec/`).

## Commands

- `npm run typecheck` — TypeScript check
- `npm run lint` — ESLint
- `npm test` — Vitest (run `npx vitest <file>` or `npm test -- <path>` to target a file)
- `npm run cvd-check` — color-vision-deficiency gate over the reserved/accent palettes (run after any color change)
- `npm run dev` — Vite dev server (HMR)
- `npm run build` — production build

Always run `typecheck`, `lint`, and `test` before considering work complete.

## Architecture

- `src/simulation/` — pure TypeScript, zero rendering/DOM imports. **Lint-enforced and must stay pure.** All gameplay
  logic lives here. The only way world state changes is `tick()`, a player command, or an ack cursor; rendering never
  mutates the world.
- `src/rendering/` — Pixi.js presentation. Reads simulation state; never advances it.
- `src/data/` — authored balance data (tower/enemy/wave definitions).
- Rendering polls a fixed-rate sim every frame from an accumulator loop in `src/main.ts`.

Conventions to preserve:
- Simulation modules must not import pixi/DOM/types — keep `src/simulation` headless-testable.
- When changing the sim, keep tests for it in `src/simulation/*.test.ts` green.
- Rendering logic that needs tests should be extracted into pure helpers (does not touch pixi).

## Visual language

Read `docs/visual-language.md`. Color is never a load-bearing channel for information a player must read; identity
rides pattern + glyph + luminance. Do not introduce palette collisions without checking the CVD gate there (run
`npm run cvd-check` after any color change).

## OpenSpec

Changes live in `openspec/changes/<name>/` with `proposal.md`, `design.md`, `tasks.md`, and `specs/`. Use the
`openspec-*` skills to create, implement, and archive changes. The `tower-target-visuals` change is the current active
work.
