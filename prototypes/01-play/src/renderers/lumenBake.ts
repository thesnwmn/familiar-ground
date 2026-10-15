import { Biome, Ground, Structure, biomeAt, type Chunk, type RoadLine } from "@familiar-ground/world-core";
import { GROUND_RGB } from "../palette.ts";

/** Texels per cell side: 4×4 texels per cell (~40 cm each) leaves room for kerbs, paint and tiles. */
export const T = 4;

export type RGB = [number, number, number];

export const LightKind = { LAMP: 0, WINDOW: 1, SIGN: 2, FUNGUS: 3 } as const;
export type LightKind = (typeof LightKind)[keyof typeof LightKind];

export interface Light {
  /** Global cell coordinates of the light's centre. */
  x: number;
  y: number;
  /** Radius in cells. */
  r: number;
  color: RGB;
  kind: LightKind;
  intensity: number;
  phase: number;
}

/** A glowing texel, in chunk-local texel coordinates. Kept as a list: most of a chunk doesn't glow. */
export interface Glow {
  x: number;
  y: number;
  color: string;
}

/** Everything about a chunk that doesn't move: baked once, redrawn every frame. */
export interface Baked {
  albedo: HTMLCanvasElement;
  glows: Glow[];
  lights: Light[];
  /** Biome per cell, so per-frame effects (canopies, particles) don't recompute noise. */
  biome: Uint8Array;
}

/** Fast integer hash → [0, 1), inlined for the per-texel loops. */
function rand(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const GREENISH = new Set<number>([Ground.GRASS, Ground.PARK, Ground.FOREST, Ground.WETLAND, Ground.FARMLAND]);
const isRoad = (g: number) => g === Ground.ROAD_MINOR || g === Ground.ROAD_MAJOR;

/** Ground colour per biome: the real map decides what the ground is, the biome decides how it looks. */
export function groundColor(g: Ground, biome: Biome): RGB {
  let c = GROUND_RGB[g];
  if (isRoad(g)) c = [62, 60, 64];
  if (g === Ground.WATER) c = [34, 74, 128];
  const green = GREENISH.has(g);
  switch (biome) {
    case Biome.OVERGROWN:
      if (green) c = scale(mix(c, [40, 120, 50], 0.4), 0.95);
      else if (g === Ground.URBAN || g === Ground.PAVED) c = mix(c, [80, 110, 70], 0.3);
      break;
    case Biome.FUNGAL:
      if (green) c = mix(c, [30, 70, 90], 0.6);
      else if (g === Ground.URBAN || g === Ground.PAVED) c = mix(c, [60, 60, 90], 0.3);
      if (g === Ground.WATER) c = [30, 50, 110];
      break;
    case Biome.AUTUMN:
      if (green) c = mix(c, [150, 110, 50], 0.45);
      break;
    case Biome.FROST:
      if (g === Ground.WATER) c = [120, 160, 200];
      else if (!isRoad(g)) c = mix(c, [230, 238, 248], 0.75);
      else c = mix(c, [200, 210, 225], 0.25);
      break;
  }
  return c;
}

const ROOF: Record<Biome, RGB> = {
  [Biome.TEMPERATE]: [96, 76, 68],
  [Biome.OVERGROWN]: [70, 78, 60],
  [Biome.FUNGAL]: [66, 60, 86],
  [Biome.AUTUMN]: [108, 72, 54],
  [Biome.FROST]: [150, 160, 176],
};
const RIM: Record<Biome, RGB> = {
  [Biome.TEMPERATE]: [176, 150, 120],
  [Biome.OVERGROWN]: [90, 150, 70],
  [Biome.FUNGAL]: [130, 110, 170],
  [Biome.AUTUMN]: [200, 140, 90],
  [Biome.FROST]: [240, 246, 255],
};
const LAMP: Record<Biome, RGB> = {
  [Biome.TEMPERATE]: [255, 196, 120],
  [Biome.OVERGROWN]: [230, 220, 140],
  [Biome.FUNGAL]: [150, 230, 255],
  [Biome.AUTUMN]: [255, 160, 80],
  [Biome.FROST]: [210, 230, 255],
};
const SIGNS: RGB[] = [
  [80, 230, 220],
  [255, 110, 180],
  [255, 190, 80],
  [160, 130, 255],
];
const FLOWERS: RGB[] = [
  [230, 70, 70],
  [250, 210, 80],
  [240, 140, 200],
  [170, 120, 240],
];
const PAINT: RGB = [226, 224, 210];
const PAINT_FROST: RGB = [250, 250, 255];

/** Lamp spacing: one candidate per square of this many cells (divides the chunk size, so squares never straddle chunks). */
const LAMP_GRID = 32;
/** Road classes that get a dashed centre line. */
const CENTRE_LINE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
const EDGE_LINES = new Set(["motorway", "trunk"]);

export function bakeChunk(chunk: Chunk, seed: number, withBiomes = true): Baked {
  const n = chunk.size;
  const size = n * T;
  const gx0 = chunk.cx * n;
  const gy0 = chunk.cy * n;
  const albedo = new ImageData(size, size);
  const a32 = new Uint32Array(albedo.data.buffer);
  const pack = (c: RGB) =>
    ((255 << 24) | (Math.max(0, Math.min(255, c[2])) << 16) | (Math.max(0, Math.min(255, c[1])) << 8) | Math.max(0, Math.min(255, c[0]))) >>> 0;
  const lights: Light[] = [];
  const glows: Glow[] = [];

  // Biome per cell, with jittered sampling so zone borders dither like pixel art instead of running straight.
  const biome = new Uint8Array(n * n);
  if (withBiomes) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const jx = (rand(gx0 + x, gy0 + y, 31) - 0.5) * 12;
        const jy = (rand(gx0 + x, gy0 + y, 32) - 0.5) * 12;
        biome[y * n + x] = biomeAt(seed, gx0 + x + jx, gy0 + y + jy);
      }
    }
  }

  const g = (x: number, y: number) => chunk.ground[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const st = (x: number, y: number) => chunk.structure[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const setA = (tx: number, ty: number, c: RGB) => {
    if (tx >= 0 && ty >= 0 && tx < size && ty < size) a32[ty * size + tx] = pack(c);
  };
  const glow = (tx: number, ty: number, c: RGB, a = 1) => glows.push({ x: tx, y: ty, color: css(c, a) });

  const lampBest = new Map<number, { score: number; x: number; y: number }>();

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const gx = gx0 + x;
      const gy = gy0 + y;
      const b = biome[i] as Biome;
      const ground = chunk.ground[i] as Ground;
      const s = chunk.structure[i]!;
      // Pavements: urban land within two cells of a road is paved; the rest reads as yards and gardens.
      let pavement = ground === Ground.PAVED;
      if (ground === Ground.URBAN) {
        for (let dy = -2; dy <= 2 && !pavement; dy++) for (let dx = -2; dx <= 2 && !pavement; dx++) pavement = isRoad(g(x + dx, y + dy));
      }
      const base = ground === Ground.URBAN && !pavement ? mix(groundColor(ground, b), groundColor(Ground.GRASS, b), 0.35) : groundColor(ground, b);
      const bx = x * T;
      const by = y * T;

      // Ground texture.
      for (let ty = 0; ty < T; ty++) {
        for (let tx = 0; tx < T; tx++) {
          const r = rand(gx * T + tx, gy * T + ty, 1);
          let k = 0.9 + r * 0.2;
          if (GREENISH.has(ground) && r > 0.86) k = 1.18; // grass blades catching the light
          if (ground === Ground.FARMLAND && (gy * T + ty) % 3 === 0) k = 0.8; // furrows
          if (pavement && ((gx * T + tx) % 8 === 0 || (gy * T + ty) % 8 === 0)) k = 0.86; // paving slabs
          else if (ground === Ground.URBAN && r > 0.9) k = 1.15; // tufts in yards
          if (ground === Ground.RAIL) {
            const along = (gy * T + ty) % 3 === 0;
            setA(bx + tx, by + ty, along ? [96, 70, 50] : scale(base, k));
            continue;
          }
          setA(bx + tx, by + ty, scale(base, k));
        }
      }
      if ((ground === Ground.GRASS || ground === Ground.PARK) && s === Structure.NONE && b !== Biome.FROST && rand(gx, gy, 2) < 0.04) {
        const fx = bx + Math.floor(rand(gx, gy, 3) * 3);
        const fy = by + Math.floor(rand(gx, gy, 5) * 3);
        const c = FLOWERS[Math.floor(rand(gx, gy, 4) * FLOWERS.length)]!;
        setA(fx, fy, c);
        setA(fx + 1, fy + 1, scale(c, 0.7));
      }
      if (isRoad(ground)) {
        // Kerb: one light texel along edges that meet something that isn't road.
        const kerb: RGB = b === Biome.FROST ? [220, 228, 240] : [128, 124, 120];
        if (!isRoad(g(x, y - 1))) for (let t = 0; t < T; t++) setA(bx + t, by, kerb);
        if (!isRoad(g(x, y + 1))) for (let t = 0; t < T; t++) setA(bx + t, by + T - 1, kerb);
        if (!isRoad(g(x - 1, y))) for (let t = 0; t < T; t++) setA(bx, by + t, kerb);
        if (!isRoad(g(x + 1, y))) for (let t = 0; t < T; t++) setA(bx + T - 1, by + t, kerb);
        if (rand(gx, gy, 19) < 0.01) setA(bx + 1, by + 2, [40, 38, 42]); // pothole / crack
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ng = g(nx, ny);
          if (isRoad(ng) || ng === Ground.WATER || st(nx, ny) !== Structure.NONE) continue;
          const key = Math.floor((gx0 + nx) / LAMP_GRID) * 100003 + Math.floor((gy0 + ny) / LAMP_GRID);
          const score = rand(gx0 + nx, gy0 + ny, seed + 5);
          const best = lampBest.get(key);
          if (!best || score < best.score) lampBest.set(key, { score, x: nx, y: ny });
        }
      }
      if (ground === Ground.RUBBLE) {
        for (let t = 0; t < T * T; t++) {
          if (rand(gx * T + (t % T), gy * T + Math.floor(t / T), 6) < 0.45) {
            setA(bx + (t % T), by + Math.floor(t / T), rand(gx, gy * 16 + t, 7) < 0.5 ? [150, 140, 130] : [70, 62, 56]);
          }
        }
      }

      if (s === Structure.BUILDING) {
        // Dark roof with tile rows, and a lighter rim where it meets open ground (like lit rock edges).
        const named = chunk.buildings[chunk.building[i]!]?.kind !== "building";
        const roof = named ? mix(ROOF[b], [130, 96, 64], 0.45) : ROOF[b];
        const rim = RIM[b];
        const open = (dx: number, dy: number) => st(x + dx, y + dy) !== Structure.BUILDING;
        const [oN, oS, oW, oE] = [open(0, -1), open(0, 1), open(-1, 0), open(1, 0)];
        for (let ty = 0; ty < T; ty++) {
          for (let tx = 0; tx < T; tx++) {
            const r = rand(gx * T + tx, gy * T + ty, 8);
            let c = scale(roof, ((gy * T + ty) % 2 === 0 ? 0.92 : 1.04) * (0.92 + r * 0.16));
            const edge = (ty === 0 && oN) || (ty === T - 1 && oS) || (tx === 0 && oW) || (tx === T - 1 && oE);
            if (edge) {
              c = scale(rim, 0.85 + r * 0.3);
              if (b === Biome.OVERGROWN && r < 0.4) c = [60, 150, 60];
            } else if ((ty === 1 && oN) || (ty === T - 2 && oS) || (tx === 1 && oW) || (tx === T - 2 && oE)) {
              c = scale(roof, 0.7); // shadow just inside the rim gives the edge some depth
            }
            setA(bx + tx, by + ty, c);
          }
        }
        // A few lit windows along outside walls.
        if ((oN || oS || oW || oE) && rand(gx, gy, seed + 11) < 0.05) {
          const warm: RGB = b === Biome.FROST ? [255, 236, 190] : [255, 214, 130];
          const wx = oW ? bx : oE ? bx + T - 1 : bx + 1;
          const wy = oN ? by : oS ? by + T - 1 : by + 1;
          glow(wx, wy, warm);
          glow(wx + (oN || oS ? 1 : 0), wy + (oW || oE ? 1 : 0), warm);
          lights.push({ x: gx + 0.5, y: gy + 0.5, r: 3.5, color: warm, kind: LightKind.WINDOW, intensity: 0.55, phase: rand(gx, gy, 12) });
        }
      } else if (s === Structure.WALL) {
        for (let ty = 0; ty < T; ty++) {
          for (let tx = 0; tx < T; tx++) {
            const mortar = ty % 2 === 1 || (tx + (Math.floor(ty / 2) % 2) * 2) % 4 === 0;
            setA(bx + tx, by + ty, mortar ? [104, 98, 94] : [158, 152, 146]);
          }
        }
      } else if (s === Structure.TREE) {
        setA(bx + 1, by + 3, [70, 48, 30]); // trunk; the canopy is drawn (and sways) per frame
        setA(bx + 2, by + 3, [58, 40, 26]);
      }

      // Glowing fungi in fungal zones.
      if (b === Biome.FUNGAL && s === Structure.NONE && GREENISH.has(ground) && rand(gx, gy, seed + 13) < 0.02) {
        const c: RGB = rand(gx, gy, 14) < 0.6 ? [90, 240, 230] : [190, 120, 255];
        setA(bx + 2, by + 2, [200, 200, 190]); // stalk
        setA(bx + 2, by + 3, [200, 200, 190]);
        glow(bx + 1, by + 1, c);
        glow(bx + 2, by + 1, c);
        glow(bx + 3, by + 1, c, 0.7);
        lights.push({ x: gx + 0.5, y: gy + 0.5, r: 2.6, color: c, kind: LightKind.FUNGUS, intensity: 0.7, phase: rand(gx, gy, 15) });
      }
    }
  }

  paintRoadMarkings(chunk, biome, setA, (x, y) => isRoad(g(x, y)) && st(x, y) === Structure.NONE);

  // Street lamps: the best sidewalk cell per square, for most squares.
  for (const [key, best] of lampBest) {
    if (rand(key, seed, 16) > 0.8) continue;
    const gx = gx0 + best.x;
    const gy = gy0 + best.y;
    const b = biome[best.y * n + best.x] as Biome;
    const bx = best.x * T;
    const by = best.y * T;
    setA(bx + 1, by + 2, [44, 44, 48]); // post and base
    setA(bx + 1, by + 3, [44, 44, 48]);
    setA(bx + 2, by + 3, [70, 70, 74]);
    glow(bx + 1, by + 1, [255, 250, 230]);
    glow(bx + 2, by + 1, [255, 240, 200], 0.8);
    lights.push({ x: gx + 0.4, y: gy + 0.3, r: 9, color: LAMP[b], kind: LightKind.LAMP, intensity: 0.95, phase: rand(gx, gy, 17) });
  }

  // Shop signs: neon on buildings that contain a named place.
  for (const p of chunk.pois) {
    const i = p.y * n + p.x;
    if (chunk.building[i]! < 0) continue;
    const c = SIGNS[Math.floor(rand(gx0 + p.x, gy0 + p.y, 18) * SIGNS.length)]!;
    for (let t = 0; t < 3; t++) glow(p.x * T + t, p.y * T + 1, c, t === 1 ? 1 : 0.8);
    lights.push({ x: gx0 + p.x + 0.5, y: gy0 + p.y + 0.5, r: 6, color: c, kind: LightKind.SIGN, intensity: 0.9, phase: rand(p.x, p.y, 18) });
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.putImageData(albedo, 0, 0);
  return { albedo: canvas, glows, lights, biome };
}

/**
 * Road paint from the real centre lines: dashed centre lines on bigger roads, edge lines and lane
 * dashes on motorways and trunk roads, and zebra crossings wherever a mapped footpath crosses a road.
 * Paint only lands on open road cells, so it never covers buildings and stops at the kerb.
 */
function paintRoadMarkings(
  chunk: Chunk,
  biome: Uint8Array,
  setA: (tx: number, ty: number, c: RGB) => void,
  paintable: (x: number, y: number) => boolean,
): void {
  const n = chunk.size;
  const put = (px: number, py: number) => {
    const cx = Math.floor(px);
    const cy = Math.floor(py);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n || !paintable(cx, cy)) return;
    setA(Math.floor(px * T), Math.floor(py * T), biome[cy * n + cx] === Biome.FROST ? PAINT_FROST : PAINT);
  };
  const roads = chunk.roads.filter((r) => isRoad(r.ground));

  for (const road of roads) {
    const offsets: { off: number; dash: [number, number] | null }[] = [];
    if (CENTRE_LINE.has(road.cls) && road.width >= 4) offsets.push({ off: 0, dash: [2, 2] });
    if (EDGE_LINES.has(road.cls)) {
      const edge = road.width / 2 - 0.6;
      offsets.push({ off: -edge, dash: null }, { off: edge, dash: null });
      if (road.width >= 9) offsets.push({ off: -road.width / 4, dash: [1.5, 2.5] }, { off: road.width / 4, dash: [1.5, 2.5] });
    }
    if (!offsets.length) continue;
    for (const { off, dash } of offsets) walk(road, off, dash, put);
  }

  // Zebra crossings where a footpath crosses a road.
  const paths = chunk.roads.filter((r) => r.ground === Ground.PATH);
  for (const path of paths) {
    for (const road of roads) {
      if (road.width < 3) continue;
      for (let i = 0; i + 1 < path.points.length; i++) {
        for (let j = 0; j + 1 < road.points.length; j++) {
          const hit = intersect(path.points[i]!, path.points[i + 1]!, road.points[j]!, road.points[j + 1]!);
          if (hit) zebra(hit, road.points[j]!, road.points[j + 1]!, road.width, put);
        }
      }
    }
  }
}

/** Walks a line offset sideways by `off` cells, calling put() along it (dashed by arc length if `dash` is given). */
function walk(road: RoadLine, off: number, dash: [number, number] | null, put: (x: number, y: number) => void): void {
  let along = 0;
  const step = 0.5 / T;
  for (let i = 0; i + 1 < road.points.length; i++) {
    const a = road.points[i]!;
    const b = road.points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const dx = (b.x - a.x) / len;
    const dy = (b.y - a.y) / len;
    for (let s = 0; s < len; s += step) {
      const d = along + s;
      if (!dash || d % (dash[0] + dash[1]) < dash[0]) put(a.x + dx * s - dy * off, a.y + dy * s + dx * off);
    }
    along += len;
  }
}

function intersect(p1: { x: number; y: number }, p2: { x: number; y: number }, q1: { x: number; y: number }, q2: { x: number; y: number }) {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: q2.x - q1.x, y: q2.y - q1.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q1.x - p1.x) * s.y - (q1.y - p1.y) * s.x) / denom;
  const u = ((q1.x - p1.x) * r.y - (q1.y - p1.y) * r.x) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: p1.x + t * r.x, y: p1.y + t * r.y } : null;
}

/** Stripes parallel to the traffic, laid across the road around the crossing point. */
function zebra(at: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, width: number, put: (x: number, y: number) => void): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const d = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const nrm = { x: -d.y, y: d.x };
  const half = width / 2 - 0.4;
  const step = 0.5 / T;
  for (let v = -half; v <= half; v += step) {
    if (Math.floor((v + 100) * 2) % 2 !== 0) continue; // half-cell stripes, half-cell gaps
    for (let u = -1.1; u <= 1.1; u += step) put(at.x + d.x * u + nrm.x * v, at.y + d.y * u + nrm.y * v);
  }
}
