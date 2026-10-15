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

## Prototypes

**00-picker**: a MapLibre map (OpenFreeMap style). Click to pick a spot, set a seed, then jump into a prototype. The search box uses Nominatim (one request per search).

**01-ascii**: the real world as a roguelike map, streamed from OpenStreetMap vector tiles and built into chunks in a Web Worker.

- URL parameters: `lat`, `lng`, `seed`, and optional `tiles` (a TileJSON or `.pmtiles` URL; defaults to OpenFreeMap).
- Touch: drag anywhere on the map to walk (a joystick appears under your finger; the further you push, the faster you go (slower when zoomed out), diagonals slide along walls), pinch to zoom, and use the on-screen Break / Build wall / ＋ / − buttons.
- Keys: arrows/WASD to move (Shift runs), `X` breaks the building, wall or tree you're facing, `B` builds a wall, `+`/`-` or the mouse wheel zoom, `Z` cycles zoom.
- Zoom has five levels: three glyph sizes, then 2 and 4 map cells per character for an overview.
- Changes are saved per chunk in IndexedDB and survive reloads. The world itself is regenerated from map data + seed.
- Named buildings (a POI inside the footprint) are highlighted, and the HUD shows what you're standing on and facing.

## Contributing

All changes go through pull requests and are **squash merged**, so `main` has one commit per PR. Recommended repo settings: *Settings → General → Pull Requests*: allow squash merging only; enable "Automatically delete head branches".

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
