import { buildChunk, CHUNK_ZOOM, dataTileFor, type Chunk } from "./chunk.ts";
import type { Classifier } from "./classify.ts";
import { decodeTile, type MapFeature } from "./features.ts";
import type { TileSource } from "./source.ts";

/** Produces the generated (pre-delta) chunk for given chunk coords. */
export type ChunkProvider = (cx: number, cy: number) => Promise<Chunk>;

export interface ChunkProviderOptions {
  source: TileSource;
  seed: number;
  classify?: Classifier;
  /** Data zoom to request; defaults to min(source.maxZoom, 14). */
  dataZoom?: number;
  /** How many decoded data tiles to keep in memory. */
  cacheSize?: number;
}

/**
 * Fetches and decodes data tiles (cached, de-duplicated) and builds chunks from them.
 * Has no DOM dependency, so it can run in a Web Worker.
 */
export function createChunkProvider(opts: ChunkProviderOptions): ChunkProvider {
  const dataZoom = Math.min(opts.dataZoom ?? 14, opts.source.maxZoom, CHUNK_ZOOM);
  const cacheSize = opts.cacheSize ?? 16;
  const tiles = new Map<string, Promise<MapFeature[]>>();

  const getFeatures = (z: number, x: number, y: number): Promise<MapFeature[]> => {
    const key = `${z}/${x}/${y}`;
    let p = tiles.get(key);
    if (p) {
      tiles.delete(key); // refresh LRU position
    } else {
      p = opts.source.getTile(z, x, y).then((data) => (data ? decodeTile(data) : []));
      p.catch(() => tiles.delete(key)); // let failed tiles be retried
    }
    tiles.set(key, p);
    while (tiles.size > cacheSize) tiles.delete(tiles.keys().next().value!);
    return p;
  };

  return async (cx, cy) => {
    const t = dataTileFor(cx, cy, dataZoom);
    const features = await getFeatures(t.z, t.x, t.y);
    return buildChunk({ cx, cy, seed: opts.seed, dataZoom, features, classify: opts.classify });
  };
}
