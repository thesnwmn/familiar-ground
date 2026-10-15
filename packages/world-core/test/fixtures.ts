import { fromGeojsonVt } from "vt-pbf";
import type { TileSource } from "../src/source.ts";

type XY = [number, number];
export type FixtureFeature =
  | { type: 1; geometry: XY[]; tags: Record<string, unknown>; id?: number }
  | { type: 2 | 3; geometry: XY[][]; tags: Record<string, unknown>; id?: number };

/** Encodes features (in 0..4096 tile coordinates) into real MVT bytes, so tests never touch the network. */
export function encodeTile(layers: Record<string, FixtureFeature[]>): Uint8Array {
  const tiles = Object.fromEntries(Object.entries(layers).map(([name, features]) => [name, { features }]));
  return fromGeojsonVt(tiles, { version: 2, extent: 4096 });
}

export const rect = (x0: number, y0: number, x1: number, y1: number): XY[] => [
  [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0],
];

/**
 * A small fake neighbourhood in OpenMapTiles schema. Everything interesting sits in
 * the z16 chunk at offset (1, 1) of the z14 tile, i.e. tile coords 1024..2048.
 */
export function neighbourhoodTile(): Uint8Array {
  return encodeTile({
    landuse: [{ type: 3, geometry: [rect(0, 0, 4096, 4096)], tags: { class: "residential" } }],
    landcover: [{ type: 3, geometry: [rect(1024, 1024, 1280, 1280)], tags: { class: "wood", subclass: "wood" } }],
    water: [{ type: 3, geometry: [rect(1800, 1024, 2048, 1200)], tags: { class: "lake" } }],
    transportation: [
      { type: 2, geometry: [[[1024, 1536], [2048, 1536]]], tags: { class: "primary" } },
      { type: 2, geometry: [[[1536, 1024], [1536, 2048]]], tags: { class: "motorway", brunnel: "tunnel" } },
    ],
    building: [{ type: 3, id: 777, geometry: [rect(1600, 1600, 1700, 1700)], tags: { render_height: 12 } }],
    poi: [{ type: 1, geometry: [[1650, 1650]], tags: { class: "shop", subclass: "supermarket", name: "Test Mart" } }],
  });
}

/** A TileSource serving fixed bytes for every tile, counting requests. */
export class FixtureSource implements TileSource {
  requests = 0;
  constructor(
    private readonly bytes: Uint8Array,
    readonly maxZoom = 14,
  ) {}
  async getTile() {
    this.requests++;
    return this.bytes;
  }
}
