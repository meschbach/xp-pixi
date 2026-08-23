## ADDED Requirements

### Requirement: Production build is fully static
The production build output SHALL be fully self-contained static files (HTML, hashed JS/CSS bundles) servable by any static file server or CDN, with no server-side runtime dependencies.

#### Scenario: Static hosting works
- **WHEN** the contents of the build output directory are served by an arbitrary static file server
- **THEN** the game loads and is playable from that origin

### Requirement: Base URL driven by environment configuration
All generated asset URLs SHALL derive from a `CDN_BASE` environment variable at build time, defaulting to `/` when unset, so the same source builds for localhost, GitHub Pages subpaths, or an external CDN root.

#### Scenario: Subpath build
- **WHEN** the project is built with `CDN_BASE=/xp-pixi/`
- **THEN** index.html references all bundles and assets under `/xp-pixi/`

### Requirement: Continuous deployment to GitHub Pages
A GitHub Actions workflow SHALL, on push to `main`, run quality gates (typecheck, lint, tests), build with the repository-appropriate `CDN_BASE`, and publish the result to GitHub Pages such that the site updates at the project Pages URL.

#### Scenario: Push to main releases
- **WHEN** commits are pushed to `main`
- **THEN** the workflow completes and the deployed site reflects those commits

#### Scenario: Pull request validation without deploy
- **WHEN** a pull request is opened or updated
- **THEN** quality gates and a build run, but no deployment occurs

### Requirement: Local production parity check
The project SHALL provide a command to serve the actual production build locally so base-path and bundling issues can be caught before pushing.

#### Scenario: Preview validates built output
- **WHEN** the developer builds with a non-root `CDN_BASE` and serves the output via the preview command
- **THEN** the game loads correctly at the configured subpath
