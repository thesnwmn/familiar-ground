import { classifyOpenMapTiles, type Classifier, type Paint } from "./classify.ts";
import type { MapFeature, Point } from "./features.ts";
import { tileSizeMeters, tileToLngLat } from "./geo.ts";
import { fillPolygon, strokeLine } from "./raster.ts";
import { randInts } from "./rng.ts";
import { Ground, Structure } from "./vocab.ts";

/** Chunks are Web Mercator tiles at this zoom, so they align exactly with data tiles. */
export const CHUNK_ZOOM = 16;
/** Cells per chunk side. At z16 that's roughly 2.4 m per cell at the equator, 1.5 m in London. */
export const CHUNK_CELLS = 256;

export interface BuildingInfo {
  /** Stable id: from the map feature id when the tiles carry one, otherwise chunk-local. */
  id: string;
  kind: string;
  name?: string;
  /** Floors, from the map's height when known. */
  levels?: number;
  /** Footprint rings in chunk cell coordinates (unclipped, so they may extend past the chunk). */
  rings: Point[][];
  /** How many of this chunk's cells the footprint covered when generated (before player changes). */
  cells: number;
}

export interface Poi {
  id: string;
  x: number;
  y: number;
  cls: string;
  subclass?: string;
  name?: string;
}

/** A road, path or rail centre line, for styles that draw markings (lane paint, crossings). */
export interface RoadLine {
  /** Map class, e.g. "primary", "minor", "path", "rail". */
  cls: string;
  ground: Ground;
  /** Width in cells. */
  width: number;
  /** Centre line in chunk cell coordinates (unclipped; only lines near the chunk are kept). */
  points: Point[];
}

/** The game's mutable model of one area. Renderers draw this; map data is never drawn directly. */
export interface Chunk {
  cx: number;
  cy: number;
  size: number;
  /** Approximate ground size of one cell, at the chunk's latitude. */
  cellSizeM: number;
  ground: Uint8Array;
  structure: Uint8Array;
  /** Index into `buildings` for each cell, or -1. */
  building: Int32Array;
  buildings: BuildingInfo[];
  pois: Poi[];
  /** Road and path centre lines near this chunk (read-only geometry from the map). */
  roads: RoadLine[];
}

export interface BuildChunkInput {
  cx: number;
  cy: number;
  seed: number;
  /** The data tile containing this chunk (dataZoom <= CHUNK_ZOOM) and its decoded features. */
  dataZoom: number;
  features: MapFeature[];
  classify?: Classifier;
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx}/${cy}`;
}

/** The data tile at `dataZoom` that contains chunk (cx, cy). */
export function dataTileFor(cx: number, cy: number, dataZoom: number): { z: number; x: number; y: number } {
  const shift = CHUNK_ZOOM - dataZoom;
  return { z: dataZoom, x: cx >> shift, y: cy >> shift };
}

export function buildChunk(input: BuildChunkInput): Chunk {
  const { cx, cy, seed, dataZoom, features } = input;
  const classify = input.classify ?? classifyOpenMapTiles;
  const size = CHUNK_CELLS;
  const lat = tileToLngLat(cx + 0.5, cy + 0.5, CHUNK_ZOOM).lat;
  const cellSizeM = tileSizeMeters(CHUNK_ZOOM, lat) / size;

  const chunk: Chunk = {
    cx,
    cy,
    size,
    cellSizeM,
    ground: new Uint8Array(size * size).fill(Ground.GRASS),
    structure: new Uint8Array(size * size),
    building: new Int32Array(size * size).fill(-1),
    buildings: [],
    pois: [],
    roads: [],
  };

  // Tile-local (0..extent) → chunk cell coordinates.
  const k = 2 ** (CHUNK_ZOOM - dataZoom);
  const offX = cx - (cx >> (CHUNK_ZOOM - dataZoom)) * k;
  const offY = cy - (cy >> (CHUNK_ZOOM - dataZoom)) * k;
  const toCells = (p: Point, extent: number): Point => ({
    x: ((p.x / extent) * k - offX) * size,
    y: ((p.y / extent) * k - offY) * size,
  });

  const painted: { f: MapFeature; paint: Exclude<Paint, { kind: "poi" }> }[] = [];
  const poiFeatures: MapFeature[] = [];
  for (const f of features) {
    const paint = classify(f);
    if (!paint) continue;
    if (paint.kind === "poi") poiFeatures.push(f);
    else painted.push({ f, paint });
  }
  painted.sort((a, b) => a.paint.order - b.paint.order);

  for (const { f, paint } of painted) {
    const geom = f.geometry.map((part) => part.map((p) => toCells(p, f.extent)));
    if (paint.kind === "area") {
      fillPolygon(geom, size, (x, y) => (chunk.ground[y * size + x] = paint.ground));
    } else if (paint.kind === "line") {
      const w = paint.widthM / cellSizeM;
      for (const line of geom) strokeLine(line, w, size, (x, y) => (chunk.ground[y * size + x] = paint.ground));
      if (ROAD_LIKE.has(paint.ground) && f.layer === "transportation") {
        for (const line of geom) {
          if (nearChunk(line, size, w + 2)) chunk.roads.push({ cls: String(f.props.class ?? ""), ground: paint.ground, width: w, points: line });
        }
      }
    } else {
      // Tile builders merge neighbouring buildings with identical attributes into one multi-polygon
      // feature (OpenMapTiles does this at z14), so split it back into one building per outline.
      const h = Number(f.props.render_height ?? f.props.height ?? 0);
      const parts = splitPolygons(geom);
      parts.forEach((rings, part) => {
        const index = chunk.buildings.length;
        let cells = 0;
        fillPolygon(rings, size, (x, y) => {
          const i = y * size + x;
          chunk.structure[i] = Structure.BUILDING;
          chunk.building[i] = index;
          cells++;
        });
        if (cells === 0) return;
        const base = f.id !== undefined ? `osm:${f.id}` : `chunk:${cx}:${cy}:${index}`;
        chunk.buildings.push({
          id: parts.length > 1 ? `${base}#${part}` : base,
          kind: "building",
          levels: h > 0 ? Math.max(1, Math.round(h / 3)) : undefined,
          rings,
          cells,
        });
      });
    }
  }

  for (const f of poiFeatures) {
    const p = f.geometry[0]?.[0];
    if (!p) continue;
    const c = toCells(p, f.extent);
    const x = Math.floor(c.x);
    const y = Math.floor(c.y);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const poi: Poi = {
      id: f.id !== undefined ? `osm:${f.id}` : `poi:${cx}:${cy}:${chunk.pois.length}`,
      x,
      y,
      cls: String(f.props.class ?? "poi"),
      subclass: f.props.subclass !== undefined ? String(f.props.subclass) : undefined,
      name: f.props.name !== undefined ? String(f.props.name) : undefined,
    };
    chunk.pois.push(poi);
    // "Buildings matched by type": a POI inside a footprint gives the building its kind and name.
    const b = chunk.buildings[chunk.building[y * size + x]!];
    if (b && b.kind === "building") {
      b.kind = poi.subclass ?? poi.cls;
      b.name = poi.name;
    }
  }

  scatterTrees(chunk, seed);
  return chunk;
}

const signedArea = (ring: Point[]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
  return a;
};

/**
 * Splits MVT polygon rings into separate polygons: a ring wound like the first one starts a new
 * polygon (an outer ring); a ring wound the other way is a hole in the polygon before it.
 */
export function splitPolygons(rings: Point[][]): Point[][][] {
  const polygons: Point[][][] = [];
  let outerSign = 0;
  for (const ring of rings) {
    const area = signedArea(ring);
    if (area === 0) continue;
    if (!outerSign) outerSign = Math.sign(area);
    if (Math.sign(area) === outerSign || !polygons.length) polygons.push([ring]);
    else polygons[polygons.length - 1]!.push(ring);
  }
  return polygons;
}

const ROAD_LIKE = new Set<number>([Ground.ROAD_MAJOR, Ground.ROAD_MINOR, Ground.PATH, Ground.RAIL]);

/** Whether a line's bounding box comes within `margin` cells of the chunk. */
function nearChunk(points: Point[], size: number, margin: number): boolean {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
  return maxX >= -margin && maxY >= -margin && minX <= size + margin && minY <= size + margin;
}

const TREE_DENSITY: Partial<Record<Ground, number>> = {
  [Ground.FOREST]: 0.3,
  [Ground.PARK]: 0.03,
  [Ground.WETLAND]: 0.04,
  [Ground.GRASS]: 0.005,
};

/** Procedural detail: deterministic per global cell, so it never depends on load order. */
function scatterTrees(chunk: Chunk, seed: number): void {
  const { size } = chunk;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (chunk.structure[i] !== Structure.NONE) continue;
      const density = TREE_DENSITY[chunk.ground[i] as Ground];
      if (density && randInts(seed, 1, chunk.cx * size + x, chunk.cy * size + y) < density) {
        chunk.structure[i] = Structure.TREE;
      }
    }
  }
}
