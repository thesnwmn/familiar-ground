import type { Scene } from "../scene.ts";
import { css, type RGB } from "./color.ts";
import { isCarRoad, type Ctx } from "./layers.ts";

export interface Lamp {
  x: number;
  y: number;
  /** Radius in cells. */
  r: number;
  color: RGB;
  strength: number;
  kind: "lamp" | "window" | "sign" | "glow";
}

/**
 * Lights placed from the real map: lamps along both sides of roads, lit windows on building
 * outlines, neon on named places. Deterministic, so every style lights a place the same way.
 */
export function gatherLights(
  sc: Scene,
  opts: { lamp?: RGB; window?: RGB; signs?: RGB[]; lampSpacing?: number; windowChance?: number } = {},
): Lamp[] {
  const lamp = opts.lamp ?? [255, 196, 120];
  const win = opts.window ?? [255, 214, 140];
  const signs = opts.signs ?? [[80, 230, 220], [255, 110, 180], [255, 190, 80], [160, 130, 255]];
  const spacing = opts.lampSpacing ?? 22;
  const lights: Lamp[] = [];
  const inView = (x: number, y: number, pad: number) => x > sc.gx0 - pad && y > sc.gy0 - pad && x < sc.gx1 + pad && y < sc.gy1 + pad;
  for (const road of sc.roads) {
    if (!isCarRoad(road)) continue;
    let along = sc.rand(Math.round(road.points[0]!.x), Math.round(road.points[0]!.y), 5) * spacing;
    let side = 1;
    for (let i = 0; i + 1 < road.points.length; i++) {
      const a = road.points[i]!;
      const b = road.points[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!len) continue;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      while (along < len) {
        const off = (road.width / 2 + 1) * side;
        const x = a.x + ((b.x - a.x) * along) / len + nx * off;
        const y = a.y + ((b.y - a.y) * along) / len + ny * off;
        if (inView(x, y, 12)) lights.push({ x, y, r: 10, color: lamp, strength: 1, kind: "lamp" });
        along += spacing;
        side = -side;
      }
      along -= len;
    }
  }
  for (const b of sc.buildings) {
    const ring = b.rings[0]!;
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i]!;
      const c = ring[i + 1]!;
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      for (let s = 2; s < len - 1; s += 5) {
        const x = a.x + ((c.x - a.x) * s) / len;
        const y = a.y + ((c.y - a.y) * s) / len;
        if (!inView(x, y, 4)) continue;
        if (sc.rand(Math.round(x * 3), Math.round(y * 3), 9) > (opts.windowChance ?? 0.12)) continue;
        lights.push({ x, y, r: 3.5, color: win, strength: 0.6, kind: "window" });
      }
    }
  }
  for (const p of sc.pois) {
    if (!p.inBuilding) continue;
    lights.push({ x: p.x + 0.5, y: p.y + 0.5, r: 7, color: signs[Math.floor(sc.rand(p.x, p.y, 3) * signs.length)]!, strength: 1, kind: "sign" });
  }
  return lights;
}

const sprites = new Map<string, HTMLCanvasElement>();
export function glowSprite(c: RGB, soft = 0.35): HTMLCanvasElement {
  const key = `${c.join(",")}:${soft}`;
  let s = sprites.get(key);
  if (s) return s;
  s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, css(c, 1));
  grad.addColorStop(soft, css(c, 0.55));
  grad.addColorStop(1, css(c, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprites.set(key, s);
  return s;
}

/**
 * Darkens the scene to an ambient colour, then lets lights back in: a smooth light map is
 * multiplied over the image, then soft bloom halos are added on top.
 */
export function applyLighting(sc: Scene, ctx: Ctx, lights: Lamp[], opts: { ambient: RGB; bloom?: number; radiusK?: number; lightK?: number }): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const k = W / sc.W;
  const lw = Math.max(8, Math.ceil(W / 4));
  const lh = Math.max(8, Math.ceil(H / 4));
  const lm = document.createElement("canvas");
  lm.width = lw;
  lm.height = lh;
  const g = lm.getContext("2d")!;
  g.fillStyle = css(opts.ambient);
  g.fillRect(0, 0, lw, lh);
  g.globalCompositeOperation = "lighter";
  const rk = opts.radiusK ?? 1;
  const toL = (v: number) => (v * k * lw) / W;
  for (const l of lights) {
    const r = Math.max(1.5, l.r * rk * sc.scale);
    g.globalAlpha = Math.min(1, l.strength * (opts.lightK ?? 1));
    g.drawImage(glowSprite(l.color), toL(sc.sx(l.x) - r), toL(sc.sy(l.y) - r), toL(r * 2), toL(r * 2));
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lm, 0, 0, W, H);
  if (opts.bloom) {
    ctx.globalCompositeOperation = "lighter";
    for (const l of lights) {
      if (l.kind === "window" && sc.scale < 3) continue;
      const r = Math.max(2, l.r * rk * sc.scale * (l.kind === "window" ? 0.5 : 0.6)) * k;
      ctx.globalAlpha = opts.bloom * l.strength * (l.kind === "window" ? 0.6 : 1);
      ctx.drawImage(glowSprite(l.color, 0.15), sc.sx(l.x) * k - r, sc.sy(l.y) * k - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

/** Small bright dots for light sources themselves (lamp heads, windows), drawn after lighting. */
export function lightPoints(sc: Scene, ctx: Ctx, lights: Lamp[], size = 1): void {
  if (sc.scale < 2) return;
  ctx.save();
  for (const l of lights) {
    const s = Math.max(1, (l.kind === "lamp" ? 0.5 : 0.35) * sc.scale * size);
    ctx.fillStyle = css(l.kind === "lamp" ? [255, 250, 235] : l.color);
    ctx.fillRect(sc.sx(l.x) - s / 2, sc.sy(l.y) - s / 2, s, s);
  }
  ctx.restore();
}
