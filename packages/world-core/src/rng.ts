/**
 * Deterministic randomness. Generation must never use Math.random(): every
 * decision is derived from the world seed plus stable keys (chunk coords, OSM ids).
 */

export type Rng = () => number;

/** 32-bit hash of any mix of strings and numbers (FNV-1a over the joined keys, then avalanched). */
export function hash32(...keys: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = keys.join("\u0000");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: small, fast, good-enough PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A PRNG for a specific purpose, e.g. rngFor(seed, "trees", cx, cy). */
export function rngFor(...keys: (string | number)[]): Rng {
  return mulberry32(hash32(...keys));
}

/** Fast integer hash for hot loops (per-cell decisions). Mixes 32-bit ints with murmur3-style finalisation. */
export function hashInts(...nums: number[]): number {
  let h = 0x9e3779b9;
  for (const n of nums) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h = (h << 13) | (h >>> 19);
    h = Math.imul(h, 5) + 0xe6546b64;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hashInts mapped to [0, 1). */
export function randInts(...nums: number[]): number {
  return hashInts(...nums) / 4294967296;
}
