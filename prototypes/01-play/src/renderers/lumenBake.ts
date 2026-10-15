import { Biome, Ground, Structure, biomeAt, hashInts, type Chunk } from "@familiar-ground/world-core";
import { GROUND_RGB } from "../palette.ts";

/** Texels per cell side. */
export const T = 2;

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

/** Everything about a chunk that doesn't move: baked once, redrawn every frame. */
export interface Baked {
  albedo: HTMLCanvasElement;
  emissive: HTMLCanvasElement;
  lights: Light[];
  /** Biome per cell, so per-frame effects (canopies, particles) don't recompute noise. */
  biome: Uint8Array;
}

const rand = (gx: number, gy: number, salt: number) => hashInts(gx, gy, salt) / 4294967296;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

const GREENISH = new Set<number>([Ground.GRASS, Ground.PARK, Ground.FOREST, Ground.WETLAND, Ground.FARMLAND]);
const isRoad = (g: number) => g === Ground.ROAD_MINOR || g === Ground.ROAD_MAJOR;

/** Ground colour per biome: the real map decides what the ground is, the biome decides how it looks. */
export function groundColor(g: Ground, biome: Biome): RGB {
  let c = GROUND_RGB[g];
  if (g === Ground.ROAD_MINOR || g === Ground.ROAD_MAJOR) c = [58, 56, 60];
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
  [Biome.TEMPERATE]: [92, 74, 66],
  [Biome.OVERGROWN]: [70, 78, 60],
  [Biome.FUNGAL]: [66, 60, 86],
  [Biome.AUTUMN]: [104, 70, 54],
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

/** Lamp spacing: one candidate per square of this many cells (divides the chunk size, so squares never straddle chunks). */
const LAMP_GRID = 32;

export function bakeChunk(chunk: Chunk, seed: number, withBiomes = true): Baked {
  const n = chunk.size;
  const size = n * T;
  const gx0 = chunk.cx * n;
  const gy0 = chunk.cy * n;
  const albedo = new ImageData(size, size);
  const emissive = new ImageData(size, size);
  const a32 = new Uint32Array(albedo.data.buffer);
  const e32 = new Uint32Array(emissive.data.buffer);
  const pack = (c: RGB, alpha = 255) =>
    ((alpha << 24) | (Math.max(0, Math.min(255, c[2])) << 16) | (Math.max(0, Math.min(255, c[1])) << 8) | Math.max(0, Math.min(255, c[0]))) >>> 0;
  const lights: Light[] = [];

  // Biome per cell, with jittered sampling so zone borders dither like pixel art instead of running straight.
  const biome = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const jx = (rand(gx0 + x, gy0 + y, 31) - 0.5) * 12;
      const jy = (rand(gx0 + x, gy0 + y, 32) - 0.5) * 12;
      biome[y * n + x] = withBiomes ? biomeAt(seed, gx0 + x + jx, gy0 + y + jy) : Biome.TEMPERATE;
    }
  }

  const g = (x: number, y: number) => chunk.ground[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const st = (x: number, y: number) => chunk.structure[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]!;
  const setA = (tx: number, ty: number, c: RGB) => (a32[ty * size + tx] = pack(c));
  const setE = (tx: number, ty: number, c: RGB, alpha = 255) => (e32[ty * size + tx] = pack(c, alpha));

  const lampBest = new Map<number, { score: number; x: number; y: number }>();

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const gx = gx0 + x;
      const gy = gy0 + y;
      const b = biome[i] as Biome;
      const ground = chunk.ground[i] as Ground;
      const s = chunk.structure[i]!;
      const base = groundColor(ground, b);
      for (let ty = 0; ty < T; ty++) {
        for (let tx = 0; tx < T; tx++) {
          const k = 0.88 + rand(gx * T + tx, gy * T + ty, 1) * 0.24;
          setA(x * T + tx, y * T + ty, scale(base, k));
        }
      }
      // Ground details: flowers in grass, kerbs, rubble.
      if ((ground === Ground.GRASS || ground === Ground.PARK) && s === Structure.NONE && b !== Biome.FROST && rand(gx, gy, 2) < 0.03) {
        setA(x * T + (rand(gx, gy, 3) < 0.5 ? 0 : 1), y * T, FLOWERS[Math.floor(rand(gx, gy, 4) * FLOWERS.length)]!);
      }
      if (isRoad(ground)) {
        const kerb: RGB = b === Biome.FROST ? [220, 228, 240] : [104, 100, 100];
        if (!isRoad(g(x, y - 1))) for (let t = 0; t < T; t++) setA(x * T + t, y * T, kerb);
        if (!isRoad(g(x, y + 1))) for (let t = 0; t < T; t++) setA(x * T + t, y * T + T - 1, kerb);
        if (!isRoad(g(x - 1, y))) for (let t = 0; t < T; t++) setA(x * T, y * T + t, kerb);
        if (!isRoad(g(x + 1, y))) for (let t = 0; t < T; t++) setA(x * T + T - 1, y * T + t, kerb);
        // Lamp candidates: a sidewalk cell beside the road.
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
        for (let t = 0; t < T * T; t++) if (rand(gx * 4 + t, gy, 6) < 0.4) setA(x * T + (t % T), y * T + Math.floor(t / T), rand(gx, gy * 4 + t, 7) < 0.5 ? [150, 140, 130] : [70, 62, 56]);
      }

      if (s === Structure.BUILDING) {
        // Dark roof mass with a lighter rim where it meets open ground, like lit rock edges.
        const roof = ROOF[b];
        const named = chunk.buildings[chunk.building[i]!]?.kind !== "building";
        const rim = RIM[b];
        const open = (dx: number, dy: number) => st(x + dx, y + dy) !== Structure.BUILDING;
        for (let ty = 0; ty < T; ty++) {
          for (let tx = 0; tx < T; tx++) {
            const k = 0.85 + rand(gx * T + tx, gy * T + ty, 8) * 0.3;
            let c = scale(named ? mix(roof, [120, 90, 60], 0.4) : roof, k);
            const edge = (ty === 0 && open(0, -1)) || (ty === T - 1 && open(0, 1)) || (tx === 0 && open(-1, 0)) || (tx === T - 1 && open(1, 0));
            if (edge) {
              c = scale(rim, 0.85 + rand(gx * T + tx, gy * T + ty, 9) * 0.3);
              if (b === Biome.OVERGROWN && rand(gx * T + tx, gy * T + ty, 10) < 0.35) c = [60, 150, 60];
            }
            setA(x * T + tx, y * T + ty, c);
          }
        }
        // A few lit windows on the outside walls.
        const perimeter = open(0, -1) || open(0, 1) || open(-1, 0) || open(1, 0);
        if (perimeter && rand(gx, gy, seed + 11) < 0.035) {
          const warm: RGB = b === Biome.FROST ? [255, 236, 190] : [255, 214, 130];
          setE(x * T + (open(-1, 0) ? 0 : 1), y * T + (open(0, -1) ? 0 : 1), warm);
          lights.push({ x: gx + 0.5, y: gy + 0.5, r: 3.5, color: warm, kind: LightKind.WINDOW, intensity: 0.55, phase: rand(gx, gy, 12) });
        }
      } else if (s === Structure.WALL) {
        for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) setA(x * T + tx, y * T + ty, (tx + ty) % 2 ? [150, 146, 140] : [118, 112, 108]);
      } else if (s === Structure.TREE) {
        setA(x * T, y * T + 1, [70, 48, 30]); // trunk; the canopy is drawn (and sways) per frame
      }

      // Glowing fungi in fungal zones.
      if (b === Biome.FUNGAL && s === Structure.NONE && GREENISH.has(ground) && rand(gx, gy, seed + 13) < 0.02) {
        const c: RGB = rand(gx, gy, 14) < 0.6 ? [90, 240, 230] : [190, 120, 255];
        setE(x * T + 1, y * T, c);
        setE(x * T + 1, y * T + 1, scale(c, 0.6), 200);
        lights.push({ x: gx + 0.5, y: gy + 0.5, r: 2.6, color: c, kind: LightKind.FUNGUS, intensity: 0.7, phase: rand(gx, gy, 15) });
      }
    }
  }

  // Street lamps: the best sidewalk cell per square, for most squares.
  for (const [key, best] of lampBest) {
    if (rand(key, seed, 16) > 0.8) continue;
    const gx = gx0 + best.x;
    const gy = gy0 + best.y;
    const b = biome[best.y * n + best.x] as Biome;
    setA(best.x * T, best.y * T + 1, [40, 40, 44]); // post
    setE(best.x * T, best.y * T, [255, 250, 230]); // lamp head
    lights.push({ x: gx + 0.3, y: gy + 0.3, r: 9, color: LAMP[b], kind: LightKind.LAMP, intensity: 0.95, phase: rand(gx, gy, 17) });
  }

  // Shop signs: neon on buildings that contain a named place.
  for (const p of chunk.pois) {
    const i = p.y * n + p.x;
    if (chunk.building[i]! < 0) continue;
    const c = SIGNS[hashInts(p.x, p.y, chunk.cx, chunk.cy) % SIGNS.length]!;
    setE(p.x * T, p.y * T, c);
    setE(p.x * T + 1, p.y * T, c);
    lights.push({ x: gx0 + p.x + 0.5, y: gy0 + p.y + 0.5, r: 6, color: c, kind: LightKind.SIGN, intensity: 0.9, phase: rand(p.x, p.y, 18) });
  }

  return { albedo: toCanvas(albedo), emissive: toCanvas(emissive), lights, biome };
}

function toCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}
