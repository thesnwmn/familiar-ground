/// <reference lib="webworker" />
import { createChunkProvider, openSource, type Chunk, type ChunkProvider } from "@familiar-ground/world-core";

export type WorkerRequest =
  | { type: "init"; tilesUrl?: string; seed: number }
  | { type: "chunk"; id: number; cx: number; cy: number };
export type WorkerResponse = { id: number; chunk: Chunk } | { id: number; error: string };

let provider: Promise<ChunkProvider> | undefined;

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    provider = openSource(msg.tilesUrl).then((source) => createChunkProvider({ source, seed: msg.seed }));
    return;
  }
  try {
    if (!provider) throw new Error("worker not initialised");
    const chunk = await (await provider)(msg.cx, msg.cy);
    const res: WorkerResponse = { id: msg.id, chunk };
    self.postMessage(res, [chunk.ground.buffer, chunk.structure.buffer, chunk.building.buffer]);
  } catch (err) {
    const res: WorkerResponse = { id: msg.id, error: String(err) };
    self.postMessage(res);
  }
};
