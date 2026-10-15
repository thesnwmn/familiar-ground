import { hashInts } from "./rng.ts";

/**
 * Biomes are a fantasy layer over the real map: zones a few hundred metres across that change how
 * an area looks (and later, plays) without moving any road or building. Deterministic per seed.
 */
export const Biome = {
  TEMPERATE: 0,
  OVERGROWN: 1,
  FUNGAL: 2,
  AUTUMN: 3,
  FROST: 4,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];
export const BIOME_NAMES = Object.fromEntries(Object.entries(Biome).map(([k, v]) => [v, k.toLowerCase()])) as Record<Biome, string>;

/** Default zone size in cells (~300 cells is roughly 300–700 m depending on latitude). */
export const BIOME_SCALE = 300;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1). */
export function valueNoise(seed: number, salt: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const h = (dx: number, dy: number) => hashInts(seed, salt, xi + dx, yi + dy) / 4294967296;
  const top = h(0, 0) + (h(1, 0) - h(0, 0)) * fx;
  const bottom = h(0, 1) + (h(1, 1) - h(0, 1)) * fx;
  return top + (bottom - top) * fy;
}

/** Two octaves of value noise, roughly in [0, 1). */
export function fbm(seed: number, salt: number, x: number, y: number): number {
  return (valueNoise(seed, salt, x, y) * 2 + valueNoise(seed, salt + 101, x * 2.13 + 5.2, y * 2.13 - 1.7)) / 3;
}

/**
 * Biome at a global cell. Two noise fields act like temperature and moisture: cold extremes are
 * frost, warm extremes autumn, and the middle splits into overgrown, temperate and fungal by moisture.
 */
export function biomeAt(seed: number, gx: number, gy: number, scale = BIOME_SCALE): Biome {
  const x = gx / scale;
  const y = gy / scale;
  const temperature = fbm(seed, 1, x, y);
  const moisture = fbm(seed, 2, x + 17.3, y - 9.1);
  if (temperature < 0.36) return Biome.FROST;
  if (temperature > 0.64) return Biome.AUTUMN;
  if (moisture > 0.6) return Biome.FUNGAL;
  if (moisture < 0.4) return Biome.OVERGROWN;
  return Biome.TEMPERATE;
}
