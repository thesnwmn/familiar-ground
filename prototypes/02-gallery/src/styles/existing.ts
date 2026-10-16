import type { Chunk } from "@familiar-ground/world-core";
import type { Renderer, View } from "../../../01-play/src/renderers/types.ts";
import { STYLES as GAME_STYLES } from "../../../01-play/src/styles.ts";
import type { Scene } from "../scene.ts";
import type { StillStyle } from "./types.ts";

/** Approximate on-screen pixels per cell for each zoom level of each game renderer. */
const PX_PER_CELL: Record<string, number[]> = {
  ascii: [33, 25, 19, 14, 10, 5, 2.5],
  pixel: [64, 48, 32, 24, 16, 8, 4, 2, 1],
  iso: [78, 56, 39, 28, 20, 12.6, 8.4, 5.6],
  sketch: [40, 28, 20, 16, 11, 7, 4.5, 3, 2],
  lumen: [40, 28, 20, 16, 12, 8, 4],
  "lumen-biomes": [40, 28, 20, 16, 12, 8, 4],
  voxel: [29, 19, 12, 7.5, 4.5, 2.7, 1.7],
  lowpoly: [26, 16, 10, 6.4, 3.9, 2.5, 1.6],
};

const BLURBS: Record<string, string> = {
  ascii: "Roguelike glyphs, one cell per character.",
  pixel: "Procedural 8×8 tiles in a 3/4 view.",
  iso: "SimCity-style isometric columns.",
  sketch: "Hand-drawn ink map traced from the grid.",
  lumen: "Lit pixels: lamps, windows, neon, swaying trees.",
  "lumen-biomes": "Lumen plus fantasy biome zones.",
  voxel: "Blocky 3D with visible storeys.",
  lowpoly: "Real footprints extruded, pastel 3D.",
};

// One live game renderer at a time (3D ones each hold a WebGL context).
let current: { id: string; r: Renderer; host: HTMLElement; chunks: Set<Chunk> } | null = null;

async function rendererFor(id: string, sc: Scene): Promise<NonNullable<typeof current>> {
  if (current?.id !== id) {
    current?.r.destroy();
    current?.host.remove();
    const info = GAME_STYLES.find((s) => s.id === id)!;
    const r = await info.load();
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;overflow:hidden;";
    document.body.append(host);
    r.mount(host);
    current = { id, r, host, chunks: new Set() };
  }
  const cur = current!;
  cur.host.style.width = `${sc.W}px`;
  cur.host.style.height = `${sc.H}px`;
  for (const chunk of sc.world.loaded()) {
    if (cur.chunks.has(chunk)) continue;
    cur.chunks.add(chunk);
    cur.r.chunkLoaded?.(chunk);
  }
  return cur;
}

export const EXISTING_STYLES: StillStyle[] = GAME_STYLES.map((info) => ({
  id: `game-${info.id}`,
  name: info.label,
  group: "In the game today",
  blurb: BLURBS[info.id] ?? "",
  playable: info.id,
  async draw(sc, ctx) {
    const { r } = await rendererFor(info.id, sc);
    r.resize(sc.W, sc.H);
    const levels = PX_PER_CELL[info.id] ?? [8];
    let zoomLevel = 0;
    levels.forEach((px, i) => {
      if (Math.abs(Math.log(px / sc.scale)) < Math.abs(Math.log(levels[zoomLevel]! / sc.scale))) zoomLevel = i;
    });
    const view: View = { world: sc.world, player: { x: Math.floor(sc.cx), y: Math.floor(sc.cy), fx: 0, fy: 1 }, zoomLevel, seed: sc.seed, angle: 0 };
    // Let renderers that build caches over several frames finish (3D meshes, Lumen bakes).
    for (let i = 0; i < 40; i++) {
      (r as unknown as { last?: number }).last = 0; // Lumen throttles by time; a still doesn't care
      if (r.render(view) !== true) break;
      if (info.id.startsWith("lumen") && i >= 12) break;
    }
    // rot.js (ASCII) paints on its next animation frame; flush it now.
    (r as unknown as { display?: { _tick?: () => void } }).display?._tick?.();
    const src = current!.host.querySelector("canvas");
    if (src) ctx.drawImage(src, 0, 0, sc.W, sc.H);
  },
}));

