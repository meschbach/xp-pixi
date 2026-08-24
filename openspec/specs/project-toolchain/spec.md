# project-toolchain Specification

## Purpose

Build/dev toolchain and source conventions: Vite + TypeScript + PixiJS scaffold, the simulation/rendering
separation rules, and dev server behavior including HMR semantics and hot-applied tuning data.

## Requirements

### Requirement: Vite and TypeScript toolchain
The project SHALL build on Vite with TypeScript, providing standard scripts for dev server (`dev`), production build (`build`), tests (`test`), typecheck, and lint.

#### Scenario: Clean checkout to running dev server
- **WHEN** dependencies are installed and the dev script is run from a clean checkout
- **THEN** the game is served locally and playable in a browser

#### Scenario: Quality gates runnable
- **WHEN** typecheck, lint, or test scripts are invoked
- **THEN** each runs successfully against the codebase and reports violations/failures

### Requirement: Hot module replacement during development
Editing source modules SHALL be reflected in the running dev-server session without a full manual restart; when safe, the running game state survives the update, otherwise the page reloads automatically.

#### Scenario: Code edit applies live
- **WHEN** a rendering module is edited and saved during a dev session
- **THEN** the change is visible in the browser without manually restarting the server

### Requirement: Balance data hot-applies mid-run
Balance/tuning data (tower stats, wave definitions) SHALL apply to a running game without restarting or losing current run state; subsequent spawns and purchases use updated values. Applied data flows through a single registry boundary that performs unit conversion and invalidates derived state (a changed range recomputes every tower's coverage). Map/layout data is exempt from live hot-apply: it takes effect on the next run.

#### Scenario: Tuning while playing
- **WHEN** a tower stat value is edited in its data module during an active run
- **THEN** the next tower placed or enemy spawned uses the new value and the run continues uninterrupted

#### Scenario: Range retune reshapes coverage live
- **WHEN** a tower's range value is edited during an active run
- **THEN** coverage regions reflect the new radius immediately and the page does not reload

#### Scenario: Map edits defer to the next run
- **WHEN** a map module is edited during an active run
- **THEN** the running game is unaffected and the edited layout appears on the next run

### Requirement: Simulation layer purity enforced
Modules under the simulation directory MUST NOT import PixiJS, DOM APIs, or pixel/geometry layout concerns. This rule SHALL be enforced by linting — restricted imports and restricted DOM globals (`window`, `document`, `navigator`, …) scoped to the simulation directory — not convention alone.

#### Scenario: Purity violation fails lint
- **WHEN** a simulation module imports `pixi.js`
- **THEN** lint reports an error and CI quality gates fail

#### Scenario: DOM global usage fails lint
- **WHEN** a simulation module references a DOM global such as `window`
- **THEN** lint reports an error and CI quality gates fail

### Requirement: Headless simulation tests
Simulation behavior SHALL be covered by automated tests executable in Node without a browser or WebGL context.

#### Scenario: Tests run in CI
- **WHEN** the test suite runs in a headless CI environment
- **THEN** simulation tests execute and pass without any display/GPU dependency
