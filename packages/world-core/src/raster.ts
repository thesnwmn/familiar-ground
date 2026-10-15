import type { Point } from "./features.ts";

/** Called for each covered cell; coordinates are guaranteed inside 0..size-1. */
export type CellFn = (x: number, y: number) => void;

/**
 * Fills polygon rings with the even-odd rule, sampling at cell centres.
 * Rings are in cell coordinates and may extend beyond the grid.
 */
export function fillPolygon(rings: Point[][], size: number, set: CellFn): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) for (const p of ring) (minY = Math.min(minY, p.y)), (maxY = Math.max(maxY, p.y));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(size - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.y > sy !== b.y > sy) xs.push(a.x + ((sy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const xb = Math.min(size - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = xa; x <= xb; x++) set(x, y);
    }
  }
}

/** Strokes a polyline with round caps: every cell whose centre is within width/2 of the line. */
export function strokeLine(points: Point[], width: number, size: number, set: CellFn): void {
  const r = Math.max(width / 2, 0.5);
  const r2 = r * r;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(a.x, b.x) + r));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(a.y, b.y) + r));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - a.x;
        const py = y + 0.5 - a.y;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - t * dx;
        const ey = py - t * dy;
        if (ex * ex + ey * ey <= r2) set(x, y);
      }
    }
  }
}
