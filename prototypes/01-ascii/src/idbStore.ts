import type { ChunkDelta, DeltaStore } from "@familiar-ground/world-core";
import { createStore, get, set } from "idb-keyval";

/** Saves player changes in IndexedDB. Falls back to memory if storage is unavailable (e.g. private mode). */
export function createIdbDeltaStore(): DeltaStore {
  const memory = new Map<string, ChunkDelta>();
  let store: ReturnType<typeof createStore> | undefined;
  try {
    store = createStore("familiar-ground", "chunk-deltas");
  } catch {
    store = undefined;
  }
  return {
    async get(key) {
      if (memory.has(key)) return memory.get(key);
      try {
        return store ? await get<ChunkDelta>(key, store) : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, delta) {
      memory.set(key, structuredClone(delta));
      try {
        if (store) await set(key, delta, store);
      } catch {
        // keep the in-memory copy only
      }
    },
  };
}
