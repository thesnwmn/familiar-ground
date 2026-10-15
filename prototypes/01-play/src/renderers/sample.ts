import { CHUNK_CELLS, hashInts, type Chunk, type World } from "@familiar-ground/world-core";

/**
 * Fast cell lookups for render loops: remembers the last chunk, so scanning a row of cells
 * only does a map lookup when it crosses a chunk edge.
 */
export class CellSampler {
  chunk: Chunk | undefined;
  i = 0;
  private cx = NaN;
  private cy = NaN;

  constructor(private readonly world: World) {}

  /** Points `chunk`/`i` at a global cell. Returns false when that chunk isn't loaded. */
  at(gx: number, gy: number): boolean {
    const cx = Math.floor(gx / CHUNK_CELLS);
    const cy = Math.floor(gy / CHUNK_CELLS);
    if (cx !== this.cx || cy !== this.cy) {
      this.cx = cx;
      this.cy = cy;
      this.chunk = this.world.getChunk(cx, cy);
    }
    if (!this.chunk) return false;
    this.i = (gy - cy * CHUNK_CELLS) * CHUNK_CELLS + (gx - cx * CHUNK_CELLS);
    return true;
  }

  ground(gx: number, gy: number): number {
    return this.at(gx, gy) ? this.chunk!.ground[this.i]! : -1;
  }

  structure(gx: number, gy: number): number {
    return this.at(gx, gy) ? this.chunk!.structure[this.i]! : -1;
  }
}

/** Stable per-cell variety in [0, 1), independent of the world seed (purely visual). */
export const cellNoise = (gx: number, gy: number, salt = 0) => hashInts(gx, gy, salt) / 4294967296;

/** A canvas that fills its container, sized in CSS pixels times `scale`. */
export function createFillCanvas(container: HTMLElement, pixelated: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "fill";
  if (pixelated) canvas.style.imageRendering = "pixelated";
  container.append(canvas);
  return canvas;
}
