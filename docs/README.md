# Real-World Map Game

Research notes on building a game where you **pick anywhere on a world map and start playing there**, in a world that's open to explore. The world is rendered *from* real map data but not *as* a map: roads follow real roads, urban areas become buildings, parks become woods, and everything can be restyled into pixel art, voxels, ASCII, line drawing, post-apocalypse, an alternative history and so on.

Target: browser first, mobile/PC later. Free to run for as long as possible, either locally or on free cloud tiers.

## TL;DR

**It's very doable with open data and a fully static architecture.** You don't need a backend to get started.

```
 OpenStreetMap / Overture  ──►  Vector tiles (PMTiles, one static file)  ──►  Browser
 Terrain (Mapterhorn DEM)  ──►  Terrarium PNG tiles (PMTiles)            ──►  Browser
                                                                                │
                      ┌─────────────────────────────────────────────────────────┘
                      ▼
   [Web Worker]  decode tiles ─► "semantic world model" per chunk (grid + features)
                                  │   deterministic procedural detail (seeded by location)
                                  │   theme transform (ruined / medieval / flooded …)
                                  ▼
   [Main thread] renderer plug-in: pixel-art tilemap | voxels | ASCII | sketch | low-poly 3D
```

The key design idea is to **separate three things**:

1. **Data**: what's really there, as vector features (roads, buildings, land use, water, POIs, elevation).
2. **World model**: a game-oriented, style-agnostic version of that data, cut into chunks: a semantic grid ("road", "building:shop", "forest", "water"…), a road graph and a list of entities, with procedurally added detail that's *deterministic* for a given location and seed.
3. **Presentation**: a theme (how reality is *altered*) plus a renderer (how it *looks*). These are swappable.

Do that and "pixel art post-apocalyptic London" and "ASCII medieval Tokyo" are the same pipeline with different plug-ins.

**Map data tiles are not what gets rendered or played.** They're read-only bundles of vector *data* (not images) used once to build the game's own chunks. Chunks are fully mutable: real buildings, invented buildings and the ground can all be damaged, built on or removed. Only the player's changes are saved; the rest is regenerated from the seed. Building your own tiles with Java (Planetiler) is an optional offline step, never a runtime one. See [world pipeline §2.0 and §2.5](02-world-pipeline.md).

## Recommended first stack

| Concern | Pick | Why |
|---|---|---|
| Location picker | MapLibre GL JS + OpenFreeMap style | Free, keyless, real map to click on |
| Map data (prototype) | OpenFreeMap vector tiles (OpenMapTiles schema) or a Protomaps PMTiles extract | Free, no key, already tiled |
| Map data (later) | Your own **Planetiler** profile → game-specific PMTiles | Keep exactly the tags the game needs |
| Gap filling | Overture buildings, ESA WorldCover land cover | Rural and poorly mapped areas |
| Terrain | Mapterhorn (Copernicus 30 m global, finer regionally) | Open, PMTiles, Terrarium encoding |
| Language | TypeScript | Browser-native; wraps to mobile/desktop |
| Rendering | PixiJS (2D) or Three.js (3D/voxel) | Mature, WebGL/WebGPU, fast |
| Hosting | Static site (Cloudflare Pages / GitHub Pages) + PMTiles on object storage | No server process, generous free tiers |
| Persistence | IndexedDB (local); later Cloudflare Workers/D1 or Supabase | Only needed for saves sync or multiplayer |

## Documents

1. [Data sources](01-data-sources.md): what open data exists, how to get it and the licensing.
2. [World pipeline](02-world-pipeline.md): coordinates, chunking, turning map features into a game world, procedural fill and determinism.
3. [Rendering styles and themes](03-rendering-and-themes.md): pixel art, voxels, ASCII, line art and 3D, plus "altered reality" transforms.
4. [Architecture and hosting](04-architecture-and-hosting.md): engine choices, client/worker split, free hosting, mobile/PC and when a backend is needed.
5. [Prior art](05-prior-art.md): projects that already do parts of this.
6. [Roadmap and risks](06-roadmap.md): a phased prototype plan and the main pitfalls.
7. [Styles for play](07-styles-for-play.md): which style-lab looks work as a game view, ranked, plus the recommended camera, visibility and interiors.
