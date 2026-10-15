import type { Chunk } from "./chunk.ts";

export type CellLayer = "ground" | "structure";

/**
 * Player changes to one chunk. The world you see is
 * `buildChunk(map data, seed)` + `applyDelta(delta)`; only deltas are saved.
 */
export interface ChunkDelta {
  cx: number;
  cy: number;
  /** `${layer}:${cellIndex}` → new value. Later edits to the same cell replace earlier ones. */
  cells: Record<string, number>;
}

export function emptyDelta(cx: number, cy: number): ChunkDelta {
  return { cx, cy, cells: {} };
}

export function recordEdit(delta: ChunkDelta, layer: CellLayer, index: number, value: number): void {
  delta.cells[`${layer}:${index}`] = value;
}

export function applyDelta(chunk: Chunk, delta: ChunkDelta): void {
  for (const [key, value] of Object.entries(delta.cells)) {
    const [layer, idx] = key.split(":") as [CellLayer, string];
    const i = Number(idx);
    chunk[layer][i] = value;
    if (layer === "structure") chunk.building[i] = -1;
  }
}

/** Persistence for deltas: in-memory for tests, IndexedDB in the browser, a server later. */
export interface DeltaStore {
  get(key: string): Promise<ChunkDelta | undefined>;
  set(key: string, delta: ChunkDelta): Promise<void>;
}

export class MemoryDeltaStore implements DeltaStore {
  private readonly map = new Map<string, ChunkDelta>();
  async get(key: string) {
    return this.map.get(key);
  }
  async set(key: string, delta: ChunkDelta) {
    this.map.set(key, structuredClone(delta));
  }
}
