import { Ground, Structure, hashInts, type Point, type World } from "@familiar-ground/world-core";
import type { Scene, SceneBuilding, SceneRoad } from "../../../../02-gallery/src/scene.ts";
import { CellSampler } from "../sample.ts";
import { sample, type RGB, type Tex, type Textures } from "./textures.ts";

/**
 * Lumen HD tile baking. Geometry (roads, footprints, walls, shadows, kerbs, markings) is drawn as
 * smooth vector shapes at full screen resolution, so diagonal streets are clean lines, never
 * staircases. The pixel-art feel comes from the materials: every surface is textured with chunky
 * texels (T per cell), and props and people are pixel sprites.
 */

/** Texels per cell for textures and sprites (a cell is ~1.5 m, so a texel is ~19 cm). */
export const T = 8;
/** Cells per baked tile. */
export const TILE = 8;
/** Texels per building floor in the oblique view. */
export const FLOOR = 7;

export type LightKind = "lamp" | "window" | "sign" | "door";
/** A light, in world cell coordinates. */
export interface Lamp {
  x: number;
  y: number;
  r: number;
  color: RGB;
  kind: LightKind;
  phase: number;
}
/** Smoke or steam source: world cell coordinates of the roof point, plus its height in texels. */
export interface Emitter {
  x: number;
  y: number;
  lift: number;
  kind: "smoke" | "steam";
  phase: number;
}
/** A tree's base in world cells; the canopy is drawn live so it can sway. Radius in texels. */
export interface TreeSpot {
  x: number;
  y: number;
  radius: number;
  variant: number;
}

export interface TileBake {
  tx: number;
  ty: number;
  /** Pixels per cell this tile was baked at. */
  P: number;
  ground: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  /** Buildings and props: everything that stands up. */
  top: HTMLCanvasElement;
  /** Emissive pixels (lamp heads, lit windows, signs), shown in the dark. */
  glow: HTMLCanvasElement;
  water: HTMLCanvasElement | null;
  /** Some water points (world cells, x/y pairs) for glints. */
  waterPts: number[];
  lights: Lamp[];
  emitters: Emitter[];
  trees: TreeSpot[];
  /** Pavement / plaza spots where pigeons gather (world cells). */
  perches: Point[];
}

export interface BakeMood {
  /** Sun shadow length per unit of height (x, y). */
  sun: [number, number];
  wet: boolean;
  /** Chance a window is lit. */
  litWindows: number;
}

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;

enum M {
  PAVE, PLAZA, GRASS, PARK, FOREST, FARM, SAND, WATER, RUBBLE, DIRT,
}
function material(g: number): M {
  switch (g) {
    case Ground.WATER: case Ground.ICE: return M.WATER;
    case Ground.PARK: return M.PARK;
    case Ground.GRASS: case Ground.WETLAND: return M.GRASS;
    case Ground.FOREST: return M.FOREST;
    case Ground.FARMLAND: return M.FARM;
    case Ground.SAND: return M.SAND;
    case Ground.PAVED: return M.PLAZA;
    case Ground.RUBBLE: return M.RUBBLE;
    case Ground.ROCK: case Ground.RAIL: return M.DIRT;
    default: return M.PAVE;
  }
}
const isGreen = (m: M) => m === M.GRASS || m === M.PARK || m === M.FOREST || m === M.FARM;

export const NEON: RGB[] = [[90, 240, 230], [255, 110, 190], [255, 196, 90], [170, 140, 255], [120, 255, 140]];
export const CAR_COLORS: RGB[] = [[200, 50, 50], [40, 80, 160], [220, 220, 220], [40, 40, 44], [200, 170, 60], [90, 140, 90], [150, 150, 158], [110, 40, 50]];
const css = (c: RGB, k = 1, a = 1) => `rgba(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0},${a})`;

/** `sc` is the vector data around the player; it must cover this tile and a margin (tall buildings to the south). */
export function bakeTile(world: World, seed: number, tex: Textures, tx: number, ty: number, P: number, mood: BakeMood, sc: Scene): TileBake {
  const k = P / T;
  const S = TILE * P;
  const ox = tx * TILE;
  const oy = ty * TILE;
  const X = (gx: number) => (gx - ox) * P;
  const Y = (gy: number) => (gy - oy) * P;
  const cells = new CellSampler(world);
  const inTile = (gx: number, gy: number) => gx >= ox && gy >= oy && gx < ox + TILE && gy < oy + TILE;
  const near = (gx: number, gy: number, m = 3) => gx >= ox - m && gy >= oy - m && gx < ox + TILE + m && gy < oy + TILE + m;

  // --- Ground: smooth-edged materials from the cell grid, textured with chunky texels ---
  const G = TILE + 2;
  const mat = new Uint8Array(G * G);
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) mat[y * G + x] = material(cells.ground(ox + x - 1, oy + y - 1));
  const carRoads = sc.roads.filter((r) => r.ground === Ground.ROAD_MAJOR || r.ground === Ground.ROAD_MINOR);
  const roadMask = mask(S, (ctx) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const r of carRoads) stroke(ctx, r.points, X, Y, r.width * P + 3 * k, "rgb(0,0,255)"); // kerbs
    for (const r of carRoads) stroke(ctx, r.points, X, Y, r.width * P, r.ground === Ground.ROAD_MAJOR ? "rgb(0,255,0)" : "rgb(255,0,0)");
  });
  const pathMask = mask(S, (ctx) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const r of sc.roads) {
      if (r.ground === Ground.PATH) stroke(ctx, r.points, X, Y, Math.max(P * 0.9, r.width * P * 0.8), "rgb(255,0,0)");
      if (r.ground === Ground.RAIL) stroke(ctx, r.points, X, Y, P * 1.8, "rgb(0,255,0)");
    }
  });

  const ground = canvas(S);
  const gctx = ground.getContext("2d", { willReadFrequently: true })!;
  const img = gctx.createImageData(S, S);
  const d = img.data;
  const water = new Uint8Array(S * S);
  let anyWater = false;
  const waterPts: number[] = [];
  const TEX: Record<M, Tex> = {
    [M.PAVE]: tex.pavement, [M.PLAZA]: tex.plaza, [M.GRASS]: tex.grass, [M.PARK]: tex.park, [M.FOREST]: tex.forest, [M.FARM]: tex.farm,
    [M.SAND]: tex.sand, [M.WATER]: tex.water, [M.RUBBLE]: tex.rubble, [M.DIRT]: tex.dirt,
  };
  const c: RGB = [0, 0, 0];
  const c2: RGB = [0, 0, 0];
  const votes = new Float32Array(10);
  const tox = ox * T;
  const toy = oy * T;
  for (let v = 0; v < S; v++) {
    const fy = (v + 0.5) / P + 0.5; // in the padded grid, relative to cell centres
    const cy = Math.floor(fy);
    const ay = fy - cy;
    const ty0 = toy + Math.floor(v / k);
    for (let u = 0; u < S; u++) {
      const o = (v * S + u) * 4;
      const fx = (u + 0.5) / P + 0.5;
      const cx = Math.floor(fx);
      const ax = fx - cx;
      const twx = tox + Math.floor(u / k);
      const m00 = mat[cy * G + cx]! as M, m10 = mat[cy * G + cx + 1]! as M, m01 = mat[(cy + 1) * G + cx]! as M, m11 = mat[(cy + 1) * G + cx + 1]! as M;
      const own = mat[(Math.floor(v / P) + 1) * G + Math.floor(u / P) + 1]! as M;
      let best = own;
      if (own !== M.RUBBLE && !(m00 === m10 && m00 === m01 && m00 === m11)) {
        // Bilinear vote between the four nearest cell centres, with low-frequency noise for organic edges.
        votes.fill(0);
        votes[m00] = votes[m00]! + (1 - ax) * (1 - ay);
        votes[m10] = votes[m10]! + ax * (1 - ay);
        votes[m01] = votes[m01]! + (1 - ax) * ay;
        votes[m11] = votes[m11]! + ax * ay;
        const jitter = (r01(twx >> 2, ty0 >> 2, 77) - 0.5) * 0.25;
        let bw = -1;
        for (let m = 0; m < 10; m++) {
          if (!votes[m]) continue;
          const w = votes[m]! + (m === M.PAVE || m === M.RUBBLE ? 0 : jitter) + (m === own ? 0.01 : 0);
          if (w > bw) (bw = w), (best = m);
        }
      } else if (own !== M.RUBBLE) best = m00;
      sample(TEX[best], twx, ty0, c);
      if (best === M.WATER) {
        water[v * S + u] = 1;
        anyWater = true;
        if (u % P === 0 && v % P === 0 && r01(twx, ty0, 78) < 0.3) waterPts.push((u + 0.5) / P + ox, (v + 0.5) / P + oy);
      } else if (best === M.PARK && r01(twx, ty0, 79) < 0.004) {
        const fc = NEON[Math.floor(r01(twx, ty0, 80) * NEON.length)]!; // flowers
        (c[0] = fc[0]), (c[1] = fc[1]), (c[2] = fc[2]);
      }
      // Paths and rail ballast, then kerbs and tarmac, blended by their anti-aliased coverage.
      const pa = pathMask[o + 3]! / 255;
      if (pa > 0) {
        if (pathMask[o]! > pathMask[o + 1]!) sample(isGreen(best) ? tex.dirt : tex.plaza, twx, ty0, c2);
        else (sample(tex.dirt, twx, ty0, c2), (c2[0] *= 0.7), (c2[1] *= 0.7), (c2[2] *= 0.7));
        blend(c, c2, pa);
      }
      const ra = roadMask[o + 3]! / 255;
      if (ra > 0) {
        const g = roadMask[o + 1]!, r = roadMask[o]!, b = roadMask[o + 2]!;
        const sum = g + r + b || 1;
        if (b > 0) {
          c2[0] = c2[1] = 188;
          c2[2] = 178;
          if ((twx + ty0) % 6 === 0) (c2[0] = c2[1] = 160), (c2[2] = 150);
          blend(c, c2, (ra * b) / sum);
        }
        if (r + g > 0) {
          sample(g > r ? tex.tarmacMajor : tex.tarmac, twx, ty0, c2);
          blend(c, c2, Math.min(1, (ra * (r + g)) / sum * (b > 0 ? 1 : 1)));
        }
      }
      if (mood.wet && best !== M.WATER) (c[0] *= 0.8), (c[1] *= 0.82), (c[2] *= 0.88);
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  gctx.putImageData(img, 0, 0);

  // Ground details: lane markings, zebra crossings, manholes, rails, puddles.
  gctx.lineCap = "butt";
  for (const r of carRoads) {
    if (r.ground === Ground.ROAD_MAJOR || r.width >= 4) {
      gctx.setLineDash([5 * k, 5 * k]);
      stroke(gctx, r.points, X, Y, Math.max(1, k * 0.8), r.ground === Ground.ROAD_MAJOR ? "#e8d870" : "#e6e2d4");
      gctx.setLineDash([]);
      // Edge lines just inside the kerbs.
      for (const side of [-1, 1]) stroke(gctx, offsetLine(r.points, side * (r.width / 2 - 0.35)), X, Y, Math.max(1, k * 0.5), "rgba(230,226,212,0.55)");
    }
    const h = hashInts(Math.round(r.points[0]!.x), Math.round(r.points[0]!.y), 3);
    along(r.points, 11, h, (p, _n, i) => {
      if (r01(h, i, 1) < 0.35) manhole(gctx, X(p.x), Y(p.y), k);
    });
  }
  for (const r of sc.roads) {
    if (r.ground !== Ground.RAIL) continue;
    along(r.points, 0.45, 0, (p, n) => {
      gctx.strokeStyle = "#5a4232";
      gctx.lineWidth = k * 1.2;
      gctx.beginPath();
      gctx.moveTo(X(p.x - n.x * 0.65), Y(p.y - n.y * 0.65));
      gctx.lineTo(X(p.x + n.x * 0.65), Y(p.y + n.y * 0.65));
      gctx.stroke();
    });
    for (const off of [-0.38, 0.38]) stroke(gctx, offsetLine(r.points, off), X, Y, k * 0.8, "#b8bcc4");
  }
  zebras(gctx, sc.roads, X, Y, P);
  if (mood.wet) puddles(gctx, ox, oy, cells, P, k);

  // --- Shadows, buildings, props ---
  const shadow = canvas(S);
  const sh = shadow.getContext("2d")!;
  const top = canvas(S);
  const tc = top.getContext("2d", { willReadFrequently: true })!;
  const glow = canvas(S);
  const gl = glow.getContext("2d")!;
  const lights: Lamp[] = [];
  const emitters: Emitter[] = [];
  const trees: TreeSpot[] = [];
  const perches: Point[] = [];
  tc.imageSmoothingEnabled = false;
  const R = (ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), Math.ceil(w * k), Math.ceil(h * k));
  };

  const buildings = sc.buildings.filter((b) => {
    const bb = bbox(b);
    return bb.minX < ox + TILE + 2 && bb.maxX > ox - 2 && bb.minY < oy + TILE + 50 && bb.maxY > oy - 2;
  });
  buildings.sort((a, b) => bbox(a).maxY - bbox(b).maxY);
  sh.fillStyle = "#000";
  for (const b of buildings) {
    const h = heightOf(b) * k;
    for (let s = 0; s <= 8; s++) {
      sh.save();
      sh.translate((h * mood.sun[0] * s) / 8, (h * mood.sun[1] * s) / 8);
      ringPath(sh, b.rings, X, Y);
      sh.fill("evenodd");
      sh.restore();
    }
  }
  // Player edits (rubble where buildings were broken, walls where they were built), trees, perches.
  for (let gy = oy - 1; gy <= oy + TILE; gy++)
    for (let gx = ox - 1; gx <= ox + TILE; gx++) {
      const g = cells.ground(gx, gy);
      const s = cells.structure(gx, gy);
      const x = X(gx);
      const y = Y(gy);
      if (g === Ground.RUBBLE && s === Structure.NONE) {
        for (let i = 0; i < 5; i++) R(tc, x, y, Math.floor(r01(gx, gy, i) * 6), Math.floor(r01(gx, gy, i + 9) * 6) - 1, 2 + (i % 2), 2, ["#8a7f72", "#a0948a", "#6a625a", "#9a6a52", "#b0a498"][i]!);
      } else if (s === Structure.WALL) {
        R(tc, x, y, 0, -5, T, T, "#7a6e64");
        R(tc, x, y, 0, -6, T, 6, "#a89a8a");
        R(tc, x, y, 0, T - 6, T, 1, "#5c524a");
        sh.fillRect(x + 2 * k, y, P, P);
      }
      if (!inTile(gx, gy)) continue;
      if (s === Structure.TREE || (g === Ground.FOREST && s === Structure.NONE && (gx + gy * 3) % 4 === 0)) {
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => cells.structure(gx + dx!, gy + dy!) === Structure.TREE).length;
        if (s === Structure.TREE && nb >= 3 && ((gx + gy) % 2 || r01(gx, gy, 5) > 0.75)) continue;
        if (s !== Structure.TREE && r01(gx, gy, 6) > 0.7) continue;
        trees.push({ x: gx + 0.5 + (r01(gx, gy, 7) - 0.5) * 0.6, y: gy + 0.7 + (r01(gx, gy, 8) - 0.5) * 0.4, radius: 6 + Math.floor(r01(gx, gy, 9) * 5) + (g === Ground.FOREST ? 2 : 0), variant: Math.floor(r01(gx, gy, 10) * 4) });
      }
      if ((g === Ground.PAVED || g === Ground.URBAN) && s === Structure.NONE && r01(gx, gy, seed, 11) < (g === Ground.PAVED ? 0.02 : 0.003)) perches.push({ x: gx + 0.5, y: gy + 0.5 });
    }

  props();
  for (const t of trees) {
    // Trunk and a soft round shadow.
    const x = X(t.x);
    const y = Y(t.y);
    sh.beginPath();
    sh.ellipse(x + t.radius * k * mood.sun[0] * 1.6, y + t.radius * k * mood.sun[1] * 0.8 - t.radius * k * 0.2, t.radius * k * 0.95, t.radius * k * 0.7, 0, 0, Math.PI * 2);
    sh.fill();
    R(tc, x, y, -1, -8, 2, 8, "#4a3426");
    R(tc, x, y, -1, -8, 1, 8, "#6a4c36");
  }

  let waterCanvas: HTMLCanvasElement | null = null;
  if (anyWater) {
    waterCanvas = canvas(S);
    const w = waterCanvas.getContext("2d")!;
    const wi = w.createImageData(S, S);
    for (let i = 0; i < water.length; i++) if (water[i]) wi.data[i * 4 + 3] = 255;
    w.putImageData(wi, 0, 0);
  }
  return { tx, ty, P, ground, shadow, top, glow, water: waterCanvas, waterPts, lights, emitters, trees, perches };

  // --- helpers that draw into this tile ---

  function props(): void {
    for (const r of carRoads) {
      const h = hashInts(Math.round(r.points[0]!.x * 4), Math.round(r.points[0]!.y * 4), r.points.length);
      // Pavement furniture on both sides.
      along(r.points, 3, h, (p, n, i, dir) => {
        for (const side of [-1, 1]) {
          const off = r.width / 2 + 0.9;
          const gx = p.x + n.x * off * side;
          const gy = p.y + n.y * off * side;
          if (!near(gx, gy)) continue;
          const g = cells.ground(Math.floor(gx), Math.floor(gy));
          const s = cells.structure(Math.floor(gx), Math.floor(gy));
          if (s !== Structure.NONE || (g !== Ground.URBAN && g !== Ground.PAVED && g !== Ground.GRASS)) continue;
          const what = r01(h, i, side + 5);
          const x = X(gx);
          const y = Y(gy);
          if ((i + (side > 0 ? 3 : 0)) % 6 === 0) lampPost(x, y, gx, gy, h + i);
          else if (what < 0.1 && g !== Ground.GRASS) {
            if (inTile(gx, gy)) trees.push({ x: gx, y: gy, radius: 6 + Math.floor(r01(h, i, 9) * 3), variant: Math.floor(r01(h, i, 10) * 4) });
            R(tc, x, y, -2, -2, 4, 4, "#4a3a2c"); // tree pit
            R(tc, x, y, -2, -2, 4, 1, "#6a6a70");
          } else if (what < 0.17) {
            R(tc, x, y, -1, -3, 3, 3, "#24402c"); // bin
            R(tc, x, y, -1, -4, 3, 1, "#3e6a48");
            R(tc, x, y, -1, 0, 3, 1, "rgba(0,0,0,0.3)");
          } else if (what < 0.21) bench(x, y, dir);
          else if (what < 0.25) {
            for (const bx of [-2, 2]) {
              R(tc, x, y, bx, -2, 1, 2, "#2a2a2e"); // bollards
              R(tc, x, y, bx, -3, 1, 1, "#e8e8e8");
            }
          } else if (what < 0.27) {
            R(tc, x, y, -1, -4, 3, 4, "#b8282a"); // post box
            R(tc, x, y, -1, -5, 3, 1, "#e04848");
            R(tc, x, y, -1, -3, 3, 1, "#300");
          } else if (what < 0.28) {
            R(tc, x, y, -2, -7, 4, 7, "#a82024"); // phone box
            R(tc, x, y, -2, -9, 4, 2, "#d84040");
            R(tc, x, y, -1, -6, 2, 4, "#e8e0b0");
            R(gl, x, y, -1, -8, 2, 1, "rgb(255,240,200)");
          } else if (what < 0.32) {
            R(tc, x, y, -2, -2, 5, 2, "#6c4a32"); // planter
            R(tc, x, y, -2, -4, 5, 2, "#4c8a3c");
            R(tc, x, y, 0, -4, 1, 1, "#e05a6a");
          } else if (what < 0.34) for (let j = 0; j < 3; j++) R(tc, x, y, -2 + j * 2, -2, 1, 2, "#9a9ca4"); // bike rack
        }
      });
      // Parked cars along quieter streets.
      if (r.ground === Ground.ROAD_MINOR && r.width >= 3) {
        along(r.points, 2.6, h + 1, (p, n, i, dir, s, len) => {
          if (s < 4 || s > len - 4 || crossing(p, r)) return; // keep junctions clear
          for (const side of [-1, 1]) {
            if (r01(h, i, side + 20) > 0.45) continue;
            const off = r.width / 2 - 0.7;
            const gx = p.x + n.x * off * side;
            const gy = p.y + n.y * off * side;
            if (!near(gx, gy, 3)) continue;
            drawCar(tc, sh, X(gx), Y(gy), Math.atan2(dir.y, dir.x), CAR_COLORS[Math.floor(r01(h, i, side + 30) * CAR_COLORS.length)]!, k);
          }
        });
      }
    }
  }

  /** Near another car road (a junction)? */
  function crossing(p: Point, self: SceneRoad): boolean {
    for (const o of carRoads) {
      if (o === self) continue;
      for (let i = 0; i + 1 < o.points.length; i++) {
        const a = o.points[i]!, c = o.points[i + 1]!;
        const ex = c.x - a.x, ey = c.y - a.y;
        const l2 = ex * ex + ey * ey || 1;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
        if (Math.hypot(a.x + ex * t - p.x, a.y + ey * t - p.y) < o.width / 2 + 2.5) return true;
      }
    }
    return false;
  }

  function lampPost(x: number, y: number, gx: number, gy: number, salt: number): void {
    sh.fillRect(x, y - k * 0.5, 7 * k, k); // long thin shadow
    R(tc, x, y, -1, -1, 2, 2, "#2a2a30");
    R(tc, x, y, -0.5, -13, 1, 13, "#3c3c44");
    R(tc, x, y, -1.5, -14, 3, 1, "#3c3c44");
    R(gl, x, y, -1.5, -13, 3, 1, "rgb(255,236,190)");
    if (inTile(gx, gy)) lights.push({ x: gx, y: gy, r: 6.5, color: [255, 196, 130], kind: "lamp", phase: r01(salt, 1) });
  }
  function bench(x: number, y: number, dir: Point): void {
    if (Math.abs(dir.x) > Math.abs(dir.y)) {
      R(tc, x, y, -3, -2, 6, 1, "#7a5436");
      R(tc, x, y, -3, -1, 6, 1, "#9a6c46");
      R(tc, x, y, -3, 0, 6, 1, "rgba(0,0,0,0.3)");
    } else {
      R(tc, x, y, -1, -4, 1, 6, "#7a5436");
      R(tc, x, y, 0, -4, 1, 6, "#9a6c46");
    }
  }
}

/** A car seen from above, drawn smoothly at any angle (also used for moving traffic). */
export function drawCar(tc: CanvasRenderingContext2D, sh: CanvasRenderingContext2D | null, x: number, y: number, ang: number, col: RGB, k: number, lights = false): void {
  if (sh) {
    sh.save();
    sh.translate(x + 2 * k, y + 2 * k);
    sh.rotate(ang);
    roundRect(sh, -10 * k, -4.5 * k, 20 * k, 9 * k, 3 * k);
    sh.fill();
    sh.restore();
  }
  tc.save();
  tc.translate(x, y);
  tc.rotate(ang);
  tc.fillStyle = css(col, 0.65);
  roundRect(tc, -10 * k, -4.5 * k, 20 * k, 9 * k, 3 * k);
  tc.fill();
  tc.fillStyle = css(col);
  roundRect(tc, -10 * k, -4.5 * k, 20 * k, 7.5 * k, 3 * k);
  tc.fill();
  tc.fillStyle = "#2a3644";
  roundRect(tc, -6 * k, -3.5 * k, 3 * k, 6 * k, k); // rear window
  tc.fill();
  roundRect(tc, 3 * k, -3.5 * k, 3 * k, 6 * k, k); // windscreen
  tc.fill();
  tc.fillStyle = css(col, 1.12);
  roundRect(tc, -3 * k, -3.2 * k, 6 * k, 5.4 * k, k); // roof
  tc.fill();
  tc.fillStyle = "rgba(255,255,255,0.35)";
  tc.fillRect(-2.5 * k, -3 * k, 5 * k, 0.8 * k);
  tc.fillStyle = lights ? "#fffbe0" : "#d8d8c8";
  tc.fillRect(9 * k, -3.5 * k, k, 1.5 * k);
  tc.fillRect(9 * k, 1.5 * k, k, 1.5 * k);
  tc.fillStyle = lights ? "#ff3030" : "#902020";
  tc.fillRect(-10 * k, -3.5 * k, k, 1.5 * k);
  tc.fillRect(-10 * k, 1.5 * k, k, 1.5 * k);
  tc.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function heightOf(b: SceneBuilding): number {
  return Math.round(Math.min(b.levels, 12) * FLOOR);
}

const boxes = new WeakMap<SceneBuilding, { minX: number; minY: number; maxX: number; maxY: number }>();
export function bbox(b: SceneBuilding) {
  let r = boxes.get(b);
  if (!r) {
    r = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const p of b.rings[0]!) (r.minX = Math.min(r.minX, p.x)), (r.minY = Math.min(r.minY, p.y)), (r.maxX = Math.max(r.maxX, p.x)), (r.maxY = Math.max(r.maxY, p.y));
    boxes.set(b, r);
  }
  return r;
}

function canvas(s: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  return c;
}

function blend(c: RGB, d: RGB, a: number): void {
  c[0] += (d[0] - c[0]) * a;
  c[1] += (d[1] - c[1]) * a;
  c[2] += (d[2] - c[2]) * a;
}

/** Draws into a scratch canvas and returns its pixels. */
function mask(S: number, draw: (ctx: CanvasRenderingContext2D) => void): Uint8ClampedArray {
  const c = canvas(S);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  draw(ctx);
  return ctx.getImageData(0, 0, S, S).data;
}

function stroke(ctx: CanvasRenderingContext2D, pts: Point[], X: (x: number) => number, Y: (y: number) => number, width: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
  ctx.stroke();
}

function ringPath(ctx: CanvasRenderingContext2D, rings: Point[][], X: (x: number) => number, Y: (y: number) => number): void {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
  }
}

/** A polyline shifted sideways by `d` cells (mitred at the joints). */
export function offsetLine(pts: Point[], d: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out.push({ x: pts[i]!.x - ((b.y - a.y) / len) * d, y: pts[i]!.y + ((b.x - a.x) / len) * d });
  }
  return out;
}

/** Calls fn at regular steps (in cells) along a polyline, with the unit normal and direction. */
export function along(pts: Point[], step: number, salt: number, fn: (p: Point, n: Point, k: number, dir: Point, s: number, len: number) => void): void {
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  let done = 0;
  let carry = step * (0.3 + r01(salt, 99) * 0.7);
  let k = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -dir.y, y: dir.x };
    while (carry < len) {
      fn({ x: a.x + dir.x * carry, y: a.y + dir.y * carry }, n, k++, dir, done + carry, total);
      carry += step;
    }
    carry -= len;
    done += len;
  }
}

function manhole(ctx: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  ctx.fillStyle = "#2c2c30";
  ctx.beginPath();
  ctx.arc(x, y, 1.8 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#56565c";
  ctx.lineWidth = Math.max(1, k * 0.5);
  ctx.beginPath();
  ctx.arc(x, y, 1.1 * k, 0, Math.PI * 2);
  ctx.stroke();
}

/** Zebra crossings where footpaths cross car roads. */
function zebras(ctx: CanvasRenderingContext2D, roads: SceneRoad[], X: (x: number) => number, Y: (y: number) => number, P: number): void {
  const paths = roads.filter((r) => r.ground === Ground.PATH);
  const cars = roads.filter((r) => r.ground === Ground.ROAD_MAJOR || r.ground === Ground.ROAD_MINOR);
  ctx.fillStyle = "#eeeae0";
  for (const p of paths)
    for (let i = 0; i + 1 < p.points.length; i++)
      for (const c of cars)
        for (let j = 0; j + 1 < c.points.length; j++) {
          const hit = intersect(p.points[i]!, p.points[i + 1]!, c.points[j]!, c.points[j + 1]!);
          if (!hit) continue;
          const a = c.points[j]!, b = c.points[j + 1]!;
          ctx.save();
          ctx.translate(X(hit.x), Y(hit.y));
          ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
          for (let s = -c.width / 2 + 0.3; s < c.width / 2 - 0.3; s += 0.5) ctx.fillRect(-0.9 * P, s * P, 1.8 * P, 0.25 * P);
          ctx.restore();
        }
}

function intersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + r.x * t, y: a.y + r.y * t } : null;
}

/** Rain puddles: darker, reflective patches on pavements and roads. */
function puddles(ctx: CanvasRenderingContext2D, ox: number, oy: number, cells: CellSampler, P: number, k: number): void {
  for (let gy = oy; gy < oy + TILE; gy++)
    for (let gx = ox; gx < ox + TILE; gx++) {
      if (r01(gx, gy, 31) > 0.025) continue;
      const g = cells.ground(gx, gy);
      if (cells.structure(gx, gy) !== Structure.NONE || g === Ground.WATER || g === Ground.FOREST) continue;
      const x = (gx - ox + 0.5) * P;
      const y = (gy - oy + 0.5) * P;
      ctx.fillStyle = "rgba(30,40,60,0.55)";
      ctx.beginPath();
      ctx.ellipse(x, y, (3 + r01(gx, gy, 32) * 6) * k, (2 + r01(gx, gy, 33) * 2.5) * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160,180,210,0.3)";
      ctx.fillRect(x - 2 * k, y - k, 3 * k, k * 0.7);
    }
}

export function pointIn(ring: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
