import { Ground, Structure, type Point } from "@familiar-ground/world-core";
import type { Scene, SceneBuilding } from "../scene.ts";
import { css, mul, type RGB } from "./color.ts";
import { buildingPath, type Ctx } from "./layers.ts";
import { blurred } from "./post.ts";

/*
 * Gameplay mock-ups: what a style looks like with a player, gangs, loot, resources and a HUD on
 * top, plus the camera/visibility ideas (oblique 3/4 walls, line of sight, entering buildings).
 * Entities are deterministic per place and seed, so every style shows the same "moment".
 */

const blocks = (s: number) => s === Structure.BUILDING || s === Structure.WALL;

/** Visibility polygon from the player (screen centre), raycast against buildings and walls. */
export function lineOfSight(sc: Scene, maxCells: number, rays = 540): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const step = 0.3;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = 0.6;
    // If you start inside a building (a doorway), see out of it: walls only count once you're outside.
    let outside = !blocks(sc.structure(Math.floor(sc.cx), Math.floor(sc.cy)));
    for (; d < maxCells; d += step) {
      const gx = Math.floor(sc.cx + dx * d);
      const gy = Math.floor(sc.cy + dy * d);
      if (!blocks(sc.structure(gx, gy))) outside = true;
      else if (outside) {
        d += 0.6; // let the light touch the wall face it hits
        break;
      }
    }
    pts.push({ x: sc.sx(sc.cx + dx * d), y: sc.sy(sc.cy + dy * d) });
  }
  return pts;
}

/** Darkness everywhere outside the polygon (soft-edged), like Darkwood / Teleglitch. */
export function shadeOutside(ctx: Ctx, poly: { x: number; y: number }[], color = "rgba(6,6,10,0.88)", soft = 3): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const m = document.createElement("canvas");
  m.width = W;
  m.height = H;
  const g = m.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  poly.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.fill();
  const b = soft > 1 ? blurred(m, soft) : m;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b, 0, 0, W, H);
  ctx.restore();
}

/** A torch cone in the facing direction (additive warm light). */
export function torchCone(ctx: Ctx, x: number, y: number, angle: number, len: number, spread = 0.5): void {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, "rgba(255,230,170,0.35)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, len, angle - spread, angle + spread);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface Actor {
  x: number;
  y: number;
  facing: number;
  kind: "gang" | "rival" | "loot" | "wood" | "metal" | "food" | "meds" | "water";
  gang?: number;
}

/**
 * The moment every mock-up shows: two rival gangs holding street corners, loot by doors,
 * resources where the map says they'd be (wood from trees, medicine at pharmacies, food at
 * shops and cafés, water by rivers, scrap metal along roads).
 */
export function mockActors(sc: Scene): Actor[] {
  const out: Actor[] = [];
  const R = Math.min(sc.W, sc.H) / sc.scale / 2;
  const near = (gx: number, gy: number) => Math.hypot(gx - sc.cx, gy - sc.cy) < R * 0.95;
  // Gang anchors: the two road cells closest to points at fixed bearings from the player.
  const anchors: { x: number; y: number; gang: number }[] = [];
  for (const [bearing, gang] of [[0.6, 0], [3.7, 1]] as const) {
    // Snap to a coarse world grid: stable while you walk (gangs don't follow you around).
    const tx = Math.round((sc.cx + Math.cos(bearing) * R * 0.55) / 48) * 48;
    const ty = Math.round((sc.cy + Math.sin(bearing) * R * 0.55) / 48) * 48;
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let dy = -12; dy <= 12; dy++)
      for (let dx = -12; dx <= 12; dx++) {
        const gx = Math.floor(tx + dx);
        const gy = Math.floor(ty + dy);
        const g = sc.ground(gx, gy);
        if ((g === Ground.ROAD_MAJOR || g === Ground.ROAD_MINOR || g === Ground.PAVED || g === Ground.URBAN) && sc.structure(gx, gy) === Structure.NONE) {
          const d = dx * dx + dy * dy;
          if (d < bd) (bd = d), (best = { x: gx + 0.5, y: gy + 0.5 });
        }
      }
    if (best) anchors.push({ ...best, gang });
  }
  for (const a of anchors) {
    const n = 3 + Math.floor(sc.rand(Math.round(a.x), Math.round(a.y), 1) * 3);
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + a.gang;
      const r = 1.5 + sc.rand(k, a.gang, 2) * 3;
      out.push({ x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r, facing: Math.atan2(sc.cy - a.y, sc.cx - a.x) + (sc.rand(k, a.gang, 3) - 0.5), kind: a.gang ? "rival" : "gang", gang: a.gang });
    }
  }
  // Loot by building doors (a point on each nearby footprint's edge), and resources from map semantics.
  let loot = 0;
  for (const b of sc.buildings) {
    if (loot > 8 || !near(b.cx, b.cy) || b.r > 0.35) continue;
    const ring = b.rings[0]!;
    const p = ring[Math.floor(b.r * 1000) % Math.max(1, ring.length - 1)]!;
    out.push({ x: p.x + (b.cx - p.x) * 0.1, y: p.y + (b.cy - p.y) * 0.1, facing: 0, kind: "loot" });
    loot++;
  }
  for (const p of sc.pois) {
    if (!near(p.x, p.y)) continue;
    const cls = p.cls;
    const kind = /pharm|chemist|doctor|hospital|clinic/.test(cls) ? "meds" : /cafe|bakery|super|food|restaurant|deli|boulang|grocer|butcher|convenience|bar|pub/.test(cls) ? "food" : /hardware|doityourself|car|fuel|garage/.test(cls) ? "metal" : null;
    if (kind) out.push({ x: p.x + 0.5, y: p.y + 0.5, facing: 0, kind });
  }
  let wood = 0;
  let water = 0;
  sc.forCells((gx, gy, g, s) => {
    if (!near(gx, gy)) return;
    if (s === Structure.TREE && wood < 6 && sc.rand(gx, gy, 9) < 0.03) (out.push({ x: gx + 0.5, y: gy + 0.5, facing: 0, kind: "wood" }), wood++);
    if (g === Ground.WATER && water < 3 && sc.rand(gx, gy, 10) < 0.004) (out.push({ x: gx + 0.5, y: gy + 0.5, facing: 0, kind: "water" }), water++);
  });
  return out;
}

const KIND_COLOR: Record<Actor["kind"], RGB> = {
  gang: [230, 50, 60],
  rival: [160, 80, 230],
  loot: [250, 200, 40],
  wood: [150, 100, 50],
  metal: [170, 180, 190],
  food: [250, 140, 60],
  meds: [80, 220, 120],
  water: [70, 170, 255],
};

/** Draws actors with strong outlines so they read on any style. */
export function drawActors(sc: Scene, ctx: Ctx, actors: Actor[], opts: { outline?: string; scale?: number } = {}): void {
  const s = Math.max(3.2, Math.min(9, sc.scale * 0.55)) * (opts.scale ?? 1);
  const outline = opts.outline ?? "#0b0b0e";
  ctx.save();
  for (const a of actors) {
    const x = sc.sx(a.x);
    const y = sc.sy(a.y);
    const c = KIND_COLOR[a.kind];
    ctx.lineWidth = Math.max(1, s * 0.28);
    ctx.strokeStyle = outline;
    if (a.kind === "gang" || a.kind === "rival") {
      // Body + a facing "gun" line + tiny health bar.
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a.facing) * s * 1.6, y + Math.sin(a.facing) * s * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = css(c);
      ctx.fill();
      ctx.stroke();
      if (s > 4) {
        ctx.fillStyle = "#111";
        ctx.fillRect(x - s, y - s * 1.6, s * 2, 2);
        ctx.fillStyle = "#5f5";
        ctx.fillRect(x - s, y - s * 1.6, s * 2 * (0.4 + 0.6 * ((a.x * 7) % 1)), 2);
      }
    } else {
      const r = s * 0.7;
      ctx.fillStyle = css(c);
      ctx.beginPath();
      if (a.kind === "loot" || a.kind === "metal") ctx.rect(x - r, y - r, r * 2, r * 2);
      else if (a.kind === "water") (ctx.moveTo(x, y - r * 1.3), ctx.quadraticCurveTo(x + r * 1.2, y + r * 0.5, x, y + r), ctx.quadraticCurveTo(x - r * 1.2, y + r * 0.5, x, y - r * 1.3));
      else if (a.kind === "meds") (ctx.rect(x - r, y - r * 0.35, r * 2, r * 0.7), ctx.rect(x - r * 0.35, y - r, r * 0.7, r * 2));
      else ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (a.kind === "loot") {
        ctx.strokeStyle = "rgba(255,240,180,0.6)";
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/** The player at the centre: body, facing, and an aim line. */
export function drawPlayer(sc: Scene, ctx: Ctx, facing = -0.7, color: RGB = [60, 160, 255]): void {
  const s = Math.max(4, Math.min(10, sc.scale * 0.6));
  const x = sc.W / 2;
  const y = sc.H / 2;
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(facing) * s * 7, y + Math.sin(facing) * s * 7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = Math.max(1.5, s * 0.3);
  ctx.strokeStyle = "#0b0b0e";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(facing) * s * 1.8, y + Math.sin(facing) * s * 1.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fillStyle = css(color);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(x - s * 0.3, y - s * 0.3, s * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Minimal survival HUD: health, ammo, resources, and a minimap of the same scene. */
export function drawHud(sc: Scene, ctx: Ctx, actors: Actor[], tone: "dark" | "light" = "dark"): void {
  if (sc.W < 200) return;
  const fg = tone === "dark" ? "rgba(255,255,255,0.92)" : "rgba(20,20,24,0.9)";
  const panel = tone === "dark" ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.65)";
  ctx.save();
  ctx.fillStyle = panel;
  ctx.fillRect(6, 6, 104, 30);
  ctx.fillStyle = "#300";
  ctx.fillRect(10, 10, 96, 6);
  ctx.fillStyle = "#e33";
  ctx.fillRect(10, 10, 66, 6);
  ctx.fillStyle = fg;
  ctx.font = "bold 9px ui-monospace, monospace";
  ctx.fillText("AMMO 14/40", 10, 30);
  const counts = { wood: 12, metal: 5, food: 3, meds: 1, water: 2 } as const;
  let x = 6;
  const y = sc.H - 20;
  ctx.fillStyle = panel;
  ctx.fillRect(4, y - 4, 5 * 34 + 4, 20);
  for (const [k, n] of Object.entries(counts)) {
    ctx.fillStyle = css(KIND_COLOR[k as Actor["kind"]]);
    ctx.fillRect(x + 2, y, 9, 9);
    ctx.fillStyle = fg;
    ctx.fillText(String(n), x + 14, y + 8);
    x += 34;
  }
  // Minimap: dots for actors in the corner.
  const m = 48;
  const mx = sc.W - m - 6;
  const my = 6;
  ctx.fillStyle = panel;
  ctx.fillRect(mx, my, m, m);
  ctx.strokeStyle = fg;
  ctx.strokeRect(mx + 0.5, my + 0.5, m - 1, m - 1);
  const k = m / Math.max(sc.W, sc.H);
  for (const a of actors) {
    ctx.fillStyle = css(KIND_COLOR[a.kind]);
    ctx.fillRect(mx + sc.sx(a.x) * k - 1, my + sc.sy(a.y) * k - 1, 2, 2);
  }
  ctx.fillStyle = "#4af";
  ctx.fillRect(mx + m / 2 - 1.5, my + m / 2 - 1.5, 3, 3);
  ctx.restore();
}

/**
 * Oblique 3/4 view (Zelda, Pokémon, Stardew, Hotline-ish): every building is pushed straight up
 * by its height, so the south walls show and the camera never swings. Stable while moving.
 */
export function oblique(
  sc: Scene,
  ctx: Ctx,
  opts: {
    roof: (b: SceneBuilding) => string | CanvasPattern;
    wall: (b: SceneBuilding, shade: number) => string;
    outline?: string;
    lineWidth?: number;
    k?: number;
    windows?: string;
    skip?: (b: SceneBuilding) => boolean;
    /** Sideways push per unit of height (0 = straight up; 0.5 = cavalier / Ultima-style slant). */
    lean?: number;
  },
): void {
  const lean = opts.lean ?? 0;
  const lw = opts.lineWidth ?? 1;
  const items = sc.buildings
    .filter((b) => !opts.skip?.(b))
    .map((b) => {
      let maxY = -Infinity;
      let minX = Infinity;
      for (const p of b.rings[0]!) (maxY = Math.max(maxY, p.y), (minX = Math.min(minX, p.x)));
      return { b, key: maxY - (lean > 0 ? minX * lean * 0.5 : 0), h: Math.min(18, b.levels) * 1.6 * (opts.k ?? 0.7) * sc.scale };
    });
  items.sort((a, b) => a.key - b.key);
  ctx.save();
  ctx.lineJoin = "round";
  for (const { b, h } of items) {
    const ring = b.rings[0]!;
    const dx = lean * h;
    // Only walls facing the viewer (outward normal pointing down the screen, against the push).
    let area = 0;
    for (let i = 0; i + 1 < ring.length; i++) area += ring[i]!.x * ring[i + 1]!.y - ring[i + 1]!.x * ring[i]!.y;
    const walls: { ax: number; ay: number; cx: number; cy: number; len: number; shade: number }[] = [];
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i]!;
      const c = ring[i + 1]!;
      const ex = c.x - a.x;
      const ey = c.y - a.y;
      const nx = area > 0 ? ey : -ey;
      const ny = area > 0 ? -ex : ex;
      if (nx * -lean + ny <= 0) continue;
      const ax = sc.sx(a.x);
      const ay = sc.sy(a.y);
      const cx = sc.sx(c.x);
      const cy = sc.sy(c.y);
      const len = Math.hypot(cx - ax, cy - ay) || 1;
      walls.push({ ax, ay, cx, cy, len, shade: 0.55 + 0.45 * Math.abs((cx - ax) / len) * (lean ? (nx > 0 ? 0.7 : 1) : 1) });
    }
    walls.sort((p, q) => Math.max(p.ay, p.cy) - Math.max(q.ay, q.cy));
    for (const { ax, ay, cx, cy, len, shade } of walls) {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx, cy - h);
      ctx.lineTo(ax + dx, ay - h);
      ctx.closePath();
      ctx.fillStyle = opts.wall(b, shade);
      ctx.fill();
      if (opts.outline) {
        ctx.strokeStyle = opts.outline;
        ctx.lineWidth = 0.8 * lw;
        ctx.stroke();
      }
      if (opts.windows && h > 8 && len > 6) {
        ctx.fillStyle = opts.windows;
        for (let fy = 4; fy < h - 3; fy += 6)
          for (let t = 4; t < len - 3; t += 6) ctx.fillRect(ax + ((cx - ax) * t) / len + (dx * fy) / h - 1, ay + ((cy - ay) * t) / len - fy - 1, 2, 2);
      }
    }
    ctx.save();
    ctx.translate(dx, -h);
    buildingPath(sc, ctx, b);
    ctx.fillStyle = opts.roof(b);
    ctx.fill("evenodd");
    if (opts.outline) {
      ctx.strokeStyle = opts.outline;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

export function enteredBuilding(sc: Scene): SceneBuilding | undefined {
  let best: SceneBuilding | undefined;
  let score = -Infinity;
  for (const b of sc.buildings) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of b.rings[0]!) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
    const area = (maxX - minX) * (maxY - minY);
    const d = Math.hypot(b.cx - sc.cx, b.cy - sc.cy);
    const s = Math.min(area, 900) - d * d * 0.6;
    if (area > 40 && s > score) (score = s), (best = b);
  }
  return best;
}

/**
 * A generated interior shown with the roof cut away: BSP rooms clipped to the real footprint,
 * doorways, furniture, loot and a couple of gang members inside. Deterministic per building.
 */
export function cutawayInterior(sc: Scene, ctx: Ctx, b: SceneBuilding, opts: { floor: RGB[]; wall: string; furniture: string } = { floor: [[196, 168, 128], [170, 176, 180], [150, 120, 96]], wall: "#2a2522", furniture: "#6a5244" }): Actor[] {
  const ring = b.rings[0]!;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
  const seed = Math.round(b.r * 1e6);
  let n = 0;
  const rnd = () => sc.rand(seed, n++, 401);
  const rooms: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const split = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0;
    const h = y1 - y0;
    if (depth > 5 || (w < 9 && h < 9)) return void rooms.push({ x0, y0, x1, y1 });
    if (w > h) {
      const x = x0 + w * (0.35 + rnd() * 0.3);
      split(x0, y0, x, y1, depth + 1);
      split(x, y0, x1, y1, depth + 1);
    } else {
      const y = y0 + h * (0.35 + rnd() * 0.3);
      split(x0, y0, x1, y, depth + 1);
      split(x0, y, x1, y1, depth + 1);
    }
  };
  split(minX, minY, maxX, maxY, 0);
  ctx.save();
  buildingPath(sc, ctx, b);
  ctx.clip("evenodd");
  const R = (r: { x0: number; y0: number; x1: number; y1: number }) => [sc.sx(r.x0), sc.sy(r.y0), (r.x1 - r.x0) * sc.scale, (r.y1 - r.y0) * sc.scale] as const;
  rooms.forEach((r, i) => {
    const [x, y, w, h] = R(r);
    ctx.fillStyle = css(mul(opts.floor[i % opts.floor.length]!, 0.92 + rnd() * 0.16));
    ctx.fillRect(x, y, w, h);
    // Floor boards / tiles.
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let yy = y; yy < y + h; yy += Math.max(3, sc.scale * 0.6)) (ctx.moveTo(x, yy), ctx.lineTo(x + w, yy));
    ctx.stroke();
    // Furniture against a wall.
    ctx.fillStyle = opts.furniture;
    const fw = w * (0.25 + rnd() * 0.25);
    const fh = Math.max(3, sc.scale * 1.2);
    ctx.fillRect(x + w * rnd() * 0.5 + 2, y + 2, fw, fh);
    if (rnd() < 0.5) ctx.fillRect(x + 2, y + h - fh - 2, fh, h * 0.35);
  });
  // Walls with doorways: each room edge drawn with a gap in the middle.
  ctx.strokeStyle = opts.wall;
  ctx.lineWidth = Math.max(1.5, sc.scale * 0.35);
  ctx.lineCap = "square";
  for (const r of rooms) {
    const [x, y, w, h] = R(r);
    const gap = Math.max(4, sc.scale * 1.4);
    const seg = (ax: number, ay: number, bx: number, by: number) => {
      const len = Math.hypot(bx - ax, by - ay);
      if (len < gap * 2.5) return (ctx.beginPath(), ctx.moveTo(ax, ay), ctx.lineTo(bx, by), ctx.stroke());
      const t0 = 0.5 - gap / len / 2;
      const t1 = 0.5 + gap / len / 2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
      ctx.moveTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
      ctx.lineTo(bx, by);
      ctx.stroke();
    };
    seg(x, y, x + w, y);
    seg(x, y, x, y + h);
  }
  ctx.restore();
  // Outer walls, thick.
  buildingPath(sc, ctx, b);
  ctx.strokeStyle = opts.wall;
  ctx.lineWidth = Math.max(2.5, sc.scale * 0.6);
  ctx.stroke();
  // Inside: loot in some rooms, a couple of gang members.
  const inside: Actor[] = [];
  rooms.forEach((r, i) => {
    const x = (r.x0 + r.x1) / 2;
    const y = (r.y0 + r.y1) / 2;
    if (i % 3 === 0) inside.push({ x, y, facing: 0, kind: i % 2 ? "meds" : "loot" });
    if (i % 4 === 1) inside.push({ x: x + 1, y: y - 1, facing: rnd() * 6, kind: "gang", gang: 0 });
  });
  return inside;
}

export function insidePoint(b: SceneBuilding): Point {
  return { x: b.cx, y: b.cy };
}

/** Actors placed in world space, moved into a rotated scene's frame. */
export function rotateActors(rs: Scene, actors: Actor[]): Actor[] {
  if (!rs.rotation) return actors;
  return actors.map((a) => ({ ...a, ...rs.rot(a.x, a.y), facing: a.facing + rs.rotation }));
}

/** Screen points turned about the screen centre (for overlays computed before rotating). */
export function rotateScreen(sc: Scene, pts: { x: number; y: number }[], theta: number): { x: number; y: number }[] {
  if (!theta) return pts;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return pts.map((p) => {
    const dx = p.x - sc.W / 2;
    const dy = p.y - sc.H / 2;
    return { x: sc.W / 2 + dx * c - dy * s, y: sc.H / 2 + dx * s + dy * c };
  });
}
