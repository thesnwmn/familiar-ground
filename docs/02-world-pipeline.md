# 2. World Pipeline: Map Data to Game World

This is the core of the project: turning clipped, cartographic vector tiles into a continuous, explorable, *deterministic* game world.

## 2.0 Two kinds of "tile": data tiles vs. game chunks

These notes use "tile" for two different things. Keeping them apart is the key to the whole design.

| | **Map data tile** (input) | **Game chunk** (world state) |
|---|---|---|
| What it is | Compressed vector *data* (MVT) for one z/x/y square: geometry plus attributes. **Not an image.** | The game's own model of one area: a cell grid plus entities |
| Example content | "polygon: building, 4 floors, shop"; "line: residential road" | `Building#w123` with walls, doors, HP, interior and damage state; cells marked road, grass, rubble |
| Who makes it | Someone else (OpenFreeMap, Protomaps) or your offline build (Planetiler) | The browser, at runtime, in a worker |
| Mutable? | **No.** Read-only, shared by every player | **Yes.** It's what the player damages, builds on and loots |
| Drawn directly? | Never | Yes: the renderer only ever draws chunks |

```
map data tile (read-only, shared)  ──build──►  game chunk (mutable)  ──►  renderer
"polygon, building, 4 floors"                  Building#w123: walls,      sprites / voxels /
                                               door, HP, damage state     glyphs / meshes
```

### Where Planetiler (Java) fits

Planetiler is an **optional, offline** build step, like compiling assets. It turns the raw OpenStreetMap download into vector tiles that keep exactly the attributes the game wants. You run it once (or monthly), upload the resulting `.pmtiles` file and you're done. Nothing runs it during play.

Your options for where the input data comes from:

1. **Public pre-built tiles** (OpenFreeMap, Protomaps): no build step at all. Good enough for a prototype that works anywhere in the world.
2. **Your own pre-built tiles** (Planetiler/tilemaker → PMTiles): richer, game-specific attributes. Built offline, then hosted as a static file.
3. **Live queries** (Overpass API by bounding box): no tiles at all, but slow and rate-limited. Good for dev tools, not for a public game.
4. **On-demand builds** (a server job builds and caches a region the first time someone visits it): only worth it once global coverage with a custom schema matters (see doc 4.5).

Whichever you pick, the output is the same: features handed to the chunk builder. The rest of the pipeline doesn't care which source was used.

## 2.1 Coordinates and scale

Web map tiles use **Web Mercator** (EPSG:3857). Its scale grows with latitude by `1 / cos(lat)`: a tile at 60°N covers half the ground distance of a tile at the equator.

The pragmatic approach is:

- **Index chunks by Mercator tile coordinates** at a fixed zoom (z16 is about 600 m at the equator, z15 about 1.2 km) so they line up exactly with the data tiles. A z14 data tile maps to 4×4 z16 chunks.
- At game start, compute `metersPerUnit = cos(startLat) × earthCircumference / (2^z × extent)` and use it for the whole session. Over the few dozen km a player will realistically walk, the error is negligible (well under 1% within ~50 km at mid-latitudes).
- If a world ever needs to be truly continent-scale, give each region its own local tangent plane (ENU) and re-anchor. You almost certainly don't need this.

Choose a **game cell size** in metres (for example 1 cell = 2 m for a person-scale RPG, or 5–10 m for a strategy or survival map). Everything downstream works on that grid.

## 2.2 Streaming and chunking

```
player position ─► needed chunks (radius R) ─► needed data tiles (z14, deduped)
                                   │
              cache: memory LRU ─► IndexedDB ─► network (PMTiles range request)
```

- **Run it in a Web Worker** (or several). Decoding, rasterising and procedural generation must never block rendering.
- **Precompute one ring ahead** of the visible area, and evict outside 2–3× view radius.
- PMTiles fetches tiles with **HTTP range requests** into one big file. That means no tile server is needed, it works from any static host or object store, and browser and CDN caching both apply.
- **Cache generated chunks** (not just raw tiles) in IndexedDB keyed by `(chunkX, chunkY, seed, themeVersion)`. Revisiting is then instant and works offline.

### Tile seams

Vector tiles **clip geometry at tile edges** (with a small buffer). This creates two problems:

1. *Polygons* (buildings, parks) cut in two. Rasterising per tile with the buffer is usually seamless enough. For building *identity* (one building = one entity), merge by OSM id where the schema keeps it, or always load a 3×3 tile neighbourhood.
2. *The road graph*: road lines end at tile edges. Snap endpoints that touch the tile boundary to neighbours by position and class to stitch a continuous navigation graph.

## 2.3 The semantic world model

Convert each chunk into a style-agnostic intermediate representation. This is the most important design decision in the whole project.

```ts
interface Chunk {
  cx: number; cy: number;              // chunk coords (Mercator tile @ zChunk)
  size: number;                        // cells per side, e.g. 256
  ground: Uint8Array;                  // per-cell surface class: GRASS, ASPHALT, WATER, SAND...
  structure: Uint16Array;              // per-cell: 0 or building/wall/fence id
  height: Float32Array;                // terrain height (m), optional
  buildings: Building[];               // footprint polygon (in cells), kind, levels, roof, osmId
  roads: RoadSegment[];                // polyline, class, width, surface, bridge/tunnel, layer
  entities: Entity[];                  // trees, POIs, props, spawn points, loot...
  tags: Record<string, unknown>;       // anything else themes may want
}
```

### Steps to build a chunk

1. **Fetch** the data tiles covering the chunk, plus terrain and land-cover tiles.
2. **Classify.** Map raw tags or schema classes to a small game vocabulary. Keep this table in data (JSON) so themes can override it.
   ```
   landuse=residential        → GROUND_URBAN (implies buildings even if none mapped)
   landuse=forest|natural=wood → GROUND_FOREST
   leisure=park               → GROUND_PARK
   highway=motorway|trunk     → ROAD_MAJOR (width 14 m)
   highway=residential        → ROAD_MINOR (width 7 m)
   highway=footway|path       → PATH (width 2 m)
   building=* + poi(shop)     → BUILDING_SHOP
   ```
3. **Rasterise in painter's order**: land cover/use → water → parks → roads (by width, with bridges and tunnels on separate layers) → buildings. Use scanline polygon fill for areas and thick-line rasterisation for roads. For anti-aliasing or "how much of this cell is road", rasterise at 2× and downsample to coverage.
4. **Infer what's missing.**
   - Urban land use with no buildings: generate buildings by subdividing city blocks. Blocks are the polygons enclosed by the road graph, which you get by polygonising it. Inset them and split into plots along the street frontage, and size the plots by land-use class.
   - Buildings with no type: vote by nearest POI, land use and footprint size (big and boxy in `landuse=industrial` means a warehouse).
   - Forest: scatter trees with Poisson-disk sampling. Parks get sparser trees and paths.
   - Missing terrain: use flat ground with low-amplitude noise.
5. **Decorate** (procedural detail): street furniture along roads, cars in parking areas, interior layouts for enterable buildings, rubble, signage and so on. All of it goes through the theme (see doc 3).
6. **Build navigation**: a walkability grid from `ground`/`structure`, plus the stitched road graph for vehicles, NPC routes and long-distance pathfinding (A* on the graph, then the grid locally).

## 2.4 Determinism: same place, same world

Players should see the same world when they return, and two players at the same spot with the same seed should see the same world.

- **Never use `Math.random()`** in generation. Use a seeded PRNG (e.g. `mulberry32`, `sfc32`, `xoshiro128**`).
- Derive seeds hierarchically: `hash(worldSeed, chunkX, chunkY, "trees")`. For per-feature decisions use the **OSM id**: `hash(worldSeed, osmId, "damage")`. A building then gets the same damage regardless of which chunk loads it first.
- Generate a chunk *only* from its own data plus neighbours' data, never from generation order. Otherwise the world depends on the path the player took.
- Version your generators. Bumping `themeVersion` invalidates cached chunks cleanly.

## 2.5 Deformable world: entities, generated base and saved changes

Once a chunk is built, the map data has done its job. Everything in the chunk is an ordinary game object, so **everything is deformable**: real buildings, invented buildings and the ground itself.

### Everything becomes an entity

| Origin | Example | Stable id |
|---|---|---|
| Real, from map data | The actual corner shop | From OSM id: `w123456` |
| Generated by the pipeline | Buildings filling an unmapped urban block, trees in a wood, wrecked cars | From seed + chunk + index: `gen:c(812,544):bldg:7` |
| Added by a theme | A ruined watchtower, a medieval town wall, a crashed alien ship | From seed + theme + rule: `theme:postapoc:wreck:c(812,544):3` |
| Placed by the player | A shed, a barricade, a dug trench | Random UUID at creation |

After creation they're all the same kind of object: they can be damaged, entered, looted or demolished, and the game doesn't care where they came from. A building that "isn't really on the map" just has a non-OSM origin.

```ts
interface Building {
  id: string;
  origin: "osm" | "generated" | "theme" | "player";
  footprint: Polygon;          // in cell coords
  kind: BuildingKind;          // shop, house, church, warehouse...
  levels: number;
  hp: number;
  damage: DamageState;         // intact | damaged | ruined | flattened
  interior?: InteriorLayout;   // generated lazily on first entry, seeded by id
}
```

Ground deformation (digging, craters, flooding, building walls) is edits to the cell grids (`ground`, `structure`, `height`).

### Generated base + saved changes

The world is never stored in full. It's two parts:

```
world you see  =  generate(map data, seed, theme)  +  saved changes for that chunk
                  └ rebuilt identically every time ┘   └ small, stored ┘
```

The generated part is a pure function (doc 2.4), so it doesn't need saving. Only player changes are saved, as a **delta per chunk**:

```ts
type ChunkDelta = {
  cx: number; cy: number;
  dataVersion: string;                 // which map data build the base came from
  cellEdits: { x: number; y: number; layer: "ground" | "structure" | "height"; value: number }[];
  entityChanges: { id: string; patch: Partial<Building | Entity> }[];   // e.g. hp, damage
  removed: string[];                   // entity ids (demolished, looted, killed)
  added: (Building | Entity)[];        // player-placed things
};
```

To load a chunk: generate the base, apply the delta, then render. This is the same approach as Minecraft (seeded generation plus stored modifications). It keeps saves tiny and means "looted pharmacy w123456" stays valid across sessions.

Where deltas live:

- **Single player**: IndexedDB in the browser.
- **Cloud saves**: the same deltas synced to a small backend.
- **Shared world**: the server holds the authoritative deltas per chunk, and every client generates the same base locally. The server stores intent, not the world (doc 4.5).

### Things to handle

- **Map data updates**: if a new data build moves or deletes a real building, a delta may point at something that no longer exists. Pin `dataVersion` per save or world and only upgrade deliberately. Treat orphaned changes as ignorable, or keep the ruined building as a theme entity.
- **Edits that cross chunk edges** (a big crater, a long wall): store the edit in each chunk it touches, or store it once in a world-level list that chunks query on load.
- **Interiors**: generate them lazily from the building id and footprint when the player first enters, so they cost nothing for the thousands of buildings nobody visits.
- **Physics and collision** read the chunk's cell grids and entities, never the map data. That's what makes deformation automatically affect movement, line of sight and pathfinding (rebuild the local nav grid after edits).

### How faithful the world is becomes a theme setting

Because real and generated buildings are the same kind of entity, fidelity to reality is a dial rather than an architecture limit:

- **Faithful**: every mapped building appears where it really is.
- **Structural**: keep roads, rivers and parks, but generate buildings procedurally per block. This copes better with poor data and suits themes like medieval.
- **Mixed**: landmarks and notable POIs stay real and the rest is generated.

## 2.6 Example: loading and decoding a tile in the browser

```ts
// npm i pmtiles @mapbox/vector-tile pbf
import { PMTiles } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";

const archive = new PMTiles("https://example-bucket/world-z14.pmtiles");

async function loadTile(z: number, x: number, y: number) {
  const res = await archive.getZxy(z, x, y);          // HTTP range request under the hood
  if (!res) return null;
  const tile = new VectorTile(new Pbf(new Uint8Array(res.data)));
  const buildings = tile.layers["buildings"];          // "building" in OpenMapTiles schema
  const out = [];
  for (let i = 0; i < (buildings?.length ?? 0); i++) {
    const f = buildings.feature(i);
    out.push({
      id: f.id,
      props: f.properties,                             // e.g. height, kind
      rings: f.loadGeometry(),                         // points in 0..extent (usually 4096)
    });
  }
  return out;
}
```

For OpenFreeMap (plain `{z}/{x}/{y}.pbf` URLs), fetch the TileJSON first to get the current tile URL template, then `fetch()` each tile and decode it the same way.

## 2.7 Performance budget (rough guide)

- A dense z14 city tile: a few thousand buildings and road segments, typically 50–500 KB compressed.
- Rasterising a 256×256 chunk takes a few ms in a worker. It's dominated by polygon fill, which is fine in JS. Move it to WASM (Rust) only if profiling says so.
- Keep the active world to around 5×5 chunks on mobile and 9×9 on desktop.
