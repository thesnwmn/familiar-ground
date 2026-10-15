import type { Chunk } from "@familiar-ground/world-core";

const cache = new WeakMap<Chunk, Map<number, string>>();

/** The POI label at a chunk cell, if any (cached per chunk). */
export function poiAt(chunk: Chunk, i: number): string | undefined {
  let m = cache.get(chunk);
  if (!m) {
    m = new Map(chunk.pois.map((p) => [p.y * chunk.size + p.x, p.name ?? p.subclass ?? p.cls]));
    cache.set(chunk, m);
  }
  return m.get(i);
}
