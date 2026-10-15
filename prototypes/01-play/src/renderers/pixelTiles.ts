import { Ground, mulberry32 } from "@familiar-ground/world-core";
import { GROUND_RGB } from "../palette.ts";

/** Native tile size in texels. Zoom levels draw at whole multiples of this, so pixels stay square. */
export const T = 8;
export const VARIANTS = 4;

type RGB = [number, number, number];
const shade = ([r, g, b]: RGB, k: number): RGB => [r * k, g * k, b * k];
const css = ([r, g, b]: RGB) => `rgb(${r | 0},${g | 0},${b | 0})`;

/**
 * Procedurally drawn tiles, so the prototype needs no art assets: one row per ground class,
 * VARIANTS columns, each T×T. Swap this for a real tileset later without touching the renderer.
 */
export function buildGroundAtlas(): HTMLCanvasElement {
  const grounds = Object.values(Ground) as Ground[];
  const atlas = document.createElement("canvas");
  atlas.width = T * VARIANTS;
  atlas.height = T * grounds.length;
  const ctx = atlas.getContext("2d")!;
  for (const g of grounds) {
    for (let v = 0; v < VARIANTS; v++) {
      const rand = mulberry32(g * 97 + v * 13 + 1);
      const ox = v * T;
      const oy = g * T;
      const base = GROUND_RGB[g];
      ctx.fillStyle = css(base);
      ctx.fillRect(ox, oy, T, T);
      const px = (x: number, y: number, c: RGB) => {
        ctx.fillStyle = css(c);
        ctx.fillRect(ox + x, oy + y, 1, 1);
      };
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const r = rand();
          switch (g) {
            case Ground.GRASS:
            case Ground.PARK:
            case Ground.FOREST:
            case Ground.WETLAND:
              if (r < 0.12) px(x, y, shade(base, 1.18));
              else if (r < 0.24) px(x, y, shade(base, 0.85));
              if (g === Ground.WETLAND && r > 0.93) px(x, y, GROUND_RGB[Ground.WATER]);
              break;
            case Ground.WATER:
              if ((y + v) % 4 === 0 && (x + y * 3 + v) % 8 < 3) px(x, y, shade(base, 1.3));
              break;
            case Ground.ROAD_MINOR:
            case Ground.ROAD_MAJOR:
            case Ground.PAVED:
            case Ground.URBAN:
              if (r < 0.1) px(x, y, shade(base, 1.12));
              else if (r < 0.18) px(x, y, shade(base, 0.9));
              break;
            case Ground.FARMLAND:
              if (y % 3 === 0) px(x, y, shade(base, 0.82));
              else if (r < 0.1) px(x, y, shade(base, 1.1));
              break;
            case Ground.SAND:
            case Ground.PATH:
            case Ground.ICE:
            case Ground.ROCK:
              if (r < 0.15) px(x, y, shade(base, r < 0.07 ? 1.12 : 0.88));
              break;
            case Ground.RAIL:
              if (y % 3 === 1) px(x, y, [120, 90, 60]);
              if (x === 2 || x === 5) px(x, y, [180, 180, 190]);
              break;
            case Ground.RUBBLE:
              if (r < 0.35) px(x, y, r < 0.12 ? [160, 150, 140] : r < 0.24 ? [96, 84, 74] : [140, 110, 90]);
              break;
          }
        }
      }
    }
  }
  return atlas;
}

/** Tree sprite: T wide, 1.5·T tall, drawn so its base sits on the cell and the canopy rises above. */
export function buildTreeSprites(): HTMLCanvasElement[] {
  return [0, 1].map((variant) => {
    const c = document.createElement("canvas");
    c.width = T;
    c.height = T + T / 2;
    const ctx = c.getContext("2d")!;
    const rand = mulberry32(500 + variant);
    ctx.fillStyle = "rgb(92,64,40)";
    ctx.fillRect(3, 8, 2, 4);
    const cx = 3.5;
    const cy = 5;
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < T; x++) {
        const d = Math.hypot(x - cx, (y - cy) * 1.1);
        if (d > 3.8 + (variant ? 0.3 : 0)) continue;
        const light = x - y < 0 ? 1.15 : 0.9;
        const k = (rand() < 0.2 ? 0.85 : 1) * light * (variant ? 0.92 : 1);
        ctx.fillStyle = css([40 * k, 120 * k, 48 * k]);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return c;
  });
}

/** Little person sprite, T×T, facing the viewer. */
export function buildPlayerSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = T;
  c.height = T + 2;
  const ctx = c.getContext("2d")!;
  const rows = [
    "..hhhh..",
    "..hssh..",
    "..ssss..",
    ".bbbbbb.",
    "sbbbbbbs",
    ".bbbbbb.",
    "..pppp..",
    "..p..p..",
    "..p..p..",
    ".kk..kk.",
  ];
  const colors: Record<string, string> = { h: "#4a2c1a", s: "#f1c27d", b: "#d63a3a", p: "#2b3a67", k: "#222" };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      ctx.fillStyle = colors[ch]!;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}
