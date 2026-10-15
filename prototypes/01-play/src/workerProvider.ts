import type { Chunk, ChunkProvider } from "@familiar-ground/world-core";
import type { WorkerRequest, WorkerResponse } from "./chunk.worker.ts";

/** A ChunkProvider that fetches, decodes and builds chunks off the main thread. */
export function createWorkerProvider(tilesUrl: string | undefined, seed: number): ChunkProvider {
  const worker = new Worker(new URL("./chunk.worker.ts", import.meta.url), { type: "module" });
  const pending = new Map<number, { resolve: (c: Chunk) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const res = e.data;
    const p = pending.get(res.id);
    if (!p) return;
    pending.delete(res.id);
    if ("error" in res) p.reject(new Error(res.error));
    else p.resolve(res.chunk);
  };
  const post = (msg: WorkerRequest) => worker.postMessage(msg);
  post({ type: "init", tilesUrl, seed });

  return (cx, cy) =>
    new Promise<Chunk>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      post({ type: "chunk", id, cx, cy });
    });
}
