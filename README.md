# Familiar Ground

Prototypes for a game that starts **anywhere on a real world map**. Roads follow real roads, urban areas become buildings and parks become woods, but the world is rendered in its own style (ASCII, pixel art, voxels, line drawing…) and can be altered (post-apocalyptic, medieval, flooded…). It's familiar, but not the same.

The research behind this is in [`docs/`](docs/README.md).

## Layout

```
packages/
  world-core/     Map data → game world: geo maths, seeded RNG, tile loading,
                  classification, rasterising, chunks, saved changes. No rendering.
prototypes/
  00-picker/      Click anywhere on a real map to start
  01-ascii/       ASCII renderer: proves the data → chunk → render pipeline
docs/             Research notes (data sources, pipeline, rendering, hosting, roadmap)
scripts/          Build helpers (assembling the GitHub Pages site)
```

## Getting started

Requires Node 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev:picker      # http://localhost:5173
pnpm dev:ascii       # http://localhost:5174/?lat=51.5072&lng=-0.1276&seed=1
pnpm typecheck
pnpm test
pnpm build:site      # builds every prototype into _site/
```

## Hosting

Prototypes are published to GitHub Pages from the `gh-pages` branch:

| Event | Workflow | Published to |
|---|---|---|
| Push to `main` | `deploy-pages.yml` | `https://<user>.github.io/familiar-ground/` (keeps `preview/pr-*/`) |
| PR opened/updated | `pr-preview.yml` | `…/familiar-ground/preview/pr-<number>/`, linked in a PR comment |
| PR closed/merged | `pr-cleanup.yml` | removes `preview/pr-<number>/` |

All three share a concurrency group, so their pushes to `gh-pages` queue instead of racing.

One-time setup, after the first workflow run has created `gh-pages`: **Settings → Pages → Build and deployment → Source: Deploy from a branch → `gh-pages` / `(root)`**.

Prototypes use relative paths, so they work at the root and inside preview folders.

## Data and attribution

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the ODbL. Vector tiles in the prototypes come from [OpenFreeMap](https://openfreemap.org) (OpenMapTiles schema). See [docs/01-data-sources.md](docs/01-data-sources.md) for licensing details.
