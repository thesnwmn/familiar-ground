import { describe, expect, it } from "vitest";
import { buildChunk, CHUNK_CELLS } from "../src/chunk.ts";
import { decodeTile } from "../src/features.ts";
import { Ground, Structure } from "../src/vocab.ts";
import { encodeTile, neighbourhoodTile, rect } from "./fixtures.ts";

// London z14 tile 8186/5448; the chunk at offset (1, 1) inside it.
const TX = 8186;
const TY = 5448;
const CX = TX * 4 + 1;
const CY = TY * 4 + 1;
const features = decodeTile(neighbourhoodTile());
const build = (seed = 1) => buildChunk({ cx: CX, cy: CY, seed, dataZoom: 14, features });
const at = (x: number, y: number) => y * CHUNK_CELLS + x;

describe("merged buildings", () => {
  it("splits a multi-polygon building feature into one building per outline, keeping holes", () => {
    const tile = encodeTile({
      building: [
        {
          type: 3,
          id: 5,
          // Two separate outlines in one feature (how OpenMapTiles ships buildings at z14); the second has a courtyard.
          geometry: [rect(1100, 1100, 1140, 1140), rect(1300, 1300, 1400, 1400), rect(1340, 1340, 1360, 1360).reverse()],
          tags: { render_height: 9 },
        },
      ],
    });
    const c = buildChunk({ cx: CX, cy: CY, seed: 1, dataZoom: 14, features: decodeTile(tile) });
    expect(c.buildings.map((b) => b.id)).toEqual(["osm:5#0", "osm:5#1"]);
    expect(c.buildings[1]!.rings).toHaveLength(2);
    // Tile units 1100..1140 → cells 19..29; 1300..1400 → 69..94 with a courtyard at 79..84.
    expect(c.building[at(24, 24)]).toBe(0);
    expect(c.building[at(72, 72)]).toBe(1);
    expect(c.structure[at(81, 81)]).not.toBe(Structure.BUILDING);
  });
});

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

  it("keeps road centre lines (not tunnels) for drawing markings", () => {
    expect(chunk.roads).toHaveLength(1);
    const road = chunk.roads[0]!;
    expect(road.cls).toBe("primary");
    expect(road.width).toBeCloseTo(12 / chunk.cellSizeM);
    expect(road.points[0]!.y).toBeCloseTo(128);
  });

  it("creates buildings typed and named by the POI inside them", () => {
    const i = at(156, 156);
    expect(chunk.structure[i]).toBe(Structure.BUILDING);
    const b = chunk.buildings[chunk.building[i]!];
    expect(b).toMatchObject({ id: "osm:777", kind: "supermarket", name: "Test Mart", levels: 4, cells: 25 * 25 });
    // Footprint kept as vector rings in cell coords: tile 1600..1700 → cells 144..169.
    const xs = b!.rings[0]!.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(144);
    expect(Math.max(...xs)).toBeCloseTo(169);
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
