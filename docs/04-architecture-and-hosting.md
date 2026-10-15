# 4. Architecture, Engines and Free Hosting

## 4.1 Client architecture

```
┌──────────────────────────────── Browser ────────────────────────────────┐
│                                                                          │
│  UI shell (location picker: MapLibre + OpenFreeMap style, menus, saves)  │
│                                                                          │
│  Main thread                          Worker pool                        │
│  ┌──────────────────────┐   msgs     ┌──────────────────────────────┐   │
│  │ Game loop / ECS      │ ◄────────► │ ChunkService                 │   │
│  │ Input, physics, AI   │ (Transfer- │  - fetch tiles (PMTiles)     │   │
│  │ Renderer plug-in     │  able      │  - decode MVT / Terrarium    │   │
│  │ (Pixi / Three / ASCII)│  buffers)  │  - classify + rasterise      │   │
│  └──────────────────────┘            │  - theme rules (seeded)      │   │
│            │                         │  - decorate, nav graph       │   │
│            ▼                         └──────────────────────────────┘   │
│  IndexedDB: raw tile cache, generated chunk cache, player deltas/saves   │
└──────────────────────────────────────────────────────────────────────────┘
          │ HTTP range requests (static, CDN-cacheable)
          ▼
   Object storage / CDN:  world.pmtiles, terrain.pmtiles, landcover.pmtiles, assets
```

- **Engine-agnostic core**: keep the pipeline (doc 2) as a plain TypeScript library with no rendering dependency. It runs in workers, unit-tests in Node, and could later run server-side or be ported.
- **Transfer typed arrays** (`postMessage(chunk, [chunk.ground.buffer, …])`) to avoid copying.
- A **service worker** plus IndexedDB makes previously visited areas playable offline and makes the site an installable PWA.

## 4.2 Engine and library options

| Option | Fit | Notes |
|---|---|---|
| **PixiJS** (v8, WebGL/WebGPU) | ★★★ 2D pixel art, line art | Fast renderer only; bring your own game structure. Very good for big tilemaps. |
| **Phaser** | ★★★ 2D game | Batteries included (scenes, input, physics, tilemaps, cameras). Easiest path to a *game*. |
| **Three.js** | ★★★ voxel, low-poly, iso 3D | Huge ecosystem; pairs with your own ECS (e.g. bitECS, miniplex). |
| **Babylon.js** | ★★ 3D | More "engine" than Three; good tooling. |
| **rot.js** | ★★★ ASCII roguelike | FOV, pathfinding, glyph display. |
| **MapLibre GL JS** | Location picker; possibly a "map mode" | Not the game renderer, but you can share its tile/PMTiles plumbing. |
| **Godot 4 (web export)** | ★★ | Great editor, and one codebase for web, desktop and mobile. Web export is heavier (WASM, larger downloads), and GDScript is separated from the JS map libraries. Workable if the data prep happens in JS or a WASM module. |
| **Bevy (Rust → WASM)** / **Unity WebGL** | ★ for this project | Possible, but slower iteration and heavier web builds. Unity WebGL is weak on mobile browsers. |

**Recommendation:** TypeScript + Vite, with **Phaser or PixiJS** for 2D (start here), and **Three.js** if or when you go voxel or 3D. Keep the pipeline in workers as a separate package.

## 4.3 Path to mobile and PC

- **PWA** first: installable, offline-capable, no store needed.
- **Capacitor** wraps the same web app for iOS and Android app stores.
- **Tauri** (small, uses the system webview) or **Electron** for desktop. Steam is possible with either.
- Mobile performance: smaller active-chunk radius, lower internal resolution, pre-baked chunk caches, and fewer worker threads (2).

## 4.4 Hosting for free (or nearly)

Because the world is generated client-side from static files, **the entire game can be static**.

| Piece | Free option | Caveats (check current limits) |
|---|---|---|
| Web app | Cloudflare Pages, GitHub Pages, Netlify | GitHub Pages site size about 1 GB; large data doesn't belong there |
| Vector tiles (prototype) | **OpenFreeMap public tiles**: free, no key, no stated limits | Donation-funded and "as is"; have a fallback |
| Vector tiles (own) | **PMTiles on Cloudflare R2**: free tier around 10 GB storage with no egress fees (verify) | A city or country extract fits easily. The full Protomaps planet (~120 GB) doesn't fit in the free tier. |
| Terrain | Mapterhorn public tiles, or extract regions to your bucket | Check usage terms for public endpoints |
| Local dev | `npx serve` / Vite and a local `.pmtiles` file | Completely free and offline |

### Scaling the "anywhere in the world" promise cheaply

1. **Prototype**: OpenFreeMap tiles at runtime, so it works globally from day one at zero cost.
2. **Own data, limited area**: custom Planetiler profile → PMTiles of a few countries → R2. Free.
3. **Own data, global**: a custom planet PMTiles with only game layers at z14. That's likely tens of GB, so storage costs a few $/month on R2 with free egress. Alternatively, generate regions **on demand** (see 4.5).
4. A **Cloudflare Worker** in front of PMTiles (Protomaps provides one) gives you normal `/{z}/{x}/{y}.mvt` URLs and edge caching, within the free Workers request quota.

> Rebuild cadence: OSM changes constantly, but a game doesn't need fresh data. Rebuilding monthly or quarterly is fine. Pin a data version per release so that a save game's world doesn't shift under the player.

## 4.5 When you *do* want a backend

None of this is needed for a single-player MVP.

| Need | Lightweight solution |
|---|---|
| Cloud saves / accounts | Supabase (Postgres + auth, free tier) or Cloudflare D1 + Workers |
| Shared persistent world (everyone sees the same ruins and loot) | Store **chunk deltas** server-side, keyed by chunk and data version. Cloudflare Durable Objects per region work well for this. |
| Real-time multiplayer | Durable Objects / WebSockets, Colyseus on a small VM, or a free tier such as Fly.io (limits change, so verify) |
| On-demand data for areas outside your tiles | A worker or job that pulls an Overpass/Overture bbox, runs the profile and caches the result in R2. Rate-limit it carefully. |
| LLM flavour text | A serverless function with your API key; cache results per entity id |

Design rule: **the server stores intent (deltas, saves), not the world.** The world is always regenerated from data + seed + theme, which keeps storage and bandwidth tiny.

## 4.6 Build tooling for data

- **Planetiler** (Java, single JAR) with a custom profile; a planet build takes a few hours on a big machine and a country takes minutes. Alternatively **tilemaker** (Lua config).
- **Geofabrik** extracts (country or region `.osm.pbf`) for building small areas.
- **DuckDB** with the spatial extension to pull Overture GeoParquet by bbox.
- **pmtiles CLI**: `extract`, `convert`, `show`, `serve`.
- **GDAL** to convert ESA WorldCover / DEM GeoTIFFs into raster tiles.
- Run builds in GitHub Actions for small regions (free minutes), or locally.
