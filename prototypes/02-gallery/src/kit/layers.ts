import { Ground, Structure, type Point } from "@familiar-ground/world-core";
import type { Scene, SceneBuilding, SceneRoad } from "../scene.ts";
import { cellClass, clamp, css, type Cls, type RGB } from "./color.ts";

export type Ctx = CanvasRenderingContext2D;

/** Whether the cell at (gx, gy) is in a building with a known kind (shop, school…). */
export function namedAt(sc: Scene, gx: number, gy: number): boolean {
  const c = sc.at(gx, gy);
  if (!c || c.chunk.structure[c.i] !== Structure.BUILDING) return false;
  const b = c.chunk.buildings[c.chunk.building[c.i]!];
  return !!b && b.kind !== "building";
}

export function clsAt(sc: Scene, gx: number, gy: number): Cls {
  const c = sc.at(gx, gy);
  if (!c) return "void";
  const s = c.chunk.structure[c.i]!;
  const named = s === Structure.BUILDING && c.chunk.buildings[c.chunk.building[c.i]!]?.kind !== "building";
  return cellClass(c.chunk.ground[c.i]!, s, named);
}

/** One colour per cell, scaled up (blocky, or smoothed for a soft look). */
export function paintCells(sc: Scene, ctx: Ctx, color: (cls: Cls, gx: number, gy: number) => RGB | null, smooth = false): void {
  const img = new ImageData(sc.cols, sc.rows);
  for (let y = 0; y < sc.rows; y++) {
    for (let x = 0; x < sc.cols; x++) {
      const c = color(clsAt(sc, sc.gx0 + x, sc.gy0 + y), sc.gx0 + x, sc.gy0 + y);
      if (!c) continue;
      const o = (y * sc.cols + x) * 4;
      img.data[o] = clamp(c[0]);
      img.data[o + 1] = clamp(c[1]);
      img.data[o + 2] = clamp(c[2]);
      img.data[o + 3] = 255;
    }
  }
  const cv = document.createElement("canvas");
  cv.width = sc.cols;
  cv.height = sc.rows;
  cv.getContext("2d")!.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(cv, sc.sx(sc.gx0), sc.sy(sc.gy0), sc.cols * sc.scale, sc.rows * sc.scale);
  ctx.restore();
}

/**
 * Smooth "vector" shapes from the cell grid: the mask is bilinearly interpolated at screen
 * resolution and thresholded, so blocky cells become rounded, anti-aliased areas. Optional
 * wobble makes edges hand-made; optional edge band draws an outline.
 */
export function smoothMask(
  sc: Scene,
  ctx: Ctx,
  mask: (cls: Cls) => boolean,
  fill: RGB | ((x: number, y: number) => RGB),
  opts: { alpha?: number; wobble?: number; edge?: RGB; edgeWidth?: number; grow?: number } = {},
): void {
  const { cols, rows } = sc;
  const field = new Float32Array(cols * rows);
  let any = false;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const m = mask(clsAt(sc, sc.gx0 + x, sc.gy0 + y));
      field[y * cols + x] = m ? 1 : 0;
      any ||= m;
    }
  if (!any) return;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const k = W / sc.W; // canvas may be supersampled
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const scale = sc.scale * k;
  const aa = Math.min(0.5, 0.75 / scale);
  const threshold = 0.5 - (opts.grow ?? 0);
  const edgeBand = opts.edge ? (opts.edgeWidth ?? 1.2) / scale : 0;
  const alpha = opts.alpha ?? 1;
  const wob = opts.wobble ?? 0;
  for (let py = 0; py < H; py++) {
    const gyf = (py + 0.5) / k / sc.scale - sc.H / 2 / sc.scale + sc.cy - sc.gy0 - 0.5;
    for (let px = 0; px < W; px++) {
      let fx = (px + 0.5) / k / sc.scale - sc.W / 2 / sc.scale + sc.cx - sc.gx0 - 0.5;
      let fy = gyf;
      if (wob) {
        fx += Math.sin(fy * 1.7 + fx * 0.3) * wob;
        fy += Math.cos(fx * 1.3 - fy * 0.2) * wob;
      }
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      if (x0 < 0 || y0 < 0 || x0 >= cols - 1 || y0 >= rows - 1) continue;
      const tx = fx - x0;
      const ty = fy - y0;
      const i = y0 * cols + x0;
      const v = (field[i]! * (1 - tx) + field[i + 1]! * tx) * (1 - ty) + (field[i + cols]! * (1 - tx) + field[i + cols + 1]! * tx) * ty;
      if (v <= threshold - aa) continue;
      let a = v >= threshold + aa ? 1 : (v - (threshold - aa)) / (2 * aa);
      let c = typeof fill === "function" ? fill(px / k, py / k) : fill;
      if (opts.edge && v < threshold + edgeBand) c = opts.edge;
      a *= alpha;
      const o = (py * W + px) * 4;
      d[o] = d[o]! + (c[0] - d[o]!) * a;
      d[o + 1] = d[o + 1]! + (c[1] - d[o + 1]!) * a;
      d[o + 2] = d[o + 2]! + (c[2] - d[o + 2]!) * a;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export interface TexelInfo {
  cls: Cls;
  gx: number;
  gy: number;
  /** Texel within the cell, 0..t-1. */
  tx: number;
  ty: number;
  t: number;
  /** Class of a neighbouring cell. */
  n: (dx: number, dy: number) => Cls;
  r: number;
}

/**
 * Pixel art at any density: `tpc` texels per cell (capped so texels never get smaller than
 * `minTexelPx` screen pixels). The shader colours each texel.
 */
export function pixelArt(sc: Scene, ctx: Ctx, shader: (t: TexelInfo) => RGB | null, tpc: number, minTexelPx = 1): void {
  const t = Math.max(1, Math.min(tpc, Math.floor(sc.scale / minTexelPx)));
  const w = sc.cols * t;
  const h = sc.rows * t;
  const img = new ImageData(w, h);
  const clsCache = new Map<number, Cls>();
  const cls = (gx: number, gy: number) => {
    const key = (gy - sc.gy0 + 2) * (sc.cols + 4) + (gx - sc.gx0 + 2);
    let c = clsCache.get(key);
    if (c === undefined) clsCache.set(key, (c = clsAt(sc, gx, gy)));
    return c;
  };
  for (let y = 0; y < sc.rows; y++) {
    for (let x = 0; x < sc.cols; x++) {
      const gx = sc.gx0 + x;
      const gy = sc.gy0 + y;
      const c = cls(gx, gy);
      if (c === "void") continue;
      const info: TexelInfo = { cls: c, gx, gy, tx: 0, ty: 0, t, n: (dx, dy) => cls(gx + dx, gy + dy), r: 0 };
      for (let ty = 0; ty < t; ty++) {
        for (let tx = 0; tx < t; tx++) {
          info.tx = tx;
          info.ty = ty;
          info.r = sc.rand(gx * t + tx, gy * t + ty, 1);
          const col = shader(info);
          if (!col) continue;
          const o = ((y * t + ty) * w + x * t + tx) * 4;
          img.data[o] = clamp(col[0]);
          img.data[o + 1] = clamp(col[1]);
          img.data[o + 2] = clamp(col[2]);
          img.data[o + 3] = 255;
        }
      }
    }
  }
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  cv.getContext("2d")!.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, sc.sx(sc.gx0), sc.sy(sc.gy0), sc.cols * sc.scale, sc.rows * sc.scale);
  ctx.restore();
}

export function tracePath(sc: Scene, ctx: Ctx, pts: Point[], close: boolean): void {
  pts.forEach((p, i) => (i ? ctx.lineTo(sc.sx(p.x), sc.sy(p.y)) : ctx.moveTo(sc.sx(p.x), sc.sy(p.y))));
  if (close) ctx.closePath();
}

export function buildingPath(sc: Scene, ctx: Ctx, b: SceneBuilding): void {
  ctx.beginPath();
  for (const ring of b.rings) tracePath(sc, ctx, ring, true);
}

export interface RoadPaint {
  color: string;
  /** Width multiplier (1 = real width). */
  k?: number;
  /** Extra width in screen pixels. */
  add?: number;
  dash?: number[];
}

/** Roads from their real centre lines: casings first for every road, then fills. */
export function roads(sc: Scene, ctx: Ctx, style: (r: SceneRoad) => { casing?: RoadPaint; fill?: RoadPaint } | null, cap: CanvasLineCap = "round"): void {
  ctx.save();
  ctx.lineCap = cap;
  ctx.lineJoin = "round";
  const styled = sc.roads.map((r) => [r, style(r)] as const).filter(([, s]) => s);
  for (const pass of ["casing", "fill"] as const) {
    for (const [r, s] of styled) {
      const p = s![pass];
      if (!p) continue;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(0.6, r.width * sc.scale * (p.k ?? 1) + (p.add ?? 0));
      ctx.setLineDash(p.dash ?? []);
      ctx.beginPath();
      tracePath(sc, ctx, r.points, false);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export const isMajorRoad = (r: SceneRoad) => r.ground === Ground.ROAD_MAJOR;
export const isCarRoad = (r: SceneRoad) => r.ground === Ground.ROAD_MAJOR || r.ground === Ground.ROAD_MINOR;

/** Footprints from the real map geometry. */
export function buildings(
  sc: Scene,
  ctx: Ctx,
  opts: { fill?: (b: SceneBuilding) => string | null; stroke?: (b: SceneBuilding) => string | null; lineWidth?: number; shadow?: { dx: number; dy: number; color: string } },
): void {
  ctx.save();
  ctx.lineJoin = "round";
  if (opts.shadow) {
    ctx.fillStyle = opts.shadow.color;
    for (const b of sc.buildings) {
      const h = Math.min(30, b.levels);
      ctx.save();
      ctx.translate(opts.shadow.dx * h, opts.shadow.dy * h);
      buildingPath(sc, ctx, b);
      ctx.fill("evenodd");
      ctx.restore();
    }
  }
  for (const b of sc.buildings) {
    buildingPath(sc, ctx, b);
    const f = opts.fill?.(b);
    if (f) {
      ctx.fillStyle = f;
      ctx.fill("evenodd");
    }
    const s = opts.stroke?.(b);
    if (s) {
      ctx.strokeStyle = s;
      ctx.lineWidth = opts.lineWidth ?? 1;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * GTA-style top-down perspective: each building is extruded towards a camera hovering over the
 * centre, so roofs lean outwards and you see the walls facing the middle of the screen.
 */
export function extrude(
  sc: Scene,
  ctx: Ctx,
  opts: {
    roof: (b: SceneBuilding) => string | CanvasPattern;
    wall: (b: SceneBuilding, shade: number) => string;
    outline?: string;
    lineWidth?: number;
    heightK?: number;
    /** Camera height in cells (lower = stronger perspective). */
    camera?: number;
    roofDetail?: (b: SceneBuilding, roofPts: { x: number; y: number }[]) => void;
    windows?: (b: SceneBuilding, quad: { x: number; y: number }[], shade: number) => void;
  },
): void {
  const camH = opts.camera ?? Math.max(90, (sc.W / sc.scale) * 0.75);
  const cx = sc.W / 2;
  const cy = sc.H / 2;
  const items = sc.buildings.map((b) => {
    const h = Math.min(camH * 0.6, b.levels * 2 * (opts.heightK ?? 1));
    return { b, h, d: Math.hypot(sc.sx(b.cx) - cx, sc.sy(b.cy) - cy) };
  });
  items.sort((a, b) => a.h - b.h || b.d - a.d);
  const light = { x: -0.6, y: -0.8 };
  ctx.save();
  ctx.lineJoin = "round";
  for (const { b, h } of items) {
    const k = h / (camH - h);
    const up = (p: Point) => ({ x: sc.sx(p.x) + (sc.sx(p.x) - cx) * k, y: sc.sy(p.y) + (sc.sy(p.y) - cy) * k });
    const outer = b.rings[0]!;
    // Walls (only those facing the camera show, the rest are hidden under the roof).
    for (let i = 0; i < outer.length - 1; i++) {
      const a = outer[i]!;
      const c = outer[i + 1]!;
      const ex = c.x - a.x;
      const ey = c.y - a.y;
      const len = Math.hypot(ex, ey) || 1;
      const shade = 0.55 + 0.45 * Math.max(0, (-ey * light.x + ex * light.y) / len);
      const quad = [{ x: sc.sx(a.x), y: sc.sy(a.y) }, { x: sc.sx(c.x), y: sc.sy(c.y) }, up(c), up(a)];
      ctx.beginPath();
      quad.forEach((p, j) => (j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = opts.wall(b, shade);
      ctx.fill();
      if (opts.outline) {
        ctx.strokeStyle = opts.outline;
        ctx.lineWidth = (opts.lineWidth ?? 1) * 0.6;
        ctx.stroke();
      }
      opts.windows?.(b, quad, shade);
    }
    ctx.beginPath();
    const roofPts: { x: number; y: number }[] = [];
    for (const ring of b.rings) {
      ring.forEach((p, j) => {
        const q = up(p);
        if (ring === outer) roofPts.push(q);
        j ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
    }
    ctx.fillStyle = opts.roof(b);
    ctx.fill("evenodd");
    if (opts.outline) {
      ctx.strokeStyle = opts.outline;
      ctx.lineWidth = opts.lineWidth ?? 1;
      ctx.stroke();
    }
    opts.roofDetail?.(b, roofPts);
  }
  ctx.restore();
}

/** Calls draw for tree cells in view, thinning them out when zoomed far out. */
export function trees(sc: Scene, ctx: Ctx, draw: (x: number, y: number, r: number, rnd: number) => void, density = 1): void {
  const keep = Math.min(1, (sc.scale / 3) * density);
  ctx.save();
  sc.forCells((gx, gy, _g, s) => {
    if (s !== Structure.TREE) return;
    const rnd = sc.rand(gx, gy, 77);
    if (rnd > keep) return;
    const r = Math.max(1.2, sc.scale * (0.9 + rnd * 0.5));
    draw(sc.sx(gx + 0.5), sc.sy(gy + 0.5), r, rnd);
  });
  ctx.restore();
}

/** POI and building names. */
export function labels(sc: Scene, ctx: Ctx, opts: { font: string; color: string; halo?: string; max?: number; upper?: boolean }): void {
  if (sc.scale < 2.5) return;
  ctx.save();
  ctx.font = opts.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let n = 0;
  const placed: { x: number; y: number; w: number }[] = [];
  for (const p of sc.pois) {
    if (!p.name || n >= (opts.max ?? 14)) continue;
    const text = opts.upper ? p.name.toUpperCase() : p.name;
    const x = sc.sx(p.x + 0.5);
    const y = sc.sy(p.y + 0.5);
    const w = ctx.measureText(text).width;
    if (placed.some((q) => Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < 14)) continue;
    placed.push({ x, y, w });
    if (opts.halo) {
      ctx.strokeStyle = opts.halo;
      ctx.lineWidth = 3;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = opts.color;
    ctx.fillText(text, x, y);
    n++;
  }
  ctx.restore();
}

/** Fill the canvas with a flat colour. */
export function bg(ctx: Ctx, color: RGB | string): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = typeof color === "string" ? color : css(color);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}
