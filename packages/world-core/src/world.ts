import { CHUNK_CELLS, chunkKey, type Chunk } from "./chunk.ts";
import { applyDelta, emptyDelta, recordEdit, type CellLayer, type ChunkDelta, type DeltaStore } from "./delta.ts";
import type { ChunkProvider } from "./provider.ts";

/**
 * The live, mutable world around the player: loaded chunks plus player changes.
 * Positions are global cell coordinates: gx = cx * CHUNK_CELLS + x.
 */
export class World {
  private readonly chunks = new Map<string, Chunk>();
  private readonly loading = new Map<string, Promise<Chunk>>();
  private readonly deltas = new Map<string, ChunkDelta>();

  constructor(
    private readonly provider: ChunkProvider,
    private readonly store: DeltaStore,
    /** Namespaces saved deltas, e.g. by seed and data version. */
    private readonly storePrefix = "",
    private readonly onLoad?: (chunk: Chunk) => void,
  ) {}

  get loadedCount(): number {
    return this.chunks.size;
  }

  getChunk(cx: number, cy: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cy));
  }

  load(cx: number, cy: number): Promise<Chunk> {
    const key = chunkKey(cx, cy);
    const loaded = this.chunks.get(key);
    if (loaded) return Promise.resolve(loaded);
    let p = this.loading.get(key);
    if (!p) {
      p = Promise.all([this.provider(cx, cy), this.store.get(this.storePrefix + key)]).then(([chunk, delta]) => {
        const d = delta ?? emptyDelta(cx, cy);
        applyDelta(chunk, d);
        this.deltas.set(key, d);
        this.chunks.set(key, chunk);
        this.loading.delete(key);
        this.onLoad?.(chunk);
        return chunk;
      });
      p.catch(() => this.loading.delete(key));
      this.loading.set(key, p);
    }
    return p;
  }

  /** Loads every chunk within `radius` cells of a global cell position. */
  ensureAround(gx: number, gy: number, radius: number): Promise<Chunk[]> {
    const jobs: Promise<Chunk>[] = [];
    const [cx0, cy0] = [Math.floor((gx - radius) / CHUNK_CELLS), Math.floor((gy - radius) / CHUNK_CELLS)];
    const [cx1, cy1] = [Math.floor((gx + radius) / CHUNK_CELLS), Math.floor((gy + radius) / CHUNK_CELLS)];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) jobs.push(this.load(cx, cy));
    return Promise.all(jobs);
  }

  /** Drops chunks further than `radius` cells away. Their deltas are already persisted. */
  evictBeyond(gx: number, gy: number, radius: number): void {
    for (const [key, c] of this.chunks) {
      const nearX = Math.max(c.cx * CHUNK_CELLS, Math.min(gx, (c.cx + 1) * CHUNK_CELLS));
      const nearY = Math.max(c.cy * CHUNK_CELLS, Math.min(gy, (c.cy + 1) * CHUNK_CELLS));
      if (Math.abs(nearX - gx) > radius || Math.abs(nearY - gy) > radius) {
        this.chunks.delete(key);
        this.deltas.delete(key);
      }
    }
  }

  /** The loaded chunk and cell index at a global cell position, if loaded. */
  cell(gx: number, gy: number): { chunk: Chunk; i: number } | undefined {
    const cx = Math.floor(gx / CHUNK_CELLS);
    const cy = Math.floor(gy / CHUNK_CELLS);
    const chunk = this.chunks.get(chunkKey(cx, cy));
    if (!chunk) return undefined;
    return { chunk, i: (gy - cy * CHUNK_CELLS) * chunk.size + (gx - cx * CHUNK_CELLS) };
  }

  /** Changes one cell and saves the change. Returns false if the chunk isn't loaded. */
  edit(gx: number, gy: number, layer: CellLayer, value: number): boolean {
    const c = this.cell(gx, gy);
    if (!c) return false;
    const key = chunkKey(c.chunk.cx, c.chunk.cy);
    const delta = this.deltas.get(key)!;
    c.chunk[layer][c.i] = value;
    if (layer === "structure") c.chunk.building[c.i] = -1;
    recordEdit(delta, layer, c.i, value);
    void this.store.set(this.storePrefix + key, delta);
    return true;
  }
}
