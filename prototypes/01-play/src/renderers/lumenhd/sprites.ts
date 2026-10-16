import { hashInts } from "@familiar-ground/world-core";
import type { RGB } from "./textures.ts";

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;
const css = (c: RGB, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

export interface Look {
  skin: RGB;
  hair: RGB;
  top: RGB;
  legs: RGB;
  shoes: RGB;
}

const SKIN: RGB[] = [[241, 194, 125], [224, 172, 105], [198, 134, 66], [141, 85, 36], [255, 219, 172]];
const HAIR: RGB[] = [[40, 28, 20], [90, 60, 30], [200, 160, 80], [20, 20, 24], [150, 60, 40], [180, 180, 180]];
const TOPS: RGB[] = [[200, 60, 60], [60, 100, 180], [240, 200, 60], [60, 150, 100], [230, 230, 230], [50, 50, 60], [200, 120, 180], [230, 130, 50]];
const LEGS: RGB[] = [[40, 50, 90], [30, 30, 34], [110, 90, 70], [80, 80, 90]];

export function randomLook(seed: number): Look {
  const p = <T>(a: T[], s: number) => a[Math.floor(r01(seed, s) * a.length)]!;
  return { skin: p(SKIN, 1), hair: p(HAIR, 2), top: p(TOPS, 3), legs: p(LEGS, 4), shoes: [30, 26, 24] };
}

export const PLAYER_LOOK: Look = { skin: [241, 194, 125], hair: [74, 44, 26], top: [214, 58, 58], legs: [43, 58, 103], shoes: [29, 29, 34] };

/**
 * A person, 6×11 texels, feet at (x, y). `dir` is 0 down, 1 up, 2 left, 3 right; `step` alternates
 * the legs while walking. `ghost` draws a see-through silhouette (when behind a building).
 */
export function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, look: Look, dir: number, step: number, ghost = false): void {
  const R = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + dx * k), Math.round(y + dy * k), Math.ceil(w * k), Math.ceil(h * k));
  };
  if (ghost) {
    R(-2, -10, 4, 10, "rgba(255,255,255,0.35)");
    R(-1.5, -11, 3, 1, "rgba(255,255,255,0.35)");
    return;
  }
  R(-2.5, -0.5, 5, 1.2, "rgba(0,0,0,0.3)"); // shadow
  const legA = step % 2 === 0 ? 0 : 1;
  const side = dir >= 2;
  // Legs.
  if (side) {
    R(-1 + (legA ? -1 : 0), -3, 1, 3, css(look.legs));
    R(0 + (legA ? 1 : 0), -3, 1, 3, css(look.legs, 0.8));
    R(-1 + (legA ? -1 : 0), -1, 1, 1, css(look.shoes));
    R(0 + (legA ? 1 : 0), -1, 1, 1, css(look.shoes));
  } else {
    R(-1.5, -3 - (legA ? 0.5 : 0), 1, 3, css(look.legs));
    R(0.5, -3 - (legA ? 0 : 0.5), 1, 3, css(look.legs, 0.85));
    R(-1.5, -1 - (legA ? 0.5 : 0), 1, 1, css(look.shoes));
    R(0.5, -1 - (legA ? 0 : 0.5), 1, 1, css(look.shoes));
  }
  // Body and arms (arms swing opposite to legs).
  R(-2, -7, 4, 4, css(look.top));
  R(-2, -7, 4, 1, css(look.top, 1.2));
  R(-2, -4, 4, 1, css(look.top, 0.75));
  if (!side) {
    R(-3, -7 + (legA ? 0.5 : 0), 1, 3, css(look.top, 0.85));
    R(2, -7 + (legA ? 0 : 0.5), 1, 3, css(look.top, 0.85));
    R(-3, -4 + (legA ? 0.5 : 0), 1, 1, css(look.skin));
    R(2, -4 + (legA ? 0 : 0.5), 1, 1, css(look.skin));
  } else {
    R(dir === 2 ? (legA ? 0 : -1) : legA ? -1 : 0, -6, 1, 3, css(look.top, 0.8));
  }
  // Head.
  R(-1.5, -10, 3, 3, css(look.skin));
  if (dir === 1) R(-1.5, -10, 3, 2.5, css(look.hair)); // seen from behind
  else {
    R(-1.5, -10.5, 3, 1, css(look.hair));
    if (dir === 2) R(0.5, -10, 1, 2, css(look.hair));
    else if (dir === 3) R(-1.5, -10, 1, 2, css(look.hair));
    else R(-1.5, -10, 0.6, 1.5, css(look.hair)), R(0.9, -10, 0.6, 1.5, css(look.hair));
    if (dir === 0) R(-1, -9, 0.6, 0.6, "#1a1a1a"), R(0.4, -9, 0.6, 0.6, "#1a1a1a");
    if (dir === 2) R(-1.5, -9, 0.6, 0.6, "#1a1a1a");
    if (dir === 3) R(0.9, -9, 0.6, 0.6, "#1a1a1a");
  }
}

/** A pigeon: pecking on the ground, or flapping away. */
export function drawPigeon(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, flying: number, peck: boolean, flip: boolean): void {
  const R = (dx: number, dy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + (flip ? -dx - w : dx) * k), Math.round(y + dy * k), Math.ceil(w * k), Math.ceil(h * k));
  };
  if (flying >= 0) {
    const up = flying % 2 === 0;
    R(-1, -1, 2, 1, "#8a8c96");
    R(-3, up ? -2 : 0, 2, 1, "#b0b2bc");
    R(1, up ? -2 : 0, 2, 1, "#b0b2bc");
    return;
  }
  R(-1.5, -0.3, 3, 0.8, "rgba(0,0,0,0.25)");
  R(-1.5, -2, 3, 2, "#8a8c96");
  R(-1.5, -2, 2, 1, "#a8aab4");
  R(-2, -1.5, 1, 1, "#6c6e78"); // tail
  if (peck) R(1.5, -1, 1, 1, "#5a6a74");
  else R(1.2, -3, 1, 1, "#5a6a74"), R(1.2, -2.3, 1, 0.5, "#6a8a70"); // head, neck sheen
}

const canopyCache = new Map<string, HTMLCanvasElement>();
/** A leafy canopy: overlapping lumps lit from the top-left, with chunky leaf texels. */
export function canopy(radius: number, variant: number, k: number, palette: [RGB, RGB, RGB]): HTMLCanvasElement {
  const key = `${radius}:${variant}:${k}:${palette.flat().join(",")}`;
  let c = canopyCache.get(key);
  if (c) return c;
  const R = radius * k;
  const size = Math.ceil(R * 2.6);
  c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2;
  const cy = size / 2;
  const [base, light, dark] = palette;
  const lumps: [number, number, number][] = [[0, 0, 1]];
  const n = 5 + (variant % 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + variant;
    lumps.push([Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.5, 0.55 + r01(variant, i, radius) * 0.2]);
  }
  // Outline, base, then highlights offset up-left: soft 3D lumps.
  for (const [pass, col, dx, dy, s] of [
    [0, css(dark, 0.6), 0, 0, 1.08],
    [1, css(dark), k * 0.6, k * 0.8, 1],
    [2, css(base), 0, 0, 0.92],
    [3, css(light), -R * 0.12, -R * 0.14, 0.62],
  ] as const) {
    void pass;
    ctx.fillStyle = col;
    for (const [lx, ly, lr] of lumps) {
      ctx.beginPath();
      ctx.arc(cx + lx + dx, cy + ly + dy, lr * R * 0.62 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Leaf texels: chunky specks so the canopy shares the pixel feel of the ground.
  const img = ctx.getImageData(0, 0, size, size);
  const step = Math.max(1, Math.round(k));
  for (let y = 0; y < size; y += step)
    for (let x = 0; x < size; x += step) {
      const o = (y * size + x) * 4;
      if (img.data[o + 3]! < 200) continue;
      const v = r01(x, y, variant, 7);
      const f = v > 0.85 ? 1.18 : v < 0.12 ? 0.8 : 1;
      if (f === 1) continue;
      for (let yy = y; yy < Math.min(size, y + step); yy++)
        for (let xx = x; xx < Math.min(size, x + step); xx++) {
          const p = (yy * size + xx) * 4;
          img.data[p] = img.data[p]! * f;
          img.data[p + 1] = img.data[p + 1]! * f;
          img.data[p + 2] = img.data[p + 2]! * f;
        }
    }
  ctx.putImageData(img, 0, 0);
  canopyCache.set(key, c);
  if (canopyCache.size > 200) canopyCache.delete(canopyCache.keys().next().value!);
  return c;
}

const glowCache = new Map<string, HTMLCanvasElement>();
/** Soft radial light sprite per colour. */
export function glowSprite(c: RGB, soft = 0.35): HTMLCanvasElement {
  const key = `${c.join(",")}:${soft}`;
  let s = glowCache.get(key);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 64;
  const ctx = s.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${c.join(",")},1)`);
  grad.addColorStop(soft, `rgba(${c.join(",")},0.55)`);
  grad.addColorStop(1, `rgba(${c.join(",")},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowCache.set(key, s);
  return s;
}
