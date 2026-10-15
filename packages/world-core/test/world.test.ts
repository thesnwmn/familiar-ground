import { describe, expect, it } from "vitest";
import { CHUNK_CELLS } from "../src/chunk.ts";
import { MemoryDeltaStore } from "../src/delta.ts";
import { createChunkProvider } from "../src/provider.ts";
import { Ground, Structure } from "../src/vocab.ts";
import { World } from "../src/world.ts";
import { FixtureSource, neighbourhoodTile } from "./fixtures.ts";

const CX = 8186 * 4 + 1;
const CY = 5448 * 4 + 1;

describe("createChunkProvider", () => {
  it("fetches each data tile once for all chunks inside it", async () => {
    const source = new FixtureSource(neighbourhoodTile());
    const provide = createChunkProvider({ source, seed: 1 });
    await Promise.all([provide(CX, CY), provide(CX + 1, CY), provide(CX, CY + 1)]);
    expect(source.requests).toBe(1);
  });
});

describe("World", () => {
  const gx = CX * CHUNK_CELLS + 156;
  const gy = CY * CHUNK_CELLS + 156;

  it("loads chunks around a position and evicts far ones", async () => {
    const world = new World(createChunkProvider({ source: new FixtureSource(neighbourhoodTile()), seed: 1 }), new MemoryDeltaStore());
    await world.ensureAround(gx, gy, 10);
    expect(world.loadedCount).toBe(1);
    await world.ensureAround(gx, gy, 200);
    expect(world.loadedCount).toBe(9);
    world.evictBeyond(gx, gy, 10);
    expect(world.loadedCount).toBe(1);
  });

  it("keeps player changes across reloads via saved deltas", async () => {
    const store = new MemoryDeltaStore();
    const source = new FixtureSource(neighbourhoodTile());
    const first = new World(createChunkProvider({ source, seed: 1 }), store, "seed1:");
    await first.ensureAround(gx, gy, 1);
    expect(first.cell(gx, gy)!.chunk.structure[first.cell(gx, gy)!.i]).toBe(Structure.BUILDING);

    first.edit(gx, gy, "structure", Structure.NONE);
    first.edit(gx, gy, "ground", Ground.RUBBLE);
    first.edit(gx + 1, gy, "structure", Structure.WALL);

    const second = new World(createChunkProvider({ source, seed: 1 }), store, "seed1:");
    await second.ensureAround(gx, gy, 1);
    const c = second.cell(gx, gy)!;
    expect(c.chunk.structure[c.i]).toBe(Structure.NONE);
    expect(c.chunk.ground[c.i]).toBe(Ground.RUBBLE);
    expect(c.chunk.building[c.i]).toBe(-1);
    expect(c.chunk.structure[c.i + 1]).toBe(Structure.WALL);

    // A different seed is a different world with its own saves.
    const other = new World(createChunkProvider({ source, seed: 1 }), store, "seed2:");
    await other.ensureAround(gx, gy, 1);
    const o = other.cell(gx, gy)!;
    expect(o.chunk.structure[o.i]).toBe(Structure.BUILDING);
  });
});
