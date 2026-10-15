# 5. Prior Art

Projects that already do parts of this. They're worth studying for techniques, and they show the idea has an audience.

## Real-world data into game worlds

- **Arnis** (`github.com/louis-e/arnis`, Rust): generates a Minecraft Java/Bedrock world from any real location. It uses OSM via Overpass plus elevation, and newer versions add Overture buildings. It's the closest existing thing to "pick a place, get a playable world", in voxel style. Study its tag-to-block mapping and building generation.
- **Build The Earth / Terra++** (Minecraft mod): a 1:1 scale Earth in Minecraft generated from OSM + DEM, with players hand-detailing on top. Shows procedural base plus human or player edits as a model.
- **Microsoft Flight Simulator (2020/2024)**: the global world is procedurally generated from OSM footprints + aerial imagery + ML (Blackshark.ai). It's the high-end version of "buildings matched by type, or just 'urban, so render buildings'".
- **Pokémon GO / Ingress (Niantic)**: OSM-derived map data restyled into a game map. Proof that stylised real maps work for mainstream audiences. Also a cautionary tale about real-world places (see the risks in doc 6).
- **A/B Street**: a traffic simulation game built on real OSM road networks (Rust, runs in the browser via WASM). Excellent reference for turning OSM roads into a clean, connected *graph* with lanes and junctions.
- **Cities: Skylines** map import tools and **OpenTTD heightmaps**: community tools that import OSM roads and DEMs into city-builder or transport games.

## Browser renderers of OSM (non-game, but the same plumbing)

- **streets.gl**: a real-time 3D OSM city renderer in the browser (WebGL2), with extruded buildings, roofs, trees and roads. A great reference for the low-poly or 3D renderer.
- **OSM2World**: converts OSM to 3D models (Java). Its tag-to-geometry rules (roofs, walls, street furniture) are a goldmine for the classification and decoration steps.
- **OSM Buildings**: 2.5D building extrusion in the browser.
- **MapLibre GL JS + Protomaps / OpenFreeMap**: the open vector-tile stack itself; its styles show how to classify the schema layers.
- **blosm (Blender-OSM)**: imports OSM + terrain into Blender. Useful for pre-baking assets or reference renders.

## Procedural generation references

- **Watabou's generators** (Medieval Fantasy City Generator, Village Generator, One Page Dungeon): beautiful stylised procedural maps. Great inspiration for the medieval theme and for line-art rendering.
- **Wave Function Collapse** (Maxim Gumin) and its many ports: constrained tile and detail synthesis.
- **Townscaper** (Oskar Stålberg): irregular grids plus WFC-style rules produce charming results with little art. Relevant to procedural building generation from footprints.
- **Red Blob Games** (Amit Patel): definitive articles on grids, hex maps, pathfinding, noise and map generation.
- **Boris the Brave**: articles on autotiling (including dual-grid) and WFC.
- **Caves of Qud / Dwarf Fortress / Cataclysm: DDA**: Cataclysm is a post-apocalyptic roguelike whose procedurally generated *towns* (houses, shops, pharmacies, police stations, all lootable) are essentially the "post-apocalyptic theme" ruleset, just on fictional geography. Strong design reference.

## Where this idea sits

Nobody seems to ship exactly this: **browser-based, any location, pluggable styles and themes, open data, free to run.** Arnis is the closest in spirit but is tied to Minecraft as the output. That leaves room for a project whose distinguishing features are:

1. instant: click on a map and you're playing in seconds, with no download and no install;
2. the theme/renderer split ("your town, but…");
3. deterministic and shareable: "seed 42 at 51.5,-0.12" is a shareable world.
