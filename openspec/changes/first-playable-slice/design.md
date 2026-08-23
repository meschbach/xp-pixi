# Design: First Playable Slice

## Context

Greenfield repository. Exploration settled the major directions: Vite + TypeScript + PixiJS; everything served
statically (GitHub Pages now, external CDN bucket later); strict simulation/rendering split with the simulation
operating in pure graph space; hex lattice chosen over 8-way square grids (uniform edge distances, no corner-cutting
ambiguity); live tuning-data hot reload during development; headless-testable game logic.

This design turns those directions into concrete technical decisions for the first playable slice.

## Goals / Non-Goals

**Goals:**

- Working end-to-end pipeline: edit → dev server → commit → CI → live on GitHub Pages.
- First playable: hex map, spawn→goal enemy flow, one tower type, money, loss condition.
- Simulation layer runs and passes tests in bare Node (no DOM/WebGL).
- Balance numbers editable mid-run without restarting the game.
- Deployment that never assumes a server runtime beyond static files.

**Non-Goals:**

- Multiple tower types, upgrades, multiple maps, audio, persistence, save games.
- Enemy collision/separation (enemies may overlap on a cell in this slice).
- Pause or game-speed controls.
- Window-resize / responsive layout handling: the canvas is fixed-size, dimensioned once at load to fit the slice map;
  exact size is a tunable constant, revisited later.
- Custom domain / external CDN bucket / versioned-deploy pointer scheme (config made ready, migration deferred).
- Sprite-atlas asset pipeline (slice renders with Pixi `Graphics` primitives; real art pipeline is a follow-up change).
- Render interpolation/smoothing beyond direct state readout; deterministic lockstep networking.

## Decisions

### D1 — Toolchain: Vite + TypeScript + PixiJS

Vite dev server (native ESM, instant HMR) plus `vite build` producing a hashed, static `dist/`. Rejected: Webpack (
legacy weight, no gain), esbuild-direct (rebuilds dev-server ergonomics by hand), no-build/import-maps (doesn't scale to
TS + deps + asset hashing). Tests run on Vitest (TS-native, Vite-aligned).

### D2 — Simulation/rendering split, enforced structurally

`src/simulation/` contains all game logic and may not import Pixi or anything DOM/geometry-related. Enforced with an
ESLint `no-restricted-imports` rule scoped to `src/simulation/**`, not just convention. Rendering owns pixels;
simulation owns rules. Communication: simulation exposes a plain mutable `World` state object; rendering reads it every
frame.

```
┌───────────────────────────────┐      ┌─────────────────────────┐
│ src/simulation/               │      │ src/rendering/          │
│  world · pathing · combat     │◄─────│  pixi app · hex layout  │
│  economy · waves              │state │  sprites · input        │
│  (pure TS, node-testable)     │─────►│  (all pixel math here)  │
└───────────────▲───────────────┘      └─────────────────────────┘
                │ intents (place tower, start wave)
        ┌───────┴────────┐
        │ src/data/      │  plain balance modules: towers.ts,
        └────────────────┘  waves.ts, maps/*.ts — HMR-friendly
```

### D3 — Hex lattice in graph space; axial coordinates

Simulation models the map as a cell graph: `cells`, `adjacency(cell)`, `buildable(cell)`, plus spawn and goal placed by
the level instance as occupants of ordinary tiles — no special-cased cell types. All edges cost 1 hop; enemy speed is
cells/sec; tower range is a hop count through open cells (D9) — the simulation runs on a single distance currency.
Hex-specific integer math (axial coords, neighbor offsets, hex distance, cube rounding) lives in a shared pure module (
`simulation/hex.ts`) — it uses no pixel values. Pixel layout conversion (`axialToPixel`, `pixelToAxial`) lives in
rendering. Orientation: **pointy-top**, offset rows for visual authoring, axial internally.

Chosen over 8-way squares because: uniform step length keeps sim time honest (no √2 diagonal weighting), no
corner-cutting rules needed, and range semantics stay lattice-native (D9's coverage regions map cleanly onto hex
adjacency). Swapping lattices later touches only map authoring + rendering.

### D4 — Dynamic pathing via distance field, recomputed on build

Tiles become blocked by **occupancy, uniformly and without special-cased cell types**: a placed tower consumes its tile,
and the level instance consumes tiles for its spawn/goal markers; building requires a buildable *and unoccupied* tile (
classic maze-building TD). At map load, compute a BFS/Dijkstra distance-from-goal field over the cell graph. Enemies at
any cell simply step to the neighbor with the lowest distance value — O(1) per move, no per-enemy A*. Placing a tower
updates blocked set and recomputes the field; placement is **rejected** (with feedback, no charge) if it would leave the
goal unreachable from spawn — and, while any enemy is alive, if it would leave any living enemy's cell without a finite
distance-to-goal. Without a sell/remove mechanic this slice, a stranded enemy would soft-lock the campaign permanently,
so stranding is prevented outright; between waves only the spawn→goal rule constrains building. This exercises exactly
why graph-space sim pays off, and is trivially unit-testable.

### D5 — Balance data as plain modules; layered hot-reload strategy

Tower stats, wave definitions, and maps live in `src/data/` as plain typed objects (no classes). Feedback loop per file
type:

| Edited                                      | Behavior                                                                                                                           |
|---------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `data/towers.ts`, `data/waves.ts` (balance) | Hot-apply to running game via the registry: next spawn/purchase uses new numbers, derived state invalidated (below); run continues |
| `data/maps/*.ts` (layout)                   | Not hot-applied — a swapped layout cannot reconcile with in-flight world state; takes effect on the next run (restart/new game)    |
| `simulation                                 | rendering/*` code                                                                                                                  | Vite HMR; `World` instance survives via `import.meta.hot.dispose` carry-over where safe, else full page reload |
| art/primitives config                       | Full page reload (acceptable until real asset pipeline exists)                                                                     |

Mechanism: Vite hot-applies an update only if some module up the importer chain registers `import.meta.hot.accept`;
otherwise it falls back to a **full page reload**, destroying the run. Data modules therefore self-accept (
`import.meta.hot.accept`) and push their snapshot into a tiny mutable registry that the game loop reads via indirect
accessors each tick. Code-HMR state carry-over (dispose guards, below) rides on these same accept boundaries.

The registry is the single unit-conversion boundary: raw human-friendly values enter only via its apply step, which
converts against the fixed tick rate before publishing (accessors never see raw data). A hot-apply acts as a
pseudo-board-change for derived state: range edits recompute every tower's coverage; the distance field is untouched (
cost/damage/cooldown/range do not affect pathing).

### D6 — Fixed-timestep simulation

Logic advances in fixed ticks (30 Hz accumulator pattern); rendering draws current `World` state each animation frame.
Keeps sim independent of frame rate, makes headless tests trivial (`world.tick()` N times), and leaves the door open for
replays/determinism work later. Data-layer units stay human-friendly — seconds for cooldowns/durations, hops for range,
cells/sec for speed — converted at the data-registry boundary — on initial load and on every hot-apply alike — so
balance files read naturally while sim math stays deterministic. Enemy motion is continuous along hops: each enemy
carries `(fromCell, toCell, progress ∈ [0,1])`; its logical cell — the one targeting, coverage, and leak detection
consult — stays `fromCell` until the hop completes. A distance-field change mid-step never aborts a committed hop;
descent is re-evaluated on arrival. Rendering lerps pixels from `progress`, which is plain state readout rather than
interpolation machinery.

### D7 — Static deployment; env-driven base URL

`vite build` output is fully self-contained. Base URL comes from `CDN_BASE` env var (
`base: process.env.CDN_BASE ?? '/'`). GitHub Actions workflow on push to `main`: install → typecheck → unit tests →
build with `CDN_BASE=/<repo>/` → `upload-pages-artifact` → `deploy-pages`. Repo Pages setting must be switched to "
GitHub Actions" source (one-time manual step). `vite preview --strictPort` used locally to validate production output
before pushing. Rollback = redeploy a previous successful workflow run; versioned-deploy pointer scheme deferred until
own-bucket migration.

### D8 — Slice visuals: Pixi `Graphics` primitives

Hex tiles as flat-shaded polygons (distinct colors for buildable/blocked/spawn/goal/tower-occupied), enemies as
type-distinguishable circles — the slice ships two enemy types (e.g., baseline and fast), differing in size/color and
stats — towers as triangles, projectiles as dots. Projectiles are visual only; damage lands on the attack tick (see
`towers-combat`). Deliberately avoids pulling the sprite-atlas pipeline into this slice; the deployment capability is
still fully exercised (hashed JS/CSS bundles are the shipped assets).

### D9 — Path-aware tower range (single distance currency)

An enemy is attackable by a tower iff its current cell is reachable from the tower's cell within the tower's hop radius
R **through unblocked cells** (BFS over the same open-cell graph used by pathing). Chosen over geometric axial rings
because: it keeps one distance metric across movement, targeting priority, and range; it makes maze-building
two-dimensional (players shape *paths* and *fire corridors* — gaps become load-bearing); and placements shrinking
neighbors' coverage creates a cluster-vs-spread space economy. Consequences, all accepted:

- UI renders true coverage regions (flood-fill tint), never nominal circles; placement shows a coverage preview so
  shrinkage is visible before committing.
- Any blocked-set change recomputes all towers' coverage and drops now-unreachable targets (spec'd in `towers-combat`).
- Coverage shrinks monotonically as the board densifies — deliberate tension; revisit only if selling/upgrades ever
  arrive.
- Cost: one extra BFS per placement, same performance class as the existing distance-field recompute.
- Cooldowns are tower-local and target-independent: a tower fires whenever its cooldown has elapsed and a covered target
  exists; acquiring, switching, or dropping a target never resets the timer.

## Risks / Trade-offs

- [GH Pages subpath breaks asset URLs → blank page] → `CDN_BASE` is the single knob; CI builds with the correct value;
  `vite preview` locally reproduces prod paths pre-push.
- [HMR state carry-over has edge cases] → dispose-guard pattern with fallback to full reload; worst case is losing a run
  manually, never a broken dev server.
- [Blocking-path recompute allows pathological maps] → placement rejection covers both spawn→goal disconnection and
  stranding of live enemies (D4); wave difficulty tuned empirically in slice.
- [Sim determinism claims exceed reality] → fixed timestep + integer/graph math gets us close, but float positions along
  hops exist; determinism treated as aspiration this slice, not a guarantee.
- [Primitives-only visuals underwhelm] → accepted trade-off; asset pipeline is the immediate follow-up change and slots
  into `rendering/` without touching `simulation/`.
- [GH Pages cache behavior] → Fastly default caching (~10 min) on HTML is acceptable; hashed bundle filenames make
  long-lived caching automatic for JS/CSS.
- [Coverage shrinkage surprises players mid-game] → honest flood-fill rendering + placement-time coverage preview (D9);
  monotonic shrink accepted as deliberate space-economy tension.

## Migration Plan

1. Scaffold toolchain locally; dev server + tests green.
2. Enable GitHub Pages (Settings → Pages → Source: GitHub Actions).
3. Push scaffold with workflow; verify first automated deploy renders at `https://<user>.github.io/xp-pixi/`.
4. Iterate on gameplay behind the same pipeline.
   Rollback: re-run previous successful deploy workflow (Pages serves last successful artifact); forward-fix preferred.

## Open Questions

(none) — former open items resolved by policy: balance numbers and map dimensions are seeded with sensible defaults in
`src/data/` during task 3.1 (starting money ~100, tower cost ~50, starting lives 10, per-enemy-type kill rewards,
inter-wave delay, ~11×11 hex rhombus) and tuned live afterwards through the D5 hot-apply loop; waves are authored as
lists of spawn groups (type, count, interval) so mixed-type waves are expressible; stranded-enemy handling is
hold-position purely as defense-in-depth — placement validation prevents stranding outright (D4).
