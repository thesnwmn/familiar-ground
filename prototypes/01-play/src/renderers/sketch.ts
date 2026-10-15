import { CHUNK_CELLS, Ground, Structure, hashInts, type Chunk } from "@familiar-ground/world-core";
import { createFillCanvas } from "./sample.ts";
import type { Renderer, View } from "./types.ts";

/** Pixels per cell. */
const LEVELS = [
  { scale: 16, speed: 1 },
  { scale: 11, speed: 1 },
  { scale: 7, speed: 0.9 },
  { scale: 4.5, speed: 0.8 },
  { scale: 3, speed: 0.65 },
  { scale: 2, speed: 0.55 },
];

const PAPER = "#f3ead6";
const INK = "#3a2f25";

/** Cached drawing for one chunk, in chunk-local cell coordinates. */
interface ChunkSketch {
  washes: { path: Path2D; fill: string }[];
  roads: Path2D;
  paths: Path2D;
  water: Path2D;
  ripples: Path2D;
  buildings: Path2D;
  hatch: Path2D;
  crossHatch: Path2D;
  trees: Path2D;
  stipple: Path2D;
  walls: Path2D;
  rubble: Path2D;
  labels: { x: number; y: number; text: string }[];
}

/**
 * A hand-drawn map: ink outlines traced around buildings, roads and water (marching squares, with
 * a slight deterministic wobble), hatched buildings, watercolour washes and tree scribbles.
 * Outlines come from the cell grid, so broken buildings and new walls show up immediately.
 */
export class SketchRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly sketches = new Map<Chunk, ChunkSketch>();
  private paper: CanvasPattern | null = null;

  mount(container: HTMLElement): void {
    this.canvas = createFillCanvas(container, false);
    this.ctx = this.canvas.getContext("2d")!;
    this.paper = this.ctx.createPattern(paperTexture(), "repeat");
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  viewRadius(view: View): number {
    return Math.ceil((0.75 * Math.max(this.width, this.height)) / LEVELS[view.zoomLevel]!.scale) + 4;
  }

  chunkChanged(chunk: Chunk): void {
    this.sketches.delete(chunk);
  }

  chunkEvicted(chunk: Chunk): void {
    this.sketches.delete(chunk);
  }

  render(view: View): void {
    const { ctx } = this;
    const { scale } = LEVELS[view.zoomLevel]!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, this.width, this.height);
    if (this.paper) {
      ctx.fillStyle = this.paper;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    const ox = this.width / 2 - (view.player.x + 0.5) * scale;
    const oy = this.height / 2 - (view.player.y + 0.5) * scale;
    const span = CHUNK_CELLS * scale;
    const line = (px: number) => px / scale; // line widths are given in screen pixels

    for (const chunk of view.world.loaded()) {
      const sx = ox + chunk.cx * span;
      const sy = oy + chunk.cy * span;
      if (sx > this.width || sy > this.height || sx + span < 0 || sy + span < 0) continue;
      const sk = this.sketch(chunk);
      ctx.save();
      ctx.setTransform(this.dpr * scale, 0, 0, this.dpr * scale, this.dpr * sx, this.dpr * sy);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const w of sk.washes) {
        ctx.fillStyle = w.fill;
        ctx.fill(w.path);
      }
      ctx.strokeStyle = "rgba(60,110,160,0.55)";
      ctx.lineWidth = line(1);
      if (scale >= 4) ctx.stroke(sk.ripples);
      ctx.strokeStyle = "rgba(40,90,140,0.9)";
      ctx.lineWidth = line(1.3);
      ctx.stroke(sk.water);
      ctx.strokeStyle = "rgba(90,120,70,0.7)";
      ctx.lineWidth = line(1);
      if (scale >= 4) ctx.stroke(sk.stipple);
      ctx.strokeStyle = INK;
      ctx.lineWidth = line(1.2);
      ctx.stroke(sk.roads);
      ctx.setLineDash([line(3), line(3)]);
      ctx.lineWidth = line(1);
      ctx.stroke(sk.paths);
      ctx.setLineDash([]);
      if (scale >= 3) {
        ctx.strokeStyle = "rgba(58,47,37,0.45)";
        ctx.lineWidth = line(0.8);
        ctx.stroke(sk.hatch);
        ctx.strokeStyle = "rgba(150,60,40,0.55)";
        ctx.stroke(sk.crossHatch);
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = line(1.5);
      ctx.stroke(sk.buildings);
      ctx.strokeStyle = "rgba(50,80,40,0.85)";
      ctx.lineWidth = line(1);
      ctx.stroke(sk.trees);
      ctx.strokeStyle = "rgba(90,70,50,0.8)";
      ctx.stroke(sk.rubble);
      ctx.fillStyle = INK;
      ctx.fill(sk.walls);
      ctx.restore();
      if (scale >= 7) {
        ctx.fillStyle = "rgba(58,47,37,0.85)";
        ctx.font = `italic ${Math.round(Math.min(15, scale * 1.1))}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = "center";
        for (const l of sk.labels) ctx.fillText(l.text, sx + (l.x + 0.5) * scale, sy + l.y * scale - 2);
      }
    }
    this.drawPlayer(this.width / 2, this.height / 2, scale);
  }

  private drawPlayer(x: number, y: number, scale: number): void {
    const { ctx } = this;
    const r = Math.max(4, scale * 0.6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#b3261e";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 1.6, y);
    ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6);
    ctx.lineTo(x, y + r * 1.6);
    ctx.stroke();
  }

  private sketch(chunk: Chunk): ChunkSketch {
    let sk = this.sketches.get(chunk);
    if (sk) return sk;
    sk = buildSketch(chunk);
    this.sketches.set(chunk, sk);
    return sk;
  }

  destroy(): void {
    this.canvas.remove();
    this.sketches.clear();
  }
}

function buildSketch(chunk: Chunk): ChunkSketch {
  const n = chunk.size;
  const gx0 = chunk.cx * n;
  const gy0 = chunk.cy * n;
  const g = (x: number, y: number) => chunk.ground[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const st = (x: number, y: number) => chunk.structure[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const rand = (x: number, y: number, salt: number) => hashInts(gx0 + x, gy0 + y, salt) / 4294967296;

  const isRoad = (x: number, y: number) => {
    if (st(x, y) === Structure.BUILDING) return false;
    const v = g(x, y);
    return v === Ground.ROAD_MAJOR || v === Ground.ROAD_MINOR || v === Ground.RAIL || v === Ground.PAVED;
  };
  const sk: ChunkSketch = {
    washes: [
      { path: runs(n, (x, y) => g(x, y) === Ground.WATER), fill: "rgba(120,170,215,0.45)" },
      { path: runs(n, (x, y) => ([Ground.PARK, Ground.FOREST, Ground.WETLAND] as number[]).includes(g(x, y))), fill: "rgba(140,180,110,0.28)" },
      { path: runs(n, (x, y) => g(x, y) === Ground.FARMLAND), fill: "rgba(210,190,120,0.25)" },
      { path: runs(n, (x, y) => g(x, y) === Ground.ROAD_MAJOR), fill: "rgba(240,225,190,0.9)" },
      { path: runs(n, (x, y) => st(x, y) === Structure.BUILDING), fill: "rgba(205,170,120,0.35)" },
    ],
    roads: contour(n, isRoad, gx0, gy0),
    paths: contour(n, (x, y) => g(x, y) === Ground.PATH, gx0, gy0),
    water: contour(n, (x, y) => g(x, y) === Ground.WATER, gx0, gy0),
    buildings: contour(n, (x, y) => st(x, y) === Structure.BUILDING, gx0, gy0),
    ripples: new Path2D(),
    hatch: new Path2D(),
    crossHatch: new Path2D(),
    trees: new Path2D(),
    stipple: new Path2D(),
    walls: new Path2D(),
    rubble: new Path2D(),
    labels: [],
  };

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const s = chunk.structure[i];
      const ground = chunk.ground[i];
      if (s === Structure.BUILDING) {
        // Diagonal hatching aligned to global diagonals, so it runs continuously across cells.
        if ((gx0 + x + gy0 + y) % 2 === 0) {
          sk.hatch.moveTo(x, y + 1);
          sk.hatch.lineTo(x + 1, y);
        }
        const b = chunk.buildings[chunk.building[i]!];
        if (b && b.kind !== "building" && (gx0 + x - gy0 - y) % 2 === 0) {
          sk.crossHatch.moveTo(x, y);
          sk.crossHatch.lineTo(x + 1, y + 1);
        }
      } else if (s === Structure.TREE) {
        const r = 0.45 + rand(x, y, 3) * 0.3;
        const cx = x + 0.5 + (rand(x, y, 4) - 0.5) * 0.4;
        const cy = y + 0.5 + (rand(x, y, 5) - 0.5) * 0.4;
        sk.trees.moveTo(cx + r, cy);
        // A loose, slightly open loop reads as hand-drawn.
        sk.trees.arc(cx, cy, r, 0, Math.PI * 1.85);
      } else if (s === Structure.WALL) {
        sk.walls.rect(x + 0.1, y + 0.1, 0.8, 0.8);
      } else if (ground === Ground.WATER && rand(x, y, 6) < 0.05) {
        sk.ripples.moveTo(x, y + 0.5);
        sk.ripples.quadraticCurveTo(x + 0.5, y + 0.1, x + 1, y + 0.5);
        sk.ripples.quadraticCurveTo(x + 1.5, y + 0.9, x + 2, y + 0.5);
      } else if ((ground === Ground.GRASS || ground === Ground.PARK) && rand(x, y, 7) < 0.04) {
        sk.stipple.moveTo(x + 0.4, y + 0.5);
        sk.stipple.lineTo(x + 0.5, y + 0.3);
        sk.stipple.lineTo(x + 0.6, y + 0.5);
      } else if (ground === Ground.FARMLAND && (gy0 + y) % 3 === 0 && rand(x, y, 8) < 0.6) {
        sk.stipple.moveTo(x, y + 0.5);
        sk.stipple.lineTo(x + 1, y + 0.5);
      } else if (ground === Ground.RUBBLE) {
        const a = rand(x, y, 9) * Math.PI;
        sk.rubble.moveTo(x + 0.5 - Math.cos(a) * 0.3, y + 0.5 - Math.sin(a) * 0.3);
        sk.rubble.lineTo(x + 0.5 + Math.cos(a) * 0.3, y + 0.5 + Math.sin(a) * 0.3);
      }
    }
  }

  // Label named buildings once each (at their first cell), and free-standing POIs.
  const seen = new Set<number>();
  for (let i = 0; i < n * n; i++) {
    const bi = chunk.building[i]!;
    const b = chunk.buildings[bi];
    if (bi >= 0 && b?.name && !seen.has(bi)) {
      seen.add(bi);
      sk.labels.push({ x: i % n, y: Math.floor(i / n), text: b.name });
    }
  }
  for (const p of chunk.pois) if (p.name && chunk.building[p.y * n + p.x]! < 0) sk.labels.push({ x: p.x, y: p.y, text: p.name });
  return sk;
}

/** Filled rectangles for horizontal runs of matching cells: cheap area fills. */
function runs(n: number, match: (x: number, y: number) => boolean): Path2D {
  const p = new Path2D();
  for (let y = 0; y < n; y++) {
    let start = -1;
    for (let x = 0; x <= n; x++) {
      const m = x < n && match(x, y);
      if (m && start < 0) start = x;
      if (!m && start >= 0) {
        p.rect(start, y, x - start, 1);
        start = -1;
      }
    }
  }
  return p;
}

/**
 * Marching squares over cell centres: traces the boundary of a mask as short segments with
 * 45° corners. Vertices get a small wobble derived from their global position, so segments that
 * share an endpoint still meet, and neighbouring chunks agree along their edges.
 */
function contour(n: number, inside: (x: number, y: number) => boolean, gx0: number, gy0: number): Path2D {
  const p = new Path2D();
  const wob = (x: number, y: number, salt: number) => ((hashInts(Math.round((gx0 + x) * 2), Math.round((gy0 + y) * 2), salt) / 4294967296) - 0.5) * 0.22;
  const pt = (x: number, y: number): [number, number] => [x + wob(x, y, 11), y + wob(x, y, 12)];
  const seg = (ax: number, ay: number, bx: number, by: number) => {
    const [x1, y1] = pt(ax, ay);
    const [x2, y2] = pt(bx, by);
    p.moveTo(x1, y1);
    p.lineTo(x2, y2);
  };
  // Cells outside the chunk are treated as matching their nearest edge cell, so no lines appear at chunk borders.
  const m = (x: number, y: number) => (inside(Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))) ? 1 : 0);
  for (let y = -1; y < n; y++) {
    for (let x = -1; x < n; x++) {
      const tl = m(x, y), tr = m(x + 1, y), br = m(x + 1, y + 1), bl = m(x, y + 1);
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      // Square corners are the centres of the four cells; edge midpoints lie on cell boundaries.
      const x0 = x + 0.5, y0 = y + 0.5;
      const top: [number, number] = [x0 + 0.5, y0];
      const right: [number, number] = [x0 + 1, y0 + 0.5];
      const bottom: [number, number] = [x0 + 0.5, y0 + 1];
      const left: [number, number] = [x0, y0 + 0.5];
      const S = (a: [number, number], b: [number, number]) => seg(a[0], a[1], b[0], b[1]);
      switch (c) {
        case 1: case 14: S(left, bottom); break;
        case 2: case 13: S(bottom, right); break;
        case 3: case 12: S(left, right); break;
        case 4: case 11: S(top, right); break;
        case 6: case 9: S(top, bottom); break;
        case 7: case 8: S(left, top); break;
        case 5: S(left, top); S(bottom, right); break;
        case 10: S(top, right); S(left, bottom); break;
      }
    }
  }
  return p;
}

function paperTexture(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    const v = hashInts(i, 77) / 4294967296;
    img.data.set([120, 100, 70, v < 0.5 ? 0 : Math.floor((v - 0.5) * 22)], i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
