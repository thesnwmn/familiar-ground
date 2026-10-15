import { describe, expect, it } from "vitest";
import { buildChunk, CHUNK_CELLS } from "../src/chunk.ts";
import { decodeTile } from "../src/features.ts";
import { Ground, Structure } from "../src/vocab.ts";
import { neighbourhoodTile } from "./fixtures.ts";

// London z14 tile 8186/5448; the chunk at offset (1, 1) inside it.
const TX = 8186;
const TY = 5448;
const CX = TX * 4 + 1;
const CY = TY * 4 + 1;
const features = decodeTile(neighbourhoodTile());
const build = (seed = 1) => buildChunk({ cx: CX, cy: CY, seed, dataZoom: 14, features });
const at = (x: number, y: number) => y * CHUNK_CELLS + x;

describe("decodeTile", () => {
  it("decodes layers, properties and ids", () => {
    const building = features.find((f) => f.layer === "building");
    expect(building?.id).toBe(777);
    expect(building?.props.render_height).toBe(12);
    expect(features.filter((f) => f.layer === "transportation")).toHaveLength(2);
  });
});

describe("buildChunk", () => {
  const chunk = build();

  it("maps the z14 tile area onto the z16 chunk grid", () => {
    // Tile coords 1024..2048 map to cells 0..256: one tile unit = 0.25 cells.
    expect(chunk.ground[at(200, 200)]).toBe(Ground.URBAN);
    expect(chunk.ground[at(10, 10)]).toBe(Ground.FOREST);
    expect(chunk.ground[at(240, 20)]).toBe(Ground.WATER);
  });

  it("draws roads at their real width and skips tunnels", () => {
    expect(chunk.ground[at(50, 128)]).toBe(Ground.ROAD_MAJOR);
    const roadRows = [...Array(CHUNK_CELLS).keys()].filter((y) => chunk.ground[at(50, y)] === Ground.ROAD_MAJOR);
    const expectedCells = 12 / chunk.cellSizeM;
    expect(Math.abs(roadRows.length - expectedCells)).toBeLessThanOrEqual(1.5);
    expect(chunk.ground[at(128, 200)]).not.toBe(Ground.ROAD_MAJOR); // tunnel
  });

  it("creates buildings typed and named by the POI inside them", () => {
    const i = at(156, 156);
    expect(chunk.structure[i]).toBe(Structure.BUILDING);
    const b = chunk.buildings[chunk.building[i]!];
    expect(b).toMatchObject({ id: "osm:777", kind: "supermarket", name: "Test Mart", levels: 4 });
    expect(chunk.pois).toHaveLength(1);
  });

  it("scatters trees deterministically, mostly in forest", () => {
    const trees = (c: typeof chunk) => [...c.structure.keys()].filter((i) => c.structure[i] === Structure.TREE);
    const a = trees(chunk);
    expect(a).toEqual(trees(build()));
    expect(a).not.toEqual(trees(build(2)));
    const inForest = a.filter((i) => chunk.ground[i] === Ground.FOREST).length;
    expect(inForest / a.length).toBeGreaterThan(0.9);
  });

  it("reports a plausible cell size for London", () => {
    expect(chunk.cellSizeM).toBeGreaterThan(1.4);
    expect(chunk.cellSizeM).toBeLessThan(1.6);
  });
});
