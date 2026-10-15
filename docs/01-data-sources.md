# 1. Data Sources

What real-world data is available for free, how you'd get it into a browser game, and what strings come attached.

## 1.1 OpenStreetMap (OSM): the core

OSM is the obvious foundation. It's global, free, and has very rich tagging: `highway=residential`, `building=church`, `amenity=pharmacy`, `landuse=forest`, `waterway=river`, `barrier=wall`, `building:levels=4` and so on. Those tags are what make "familiar but altered" possible, because a pharmacy can become a lootable medical store and a church can become a ruined chapel.

The raw data is far too big to use directly (the planet PBF is roughly 80+ GB), so you consume it in one of three ways. Whichever you choose, this is **read-only input** for building the game's own mutable chunks (see [doc 2 §2.0](02-world-pipeline.md)).

| Approach | What it is | Good for | Bad for |
|---|---|---|---|
| **Pre-built vector tiles** | Map features clipped to z/x/y tiles, encoded as MVT (protobuf) | Fast, cacheable, static hosting, global coverage | Tags are pre-filtered by the tile schema (you lose some detail) |
| **Overpass API** | Query live OSM data by bbox and tag | Prototyping, getting *all* tags for a small area | Rate-limited shared service, slow, not for production traffic |
| **Your own extraction** | Run Planetiler / tilemaker / osmium on a PBF extract | Full control: a game-specific schema | Needs a build step (but it's offline and one-off) |

### Pre-built vector tile sources

- **OpenFreeMap**: free public vector tiles in the **OpenMapTiles schema**. No API key, no registration, no stated request limits; donation-funded and "as is". Weekly full-planet downloads (MBTiles) are available for self-hosting. TileJSON lives at `https://tiles.openfreemap.org/planet`.
  - OpenMapTiles layers include: `water`, `waterway`, `landcover`, `landuse`, `park`, `transportation`, `transportation_name`, `building` (with `render_height` / `render_min_height`), `poi` (with `class`/`subclass`), `place`, `aeroway`, `housenumber`, `mountain_peak`, `boundary`.
- **Protomaps basemap (v4)**: a daily planet build published as a single **PMTiles** file (~120 GB, z0–15). Downloads are listed at `maps.protomaps.com/builds`. Don't hotlink these; copy what you need to your own storage. The `pmtiles extract` CLI cuts out a region or zoom range (for example a city at z0–15, often only tens of MB). It's built with Planetiler and open source, so it can be rebuilt for a city or country in minutes.
  - Layers: `earth`, `water`, `landuse`, `landcover`, `natural`, `roads`, `transit`, `buildings`, `pois`, `places`, `boundaries`.
- **Self-built with Planetiler** (Java, very fast) or **tilemaker** (C++, Lua config). You write a *profile* that decides which OSM tags go into which layer. **This is the long-term answer**: you make "game tiles" with exactly the attributes the game needs, such as building type, levels, roof shape, surface, lanes, walls, fences, trees and benches. Most of these are dropped by cartographic schemas because a map doesn't need them, but a game does.

> A z14 tile is about 2.4 km across at the equator. With the standard 4096-unit tile extent that's about 0.6 m per unit, which is plenty of precision for a game. Requesting z14 and **over-zooming** client-side is the normal approach. The highest zoom contains the most detail, so lower zooms are only useful for a "world map" view.

### Overpass API

Great for prototyping, because you get every tag on every feature in a bounding box:

```
[out:json][timeout:25];
( way["building"](51.50,-0.13,51.51,-0.12);
  way["highway"](51.50,-0.13,51.51,-0.12);
  node["amenity"](51.50,-0.13,51.51,-0.12); );
out geom;
```

The main instance (`overpass-api.de`, run by FOSSGIS) has a fair-use policy. Safe use is roughly under 10,000 queries and under 1 GB per day, counted *across all your app's users*. Back off at least 30 s after a 429 response, and send an identifying User-Agent. Commercial or heavy use should be self-hosted. **Conclusion:** use it in dev tools and for one-off extracts, not as the runtime data source for a public game.

## 1.2 Overture Maps: gap filling and a second opinion

Overture (Linux Foundation; Meta, Microsoft, Amazon, TomTom and others) publishes monthly **GeoParquet** releases on S3/Azure: `s3://overturemaps-us-west-2/release/<version>/`. The themes are `base`, `buildings`, `divisions`, `places`, `transportation` and `addresses`. As of the 2026-08 release these are GA.

Why it matters here:

- **Buildings**: Overture merges OSM with ML-derived footprints (Microsoft, Google and others). That fills the large gaps in rural and Global South areas where OSM buildings are sparse.
- **Places**: tens of millions of POIs with categories. It complements OSM `amenity`/`shop` and is useful for "what kind of building is this?".
- Query it with **DuckDB** (it can read GeoParquet straight from S3 by bbox), then feed the result into your tile build. It isn't a browser runtime source.
- Note: the places `categories` field was being replaced by `basic_category` / `taxonomy` around the September 2026 release, so check the schema version.

## 1.3 Terrain / elevation

Top-down doesn't strictly need elevation, but it's very useful for hills, shading, voxel heights, rivers that make sense, rising-sea-level scenarios and line-of-sight.

- **Mapterhorn**: an open terrain tile project, served as PMTiles with Terrarium encoding (512 px tiles). The global base is Copernicus GLO-30 (~30 m) up to z12, with much finer national data in parts of Europe, the USA (10 m, partly 1 m) and Japan. It's supported natively by MapLibre. Code is BSD-3, and data attribution varies by region.
- **AWS Terrain Tiles** (Mapzen legacy, Terrarium/normal PNG): an older but still widely used global option.
- Decoding Terrarium is simple: `height_m = (R * 256 + G + B / 256) - 32768`.

## 1.4 Land cover (for when OSM is empty)

- **ESA WorldCover** (10 m, global, classes such as tree cover, shrubland, grassland, cropland, built-up, water, wetland and snow). Pre-process it into a coarse raster tile layer. It's the fallback that says "this is forest" or "this is farmland" where nobody has mapped anything.
- **Natural Earth**: low-zoom global context (coastlines, countries) for the world-map picker.

## 1.5 Geocoding (for "start at…")

- Clicking a map is the simplest option and needs no geocoder.
- **Nominatim** (OSM's geocoder) has a strict policy: at most 1 request/s, an identifying UA and no autocomplete. Fine for occasional "search a place" lookups.
- **Photon** (komoot), which is OSM-based and supports autocomplete. It has a public demo instance or can be self-hosted.

## 1.6 Licensing (important, not scary)

| Source | License | What it means for you |
|---|---|---|
| OSM | **ODbL 1.0** | Show "© OpenStreetMap contributors" in the game. Rendered output (the game visuals) is a "Produced Work": attribution only. If you **distribute a derived database** (for example your own game tiles built from OSM), that database must also be ODbL. Your *code and art* don't have to be. |
| OpenMapTiles schema/styles | BSD / CC-BY | Attribution |
| Overture | Per theme: ODbL (where OSM-derived), CDLA-Permissive-2.0 (e.g. places) and others | Check each theme's license and attribute |
| Copernicus DEM / Mapterhorn | Various open licenses per region | Copy Mapterhorn's attribution list |
| ESA WorldCover | CC-BY 4.0 | Attribution |

Practical rule: keep an attribution screen and an "about the data" link, and publish your processed game tiles under ODbL if you distribute them. That's normal practice and costs nothing.

## 1.7 Data quality reality check

- **Cities in Europe, North America and Japan**: superb. Many have individual trees, benches, building levels and house numbers.
- **Rural areas**: roads and land use are usually fine, but buildings are sparse. Fill with Overture plus procedural generation.
- **Some regions** are sparsely mapped. The game must look good with only a road network and land cover, so procedural generation is not optional.
- Tags are inconsistent (`building=yes` is the most common building tag by far). Design the classifier to degrade gracefully: unknown building, then infer from surrounding land use and POIs, then pick from the theme's default set.
