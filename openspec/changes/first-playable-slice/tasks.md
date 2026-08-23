# Tasks: First Playable Slice

## 1. Toolchain scaffold

- [x] 1.1 Initialize project: `package.json`, `tsconfig.json`, Vite config with `base` from `CDN_BASE` env (default
  `/`), install `pixi.js`, `typescript`, `vite`, `vitest`
- [x] 1.2 Create source layout: `src/simulation/`, `src/rendering/`, `src/data/`; add ESLint (incl. typescript-eslint)
  with `no-restricted-imports` rule forbidding `pixi.js`/DOM imports under `src/simulation/**` plus
  `no-restricted-globals` banning DOM globals (`window`, `document`, `navigator`, …) in the same scope
- [x] 1.3 Add npm scripts: `dev`, `build`, `preview`, `test`, `typecheck`, `lint`; verify all run
- [x] 1.4 Minimal boot: Pixi app initializes in `rendering/`, renders a placeholder frame into `index.html`; dev server
  shows it live
- [x] 1.5 Add `.gitignore` (`node_modules/`, `dist/`) and a README with setup/dev/test/build/deploy instructions and a
  basic controls blurb

## 2. Simulation core (headless)

- [ ] 2.1 Implement axial hex math module (`simulation/hex.ts`): neighbor offsets, hex distance, cube rounding — pure,
  no pixels; unit tests for each function
- [ ] 2.2 Implement cell-graph map model: cells, six-way adjacency from dimensions, buildable/blocked flags, spawn/goal
  cells; unit tests for interior/edge neighbor counts on a small fixture graph
- [ ] 2.3 Implement distance-field computation (BFS from goal over unblocked cells) and recompute-on-blocked-change;
  unit tests incl. blocked rerouting
- [ ] 2.4 Implement fixed-timestep world loop (30 Hz accumulator): `tick()` advances enemies modeled as
  `(fromCell, toCell, progress)` moving continuously along hops — logical cell stays `fromCell` until arrival, committed
  hops finish even if the field changes mid-step, descent re-evaluated on arrival — with deterministic axial-order
  tie-breaks; unit tests: enemy traverses D hops in ~D/S ticks, never enters blocked cells, holds position when sealed
  off with no lower-distance unblocked neighbor
- [ ] 2.5 Implement economy + lives state: money, kill rewards, placement costs, lives, loss condition; unit tests for
  each transition

## 3. Waves and combat systems

- [ ] 3.1 Define balance data modules in `src/data/` (human-friendly units: seconds for cooldowns/durations, hops for
  range, cells/sec for speed — converted at the registry boundary against the fixed tick rate): tower stats (cost, range
  hops, damage, cooldown), stats for two enemy types (hp, speed, kill reward — e.g., baseline and fast), seven wave
  definitions authored as lists of spawn groups (type, count, interval — mixed-type waves allowed) plus an inter-wave
  delay, starting resources (money ~100, lives 10), slice map layout (~11×11 hex rhombus, spawn/goal reachable); typed
  exports with seeded defaults for live tuning
- [ ] 3.2 Implement wave spawner driven by data definitions (seven waves in data): timed spawns per wave, wave-clear
  detection (cleared = spawn queue exhausted AND no live enemies from the wave), auto-start next wave after delay, first
  wave player-triggered, final-wave clear transitions to victory state; unit tests against fake timers incl. kills
  outrunning the spawner
- [ ] 3.3 Implement coverage computation (BFS ≤ R hops through unblocked cells per tower) and targeting:
  nearest-to-goal-by-distance-field among covered enemies (ties by acquisition order), retargeting on
  movement/death/board-change; unit tests incl. wall-shadow exclusion, tie determinism, and target-drop on placement
- [ ] 3.4 Implement damage/cooldown/kill pipeline wired to economy rewards (damage lands on the attack tick; projectiles
  visual-only; cooldowns tower-local and target-independent — retargeting never resets the timer); unit tests: kill
  removes enemy and credits money
- [ ] 3.5 Implement placement validation in sim: buildable + unoccupied by tower OR level marker (spawn/goal) +
  affordable, reachability rejection (spawn→goal stays solvable, and while enemies are alive no living enemy's cell may
  lose finite distance-to-goal), apply blocking and recompute distance field plus all towers' coverage; unit tests for
  accept/reject paths incl. stranding prevention

## 4. Rendering and input

- [ ] 4.1 Hex layout renderer: pointy-top tiles from map model, role-based colors (spawn/goal/buildable/blocked/tower),
  redraw on world changes; canvas sized once at load to fit the slice map (fixed size, no resize handling this slice)
- [ ] 4.2 Entity visuals: two type-distinct enemy circles (size/color by type) with hp hint, towers (triangles),
  projectiles or hit flashes on attack (visual only), true coverage-region tint for placed/selected towers (flood-fill
  shape, never nominal circles)
- [ ] 4.3 Click picking: pixel→axial conversion + cube rounding; selection highlight of hovered/clicked cell
- [ ] 4.4 Placement UX: hover preview showing would-be coverage and validity before commit; click unoccupied buildable
  tile to place if affordable; rejected placements give visible feedback (no charge)
- [ ] 4.5 HUD: money, lives, current wave; game-over and victory overlays with restart button resetting the world to its
  initial state; "Start wave" control for first wave
- [ ] 4.6 Wire sim↔render loop: render reads World each animation frame; input dispatches intents into simulation

## 5. Dev experience (HMR/tuning)

- [ ] 5.1 Verify Vite HMR on rendering modules updates the running session
- [ ] 5.2 Implement tuning hot-apply with explicit `import.meta.hot.accept` boundaries: self-accepting data modules push
  snapshots into a registry whose apply step performs human→tick-rate unit conversion and invalidates derived state (
  range edits recompute all towers' coverage; distance field untouched), so edits to tower/wave values take effect on
  the running game with no full page reload; map modules are excluded from live hot-apply and take effect on the next
  run; manually verify mid-run retune (assert no reload occurs)
- [ ] 5.3 Add `import.meta.hot.dispose` carry-over for the `World` instance where safe, riding on the same accept
  boundaries; confirm fallback full reload otherwise

## 6. Deployment pipeline

- [ ] 6.1 Add GitHub Actions workflow: on PR → typecheck+lint+test+build; on push main → gates + build with `CDN_BASE`
  derived from the repository name (`github.event.repository.name`, so renames/forks don't silently break) +
  upload-pages-artifact + deploy-pages
- [ ] 6.2 Enable GitHub Pages with "GitHub Actions" source (repo settings, one-time manual step) and verify first deploy
  serves at the project Pages URL
- [ ] 6.3 Validate local production parity: build with non-root `CDN_BASE`, run `vite preview`, confirm game loads at
  subpath

## 7. Slice integration pass

- [ ] 7.1 End-to-end playthrough on deployed site: start wave, build towers, route enemies around maze, earn/spend
  money, leak a life deliberately, trigger loss + restart, then clear all seven waves to reach the victory screen +
  restart
- [ ] 7.2 Confirm lint/typecheck/test green locally and in CI; sim purity rule verified by intentional violation check
