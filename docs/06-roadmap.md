# 6. Roadmap and Risks

## 6.1 Phased prototype plan

Each phase is shippable and playable in a browser, and each answers one question.

### Phase 0: "Click anywhere" (1–2 days)
- Vite + TypeScript app. A MapLibre map with an OpenFreeMap style; clicking it captures lat/lon (plus an optional Photon/Nominatim search box).
- Shareable URL: `?lat=…&lon=…&seed=…&theme=…`.

### Phase 1: data to grid, ASCII (about 1 week)
*Question: can we build a continuous, deterministic world from tiles?*
- Fetch z14 vector tiles (OpenFreeMap) for the area around the start point inside a worker.
- Classify and rasterise into a semantic grid per chunk (doc 2), and render with rot.js glyphs.
- A player `@` that walks, with chunk streaming, IndexedDB caching and road-graph stitching across tile edges.
- **Success**: walk 2 km across your own neighbourhood and recognise it.

### Phase 2: pixel art renderer (2–4 weeks)
*Question: does it look good, and does the abstraction hold?*
- PixiJS or Phaser renderer with autotiled ground (blob or dual-grid), vector-drawn roads, and 3/4-view buildings from footprints and levels.
- Free tilesets to start (Kenney / OpenGameArt), with palettes per theme.
- Procedural fill: trees in woods and parks, buildings in unmapped urban blocks, street props.
- Zoom transition from the real map into the game.

### Phase 3: theme plus a game loop (2–4 weeks)
*Question: is it fun?*
- A post-apocalyptic theme: building damage, overgrowth CA, wrecks, POI-based loot tables.
- A minimal loop, for example a roguelite survival run: scavenge real-named shops, reach a destination (the nearest "hospital" or "station"), with day/night.
- Player deltas (looted, destroyed) persisted per chunk.

### Phase 4: own data pipeline (1–2 weeks)
*Question: can we get richer data and stop depending on a third-party tile host?*
- Write a Planetiler profile for game layers (building kind and levels, barriers, trees, surfaces, amenity/shop detail).
- Build a test country, put it on R2 as PMTiles, and keep OpenFreeMap as the fallback for the rest of the world.
- Add terrain (Mapterhorn) and land cover (WorldCover) layers, plus Overture buildings where OSM is sparse.

### Phase 5: breadth
- A second renderer (voxel via Three.js, or line art via Rough.js) to prove style independence.
- More themes (medieval, flooded).
- PWA offline mode, then a Capacitor mobile build.
- Optional backend: cloud saves, then a shared world of deltas, then multiplayer.

## 6.2 Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Data gaps** (sparse OSM in many regions) | Bland or empty worlds | Overture buildings, WorldCover land cover, block-subdivision building generation, theme defaults that look intentional when data is thin |
| **Inconsistent tagging** | Wrong building types, odd roads | Small game vocabulary, tolerant classifier, inference from context, a data-driven mapping table |
| **Tile seams** | Broken roads and split buildings | Tile buffers, a 3×3 neighbourhood, endpoint snapping, OSM-id merging |
| **Dependency on free public services** (OpenFreeMap, Overpass, Nominatim) | Outage, rate limits, or the project dying | Use them only for prototyping or fallback, self-host PMTiles early, cache aggressively, set an identifying UA and respect policies |
| **Mercator scale** | Wrong distances at high latitude | Per-session scale factor (doc 2.1) |
| **Mobile performance** | Jank, battery drain | Workers, small active radius, low internal resolution, cached chunks, instancing |
| **Art scope** | Every theme × renderer needs assets | Palette swaps, modular procedural sprites, start with one theme × one renderer |
| **Licensing** | ODbL obligations | Attribution screen; distribute derived tiles under ODbL; keep code and art licensed separately |
| **Real-world sensitivity** | Hostile content placed at real homes, schools or religious sites; player safety if location-based | It's an *armchair* game, not GPS-based, so players don't need to be physically present. Theme rules can avoid putting violent content at specific sensitive POI types, and the game shouldn't encourage visiting real places. Prefer generic names for residential buildings. |
| **Scope creep** ("the whole world, every style") | Never ships | The phased plan; each phase is small and playable |

## 6.3 Open questions to decide early

- **Scale**: 1 cell = 1–2 m (person-scale RPG) or 5–10 m (strategy/survival)? It drives everything from art to performance.
- **Camera**: pure top-down, 3/4 view, or isometric? 3/4 top-down pixel art is the sweet spot for recognisability.
- **Game genre**: roguelike, survival, exploration/collection, or city-builder? Exploration and survival make the most of "familiar but altered".
- **Fidelity vs. abstraction**: should every real building appear (faithful), or only the structure (roads and land use) with procedural buildings (stylised, more robust to bad data)? Probably faithful in cities and procedural elsewhere, controlled per theme.
