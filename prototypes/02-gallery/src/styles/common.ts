import { Ground } from "@familiar-ground/world-core";
import { DEFAULT_PALETTE, css, mix, mul, pick, type Cls, type Palette, type RGB } from "../kit/color.ts";
import { bg, buildings, isCarRoad, isMajorRoad, roads, smoothMask, trees, type Ctx, type TexelInfo } from "../kit/layers.ts";
import type { Scene, SceneBuilding } from "../scene.ts";

export const GREEN: Cls[] = ["park", "forest", "grass", "wet", "tree"];
export const isGreenCls = (c: Cls) => GREEN.includes(c);
export const isRoadCls = (c: Cls) => c === "major" || c === "minor";
export const isBuildingCls = (c: Cls) => c === "building" || c === "named";

/**
 * Clean vector "plan": smooth ground areas traced from the grid, roads from their real centre
 * lines with casings, real building footprints, round trees.
 */
export function planBase(
  sc: Scene,
  ctx: Ctx,
  pal: Palette = DEFAULT_PALETTE,
  opts: {
    roadCasing?: RGB;
    buildingStroke?: RGB | null;
    buildingFill?: (b: SceneBuilding) => RGB;
    treeColor?: RGB | null;
    wobble?: number;
    lineWidth?: number;
    shadow?: { dx: number; dy: number; color: string };
    paths?: boolean;
    /** Leave buildings out (a camera projection draws them instead). */
    noBuildings?: boolean;
  } = {},
): void {
  bg(ctx, pal.urban);
  smoothMask(sc, ctx, (c) => c === "farm", pick(pal, "farm"), { wobble: opts.wobble });
  smoothMask(sc, ctx, (c) => c === "sand", pick(pal, "sand"), { wobble: opts.wobble });
  smoothMask(sc, ctx, (c) => c === "paved", pick(pal, "paved"), { wobble: opts.wobble });
  smoothMask(sc, ctx, isGreenCls, pick(pal, "park"), { wobble: opts.wobble });
  smoothMask(sc, ctx, (c) => c === "forest" || c === "tree", pick(pal, "forest"), { wobble: opts.wobble, grow: -0.1 });
  smoothMask(sc, ctx, (c) => c === "water", pick(pal, "water"), { wobble: opts.wobble });
  const casing = opts.roadCasing;
  roads(sc, ctx, (r) => {
    if (r.ground === Ground.ROAD_MAJOR || r.ground === Ground.ROAD_MINOR) {
      return {
        casing: casing ? { color: css(casing), add: Math.max(1, sc.scale * 0.35) } : undefined,
        fill: { color: css(pick(pal, isMajorRoad(r) ? "major" : "minor")) },
      };
    }
    if (opts.paths !== false && r.ground === Ground.PATH) return { fill: { color: css(pick(pal, "path")), k: 0.6, dash: sc.scale > 6 ? [sc.scale * 0.8, sc.scale * 0.5] : undefined } };
    if (r.ground === Ground.RAIL) return { fill: { color: css(pick(pal, "rail")), k: 0.35 } };
    return null;
  });
  if (!opts.noBuildings) buildings(sc, ctx, {
    fill: (b) => css(opts.buildingFill ? opts.buildingFill(b) : pick(pal, b.kind !== "building" ? "named" : "building")),
    stroke: opts.buildingStroke === null ? undefined : () => css(opts.buildingStroke ?? mul(pick(pal, "building"), 0.7)),
    lineWidth: opts.lineWidth ?? Math.max(0.6, Math.min(2, sc.scale * 0.12)),
    shadow: opts.shadow,
  });
  if (opts.treeColor !== null) {
    const tc = opts.treeColor ?? pick(pal, "tree");
    trees(sc, ctx, (x, y, r, rnd) => {
      ctx.fillStyle = css(mul(tc, 0.88 + rnd * 0.24));
      ctx.beginPath();
      ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }, 0.6);
  }
}

/** Dashed centre lines and zebra-ish edge paint from the real road lines. */
export function markings(sc: Scene, ctx: Ctx, color = "rgba(255,255,255,0.85)", minScale = 2.5): void {
  if (sc.scale < minScale) return;
  roads(sc, ctx, (r) =>
    isCarRoad(r) && (isMajorRoad(r) || r.width > 5)
      ? { fill: { color, k: 0, add: Math.max(1, sc.scale * 0.12), dash: [sc.scale * 2, sc.scale * 2] } }
      : null,
  "butt");
}

/** Rich pixel-art shader: textures, outlines and highlights per class, at any density. */
export function richShader(pal: Palette, opts: { outline?: RGB; flowers?: RGB[]; roofRows?: boolean; grassTufts?: boolean; contrast?: number } = {}) {
  const flowers = opts.flowers ?? [[230, 70, 70], [250, 210, 80], [240, 140, 200], [255, 255, 255]];
  const outline = opts.outline;
  const ct = opts.contrast ?? 1;
  return (t: TexelInfo): RGB => {
    const { cls, tx, ty, t: n, r } = t;
    const u = (tx + 0.5) / n;
    const v = (ty + 0.5) / n;
    const edgeN = ty === 0, edgeS = ty === n - 1, edgeW = tx === 0, edgeE = tx === n - 1;
    let c = pick(pal, cls);
    switch (cls) {
      case "grass": case "park": case "wet": case "farm": {
        c = mul(c, 1 + (r - 0.5) * 0.12 * ct);
        if (opts.grassTufts !== false && r > 0.9 && n >= 4) c = mul(c, 1.18);
        if (cls === "park" && n >= 6 && t.r < 0.012) c = flowers[Math.floor(r * 1000) % flowers.length]!;
        if (cls === "farm" && (t.gy * n + ty) % 3 === 0) c = mul(c, 0.82);
        break;
      }
      case "tree": case "forest": {
        // A round canopy per tree cell, lit from the top-left.
        const base = pick(pal, "grass");
        const d = Math.hypot(u - 0.5, v - 0.5);
        if (cls === "forest" && d > 0.5) { c = mul(pick(pal, "forest"), 0.9 + r * 0.1); break; }
        if (d > 0.48) { c = cls === "tree" ? mul(base, 0.8) : c; break; }
        c = pick(pal, "tree");
        c = mul(c, u + v < 0.75 ? 1.25 : u + v > 1.3 ? 0.75 : 1);
        if (outline && d > 0.42) c = mul(c, 0.6);
        break;
      }
      case "water": {
        const wave = Math.sin((t.gx * n + tx) * 0.7 + (t.gy * n + ty) * 1.9);
        c = mul(c, wave > 0.85 ? 1.22 : 0.97 + r * 0.06);
        if (t.n(0, -1) !== "water" && ty === 0 || t.n(0, 1) !== "water" && ty === n - 1 || t.n(-1, 0) !== "water" && tx === 0 || t.n(1, 0) !== "water" && tx === n - 1) c = mix(c, [255, 255, 255], 0.45);
        break;
      }
      case "major": case "minor": {
        c = mul(c, 0.94 + r * 0.12);
        const kerb = (edgeN && !isRoadCls(t.n(0, -1))) || (edgeS && !isRoadCls(t.n(0, 1))) || (edgeW && !isRoadCls(t.n(-1, 0))) || (edgeE && !isRoadCls(t.n(1, 0)));
        if (kerb) c = mix(c, [220, 220, 210], 0.6);
        break;
      }
      case "building": case "named": {
        const nb = (dx: number, dy: number) => isBuildingCls(t.n(dx, dy));
        c = mul(c, opts.roofRows !== false && (t.gy * n + ty) % 3 === 0 ? 0.88 : 1);
        if (outline && ((edgeN && !nb(0, -1)) || (edgeS && !nb(0, 1)) || (edgeW && !nb(-1, 0)) || (edgeE && !nb(1, 0)))) return outline;
        if ((edgeN && !nb(0, -1)) || (edgeW && !nb(-1, 0))) c = mul(c, 1.18);
        if ((edgeS && !nb(0, 1)) || (edgeE && !nb(1, 0))) c = mul(c, 0.72);
        break;
      }
      case "path": case "sand": case "rubble":
        c = mul(c, 0.9 + r * 0.2);
        break;
      case "rail":
        c = (t.gy * n + ty) % 3 === 0 ? [110, 80, 56] : tx === Math.floor(n / 4) || tx === Math.floor((3 * n) / 4) ? [190, 190, 196] : mul(c, 0.9);
        break;
      default:
        c = mul(c, 0.95 + r * 0.1);
    }
    return c;
  };
}

/** Window grid on a wall quad (for perspective buildings). */
export function windowGrid(ctx: Ctx, quad: { x: number; y: number }[], color: string, lit?: (i: number) => boolean): void {
  const [a, b, c, d] = quad as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const hgt = Math.hypot(d.x - a.x, d.y - a.y);
  if (len < 6 || hgt < 5) return;
  const cols = Math.max(1, Math.floor(len / 5));
  const rows = Math.max(1, Math.floor(hgt / 5));
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (lit && !lit(i * 31 + j)) continue;
      const u = (i + 0.3) / cols;
      const v = (j + 0.35) / rows;
      const pu = (p: { x: number; y: number }, q: { x: number; y: number }, t: number) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      const bottom = pu(a, b, u);
      const top = pu(d, c, u);
      const p = pu(bottom, top, v);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - 0.8, p.y - 0.8, 1.8, 1.8);
    }
  }
}

export const planPalette = (over: Partial<Palette>): Palette => ({ ...DEFAULT_PALETTE, ...over }) as Palette;
