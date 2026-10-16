import { Ground, Structure } from "@familiar-ground/world-core";

export type RGB = [number, number, number];

export const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
export const lum = (c: RGB) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
export const clamp = (v: number, a = 0, b = 255) => (v < a ? a : v > b ? b : v);

/** The handful of things a style needs to tell apart. */
export type Cls =
  | "water" | "major" | "minor" | "path" | "rail" | "building" | "named" | "tree" | "wall"
  | "park" | "forest" | "grass" | "farm" | "sand" | "urban" | "paved" | "rubble" | "ice" | "rock" | "wet" | "void";

export function cellClass(g: number, s: number, named = false): Cls {
  if (g < 0) return "void";
  if (s === Structure.BUILDING) return named ? "named" : "building";
  if (s === Structure.TREE) return "tree";
  if (s === Structure.WALL) return "wall";
  switch (g) {
    case Ground.WATER: return "water";
    case Ground.ROAD_MAJOR: return "major";
    case Ground.ROAD_MINOR: return "minor";
    case Ground.PATH: return "path";
    case Ground.RAIL: return "rail";
    case Ground.PARK: return "park";
    case Ground.FOREST: return "forest";
    case Ground.GRASS: return "grass";
    case Ground.FARMLAND: return "farm";
    case Ground.SAND: return "sand";
    case Ground.PAVED: return "paved";
    case Ground.RUBBLE: return "rubble";
    case Ground.ICE: return "ice";
    case Ground.ROCK: return "rock";
    case Ground.WETLAND: return "wet";
    default: return "urban";
  }
}

export type Palette = Partial<Record<Cls, RGB>> & { urban: RGB };

/** Fills in a palette's gaps from its closest relatives. */
export function pick(p: Palette, c: Cls): RGB {
  const fallback: Partial<Record<Cls, Cls>> = {
    named: "building", tree: "forest", forest: "park", park: "grass", grass: "urban", wet: "grass", farm: "grass",
    minor: "major", major: "urban", path: "paved", rail: "minor", paved: "urban", wall: "building", building: "urban",
    rubble: "urban", sand: "urban", ice: "urban", rock: "urban", water: "urban", void: "urban",
  };
  let k: Cls | undefined = c;
  for (let n = 0; n < 6 && k; n++) {
    const v = p[k];
    if (v) return v;
    k = fallback[k];
  }
  return p.urban;
}

export const DEFAULT_PALETTE: Palette = {
  urban: [214, 208, 198], paved: [226, 220, 210], building: [190, 170, 156], named: [226, 176, 110], wall: [150, 146, 140],
  water: [140, 190, 230], major: [255, 252, 240], minor: [250, 248, 244], path: [226, 196, 150], rail: [160, 150, 150],
  park: [190, 222, 160], forest: [150, 200, 130], tree: [96, 160, 90], grass: [206, 228, 176], farm: [236, 226, 180],
  sand: [240, 226, 180], rubble: [180, 170, 160], ice: [240, 248, 255], rock: [200, 196, 190], wet: [180, 214, 190], void: [30, 30, 30],
};
