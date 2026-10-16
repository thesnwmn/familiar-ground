# Familiar Ground

Prototypes for a game that starts **anywhere on a real world map**. Roads follow real roads, urban areas become buildings and parks become woods, but the world is rendered in its own style (ASCII, pixel art, voxels, line drawing…) and can be altered (post-apocalyptic, medieval, flooded…). It's familiar, but not the same.

The research behind this is in [`docs/`](docs/README.md).

## Layout

```
packages/
  world-core/     Map data → game world: geo maths, seeded RNG, tile loading,
                  classification, rasterising, chunks, saved changes. No rendering.
prototypes/
  00-picker/      Click anywhere on a real map, pick a style, start
  01-play/        The game shell plus interchangeable rendering styles
  02-gallery/     Style lab: ~60 styles and mashups as stills of the same real places
docs/             Research notes (data sources, pipeline, rendering, hosting, roadmap)
scripts/          Build helpers (assembling the GitHub Pages site)
```

## Getting started

Requires Node 22+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm dev:picker      # http://localhost:5173
pnpm dev:play        # http://localhost:5174/?lat=51.5072&lng=-0.1276&seed=1&style=pixel
pnpm dev:gallery     # http://localhost:5175/
pnpm typecheck
pnpm test
pnpm build:site      # builds every prototype into _site/
```

## Prototypes

**00-picker**: a MapLibre map (OpenFreeMap style). Click to pick a spot, choose a style and a seed, then play. The search box uses Nominatim (one request per search).

**01-play**: the real world, streamed from OpenStreetMap vector tiles and built into chunks in a Web Worker, drawn in your choice of style. You can switch style while playing (the dropdown or keys `1`–`8`); the world and your changes carry over.

| Style | Group | How it draws |
|---|---|---|
| `ascii` | 2D grid | rot.js glyphs, one cell per character (several when zoomed out) |
| `pixel` | 2D grid | Procedural 8×8 pixel tiles in a 3/4 view: roofs plus south walls as tall as the building's floors; cached minimap when zoomed far out |
| `iso` | 2D grid | Isometric diamonds drawn back to front; buildings are columns with floor lines |
| `lumen` | 2D lit pixels | Fine pixels (4×4 per cell) under a smooth light map: streetlamps, lit windows, neon shop signs and your lantern; kerbs, pavements, centre lines, motorway lanes and zebra crossings where mapped footpaths cross roads; swaying trees, glinting water, fireflies and chimney smoke. Evening by default; `?time=night\|dusk\|day\|auto` (auto follows the sun at your longitude) |
| `lumen-biomes` | 2D lit pixels | Lumen plus fantasy biome zones from the seed (temperate, overgrown, fungal, autumn, frost) that restyle ground, trees, lights and particles without moving any real road or building |
| `sketch` | 2D vector | Ink outlines traced with marching squares, hatching, watercolour washes, tree scribbles and handwritten labels |
| `voxel` | 3D (Three.js) | Voxel columns with visible storeys, cube trees, crisp pixel ground |
| `lowpoly` | 3D (Three.js) | Buildings extruded from their real footprints, flat-shaded pastels, cone trees |

- URL parameters: `lat`, `lng`, `seed`, `style`, and optional `tiles` (a TileJSON or `.pmtiles` URL; defaults to OpenFreeMap).
- Touch: drag anywhere on the map to walk (a joystick appears under your finger; the further you push, the faster you go, slower when zoomed out; diagonals slide along walls), pinch to zoom, and use the on-screen buttons.
- Keys: arrows/WASD to move (Shift runs), `X` breaks the building, wall or tree you're facing, `B` builds a wall, `+`/`-` or the mouse wheel zoom, `Z` cycles zoom, `1`–`8` switch style.
- Changes are saved per chunk in IndexedDB and survive reloads. The world itself is regenerated from map data + seed.
- Named buildings (a POI inside the footprint) stand out in every style, and the HUD shows what you're standing on and facing.

**02-gallery** (style lab): a single page of still images for exploring looks without playing. Every style draws the same real places (grid cities like Manhattan, Barcelona and Chicago; organic ones like Soho, Paris's Étoile, Amsterdam's canals, Venice, Marrakech and St Ives) at several zooms, from up close (on foot) to district. Pick places, zooms, groups, image size and seed; tap an image for a large render. Add your own spot by pasting coordinates or a Google Maps / OpenStreetMap link, or with "My location"; the picker also has a "See this spot in every style" link. Spots are kept in the URL (`?spots=lat,lng,name;…`), so a view can be bookmarked or shared. Images render lazily as you scroll. The *Walls* groups stand every plan look up as oblique 3/4, from-the-player perspective, low drone or cavalier views. Styles marked ↻ follow the *Camera angle* control (fixed angles, or follow the street); in the game, Q/E, a two-finger twist and F (follow the street) turn them.

- Groups: plans & lines (including the *lit plan*), top-down games (GTA2, Hotline Miami, Pokémon, Game Boy, Stardew, Civ hexes, Factorio, Frostpunk, SNES, Pip-Boy, radar, Dwarf Fortress, Braille, Obra Dinn, RTS fog, cyberpunk, tilt-shift, dungeon map), other worlds (Lumen at 8× and 16× pixel density, ruins, flood, medieval, bioluminescent, winter, desert, lava, candy, Atlantis), print & craft (risograph, halftone, Lego, cross-stitch, papercraft, stained glass, pointillism, sumi-e, felt) and sensors & data (thermal, Earth at night, 1940s aerial, X-ray, hotspots, night vision), plus the game's own styles.
- **Playable candidates** group: mock-ups with a player, gangs, loot, resources and a HUD on top (oblique 3/4, perspective from the player, low drone camera, line of sight by night and day, entering a building with a generated interior, lit oblique night, tactical plan, toy perspective). Every style has a playability rating (A–D, filterable) explained in `docs/07-styles-for-play.md`, and a **Play at…** link: any lab style can be launched in 01-play (`?style=lab:<id>`) via a generic, unoptimised adapter, so you can walk around in it. "🎲 Surprise me" adds three random city spots; the **Game** zoom (7 px/cell) is the intended play scale.
- Styles are recipes built from a small kit in `src/kit/`: smooth vector-like masks from the cell grid, pixel art at any density, real road lines and footprints, GTA-style perspective extrusion, a shared lighting model, and post effects (dithering/palettes, halftone, ink edges, tilt-shift, scanlines…). A new style is usually 10–30 lines in `src/styles/`.

### Adding a style

A style is a `Renderer` (`prototypes/01-play/src/renderers/types.ts`): it draws a `View` (world + player + zoom level) and can cache per-chunk work through `chunkLoaded` / `chunkChanged` / `chunkEvicted`. The shell owns the world, input, HUD and streaming. Register it in `src/styles.ts` (loaded on demand, so heavy libraries only download for the styles that use them) and add it to the picker's list.

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
