# 3. Rendering Styles and Themes

Two independent axes:

- **Theme** (*what* the world is): real-modern, post-apocalyptic, medieval, flooded, overgrown, alien-occupied, 1950s and so on. A theme is a set of **rules that transform the semantic world model**.
- **Renderer** (*how* it looks): pixel art, voxels, ASCII, line drawing, low-poly 3D, isometric. A renderer **draws** the world model.

Any theme × any renderer should work, as long as both speak the same semantic vocabulary.

```
world model ──► theme.transform() ──► themed world model ──► renderer.draw()
                (rules, seeded)                              (style plug-in)
```

## 3.1 Themes: "familiar but altered"

What makes this concept compelling is that **the player recognises their street**. So themes should *preserve the skeleton and change the flesh*:

| Keep (recognisability) | Alter (the fantasy) |
|---|---|
| Road layout, rivers, coastline, parks, landmarks | Surfaces, building condition, vegetation, props, inhabitants, signage, era-appropriate replacements |

### Example theme rules

**Post-apocalyptic**
- Damage per building: `p = base[kind] × f(distance from "impact" points) × noise`. Seed from the OSM id. Outcomes: intact, damaged (holes, broken windows), ruined (partial walls plus rubble) or flattened.
- Overgrowth via **cellular automaton** spreading from parks, rivers and verges into roads. The number of years since collapse is a theme parameter.
- Abandoned vehicles: sampled along road segments with density by road class, and occasional pile-ups at junctions and bridges.
- POI repurposing: pharmacy becomes medicine loot, supermarket food, petrol station fuel, police station weapons, hospital a dungeon, school a shelter.
- Some bridges are collapsed, which forces route-finding through the real geography.

**Medieval / alternative history**
- Motorways and primary roads become dirt roads or cobbles. Minor residential streets become fields, or vanish (*the street grid thins out*).
- Dense urban becomes a walled town around the oldest landmarks (churches, castles and `historic=*` tags often are old). Suburbs become farmland and hamlets.
- Rivers, coasts and hills are untouched, because geography is the strongest familiarity cue.
- Rail becomes a canal or track, and an airport becomes a tournament field.

**Flooded (sea-level rise)**
- Uses terrain: every cell below `seaLevel + X m` becomes water. Rooftops of tall buildings poke out. This is very compelling and nearly free once you have DEM data.

**Overgrown / nature reclaimed, winter, alien, 1980s…** are all rules on the same model.

Implement theme rules as small pure functions over the chunk, ordered and seeded:

```ts
type Rule = (chunk: Chunk, ctx: { rng: Rng; params: ThemeParams; neighbours: ChunkLookup }) => void;
const postApoc: Rule[] = [damageBuildings, spreadOvergrowth, placeWrecks, repurposePOIs, collapseBridges];
```

A theme can also be **layered or partial** (a "zone" mechanic): reality slowly changes from modern to ruined as you walk away from your start point, or a different era is shown inside a "rift".

### Optional: AI-generated flavour

An LLM can generate names, lore and quest text from the *real* POI metadata ("an abandoned Boots pharmacy on Station Road…"). Cache it per entity id so it stays deterministic and cheap. This is optional and needs a server-side key, so it's a later-phase feature.

## 3.2 Renderers

### Pixel art (2D top-down or 3/4 view)

The most achievable high-quality look, and the best first target.

- **Autotiling**: convert the semantic grid to tiles using bitmask autotiling (4-bit for simple edges, the 8-bit **47-tile "blob" set** for smooth corners) or **dual-grid** autotiling (fewer tiles, cleaner transitions). Each ground class gets a tileset, and transitions are drawn between classes.
- **Roads**: draw from the *vector* road data, not the grid, so you get proper widths, lane markings, junctions and curves. Either rasterise to a road-mask layer and autotile it, or render road meshes with a pixel-snapped shader.
- **Buildings**: derive a sprite from the footprint. Draw the roof in 3/4 view plus a south-facing wall of height ∝ `levels`. Use different roof and wall palettes per kind and theme. Non-rectangular footprints work if you extrude the polygon and pixelate it.
- **Detail**: use **Wave Function Collapse** or simple rule-based placement to fill areas *constrained* by the semantic grid (for example, WFC inside a park polygon produces paths, flowerbeds and benches).
- **Pixel-perfect rendering**: render to a low-res render target and scale up with nearest-neighbour filtering. PixiJS or Phaser handle this well.
- **Art**: you need tilesets per theme. The asset load is real but bounded, since a dozen ground classes × a few themes is manageable. There are many CC0/CC-BY tilesets to start with (Kenney, OpenGameArt).

### ASCII / roguelike

The cheapest renderer, and great for validating the pipeline on day one.

- One glyph per cell: `.` grass, `#` wall, `=` road, `~` water, `♣` tree, `+` door. Colour by class.
- **rot.js** gives you a canvas glyph display plus FOV, pathfinding and map utilities.
- It pairs naturally with a roguelike game design (turn-based, FOV, permadeath), which is also the cheapest *game* to build.

### Line drawing / sketch / blueprint / ink

Render the **vector geometry directly** instead of a grid:

- **Rough.js** for a hand-drawn look (wobbly strokes, hachure fills).
- Hatching density by building height, stippled water, contour lines from the DEM (marching squares), and paper texture as a post-process.
- SVG for small areas, or Canvas/WebGL (e.g. instanced lines in PixiJS or Three.js) at scale.
- This looks great as a "map-in-a-journal" exploration game.

### Voxels

- Extrude the semantic grid to a 3D voxel grid: terrain height from the DEM, buildings to `levels × 3 m`, roofs by `roof:shape` where tagged, trees as voxel props.
- Mesh with **greedy meshing** per chunk in a worker, then render with Three.js (or Babylon.js). Use instancing for props.
- Destruction becomes voxel removal, which fits the post-apocalyptic theme very well.
- Top-down orthographic or a free camera are both just camera choices.

### Low-poly 3D

- Extrude building footprints (like OSM Buildings or streets.gl), use road ribbons with UVs, and build the terrain mesh from the DEM.
- Stylised flat shading is cheaper on art than realistic textures.
- Pair it with an orthographic or isometric camera for a "diorama" feel.

### Isometric 2D

Same grid as pixel art, but drawn in iso projection with depth sorting. It's a classic look (think SimCity 2000). Building sprites can be procedurally assembled from wall and roof segments.

## 3.3 Shared rendering tricks

- **Style transfer by palette**: one set of greyscale or indexed sprites plus a palette per theme or era (sepia for the 1920s, desaturated green for apocalypse, neon for cyberpunk).
- **Post-processing**: noise, vignettes, CRT, dithering, LUT colour grading. These are cheap and make a big difference.
- **Day/night and weather** as shader uniforms. Real local time and weather at the chosen location is a fun optional touch.
- **Transition effect**: zoom from the real MapLibre map into the game, crossfading map tiles into the rendered world. It's a strong "this is *your* place" moment.

## 3.4 Recommended order

1. **ASCII**: proves data, chunking, determinism and the game loop. Days, not weeks.
2. **Pixel art top-down**: the most broadly appealing look, and art can start from free tilesets.
3. **Line art or voxel**: the second renderer proves the abstraction actually works.
