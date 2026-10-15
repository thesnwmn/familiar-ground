# Familiar Ground

A pnpm TypeScript monorepo of browser prototypes for a game generated from real-world map data. Read `docs/README.md` for the design; `docs/02-world-pipeline.md` is the core architecture.

## Commands

- `pnpm install`, `pnpm typecheck`, `pnpm test`, `pnpm build:site`
- Run `pnpm typecheck && pnpm test` before committing.

## Workflow

- Never push to `main`. Every change goes on a branch and lands through a pull request, merged with **squash merge** so `main` has one commit per PR.
- PR titles become the squash commit message: make them descriptive.

## Conventions

- `packages/world-core` must stay renderer-agnostic: no DOM, no rendering libraries. It must run in a Web Worker and in Node (tests).
- Generation is deterministic: never use `Math.random()` in world generation. Use `rngFor(seed, purpose, ...keys)`.
- Map data tiles are read-only input. Game chunks are the mutable world state; player changes are stored as per-chunk deltas.
- Prototypes are Vite apps under `prototypes/NN-name/` with `base: "./"` so they work under the GitHub Pages sub-path. `scripts/build-site.mjs` picks up any prototype that has a `dist/` after `pnpm build`.
- Tests must not hit the network: build vector tile fixtures from GeoJSON (see `packages/world-core/test/fixtures.ts`).
- Keep the OpenStreetMap attribution visible in every prototype.
- Rendering styles live in `prototypes/01-play/src/renderers/`. Renderers only draw; they never edit the world. Shared input, HUD and streaming live in `prototypes/01-play/src/main.ts`.
