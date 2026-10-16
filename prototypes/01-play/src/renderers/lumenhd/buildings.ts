import { Ground, hashInts, type Point } from "@familiar-ground/world-core";
import type { SceneBuilding } from "../../../../02-gallery/src/scene.ts";
import { CellSampler } from "../sample.ts";
import { FLOOR, NEON, T, bbox, heightOf, pointIn, type Emitter, type Lamp } from "./bake.ts";
import type { RGB } from "./textures.ts";

/**
 * Buildings are drawn live every frame (not baked) so the camera can be either:
 * - oblique 3/4: every point at height h is pushed straight up the screen by h;
 * - from the player: roofs lean away from the screen centre (GTA 1/2), so you see the walls
 *   facing you and streets feel like canyons.
 * Both use one projection: a height maps to a 2D transform of the footprint.
 */
export interface Camera {
  mode: "oblique" | "persp";
  /** Screen centre (the player), in pixels. */
  cx: number;
  cy: number;
  /** Perspective camera height in pixels (lower = stronger lean). */
  camH: number;
}

/** The transform that lifts ground points to height h (pixels). */
export function lift(cam: Camera, h: number): DOMMatrix {
  if (cam.mode === "oblique") return new DOMMatrix().translate(0, -h);
  const s = cam.camH / (cam.camH - Math.min(h, cam.camH * 0.6));
  return new DOMMatrix().translate(cam.cx, cam.cy).scale(s).translate(-cam.cx, -cam.cy);
}
const apply = (m: DOMMatrix, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;
const SHOP_COLORS: RGB[] = [[230, 70, 70], [40, 140, 90], [40, 90, 170], [230, 170, 40], [130, 60, 140], [30, 30, 34]];
const css = (c: RGB, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

/** What a building looks like, decided once from its data (materials, shop, roof furniture). */
export interface Plan {
  id: number;
  tall: boolean;
  pitched: boolean;
  wall: number;
  roof: number;
  shop: boolean;
  area: number;
  /** Damage from the player: 0 intact … 1 flattened. */
  damage: number;
  furniture: { x: number; y: number; what: number }[];
}

export function planFor(b: SceneBuilding, shop: boolean, cells: CellSampler): Plan {
  const ring = b.rings[0]!;
  const box = bbox(b);
  const area = Math.abs(signedArea(ring));
  const tall = b.levels >= 7;
  const pitched = !tall && b.levels <= 3 && area < 260 && b.r < 0.7;
  const id = Math.round(b.r * 1e5);
  const furniture: Plan["furniture"] = [];
  const n = Math.min(pitched ? 6 : 28, Math.floor(area / (pitched ? 60 : 18)) + 1);
  for (let i = 0; i < n * 4 && furniture.length < n; i++) {
    const x = box.minX + r01(id, i, 1) * (box.maxX - box.minX);
    const y = box.minY + r01(id, i, 2) * (box.maxY - box.minY);
    if (pointIn(ring, x, y) && pointIn(ring, x + 0.6, y + 0.5) && pointIn(ring, x - 0.5, y - 0.4)) furniture.push({ x, y, what: r01(id, i, 3) });
  }
  // Damage: how many of its cells the player has broken into rubble.
  let cellsIn = 0;
  let broken = 0;
  for (let gy = Math.floor(box.minY); gy <= box.maxY; gy++)
    for (let gx = Math.floor(box.minX); gx <= box.maxX; gx++) {
      if (!pointIn(ring, gx + 0.5, gy + 0.5)) continue;
      cellsIn++;
      if (cells.ground(gx, gy) === Ground.RUBBLE) broken++;
    }
  return {
    id, tall, pitched, area, shop, furniture,
    wall: tall && b.r < 0.5 ? 5 : Math.floor(b.r * 5),
    roof: pitched ? Math.floor(b.r * 7) % 3 : Math.floor(b.r * 11) % 4,
    damage: cellsIn ? Math.min(1, (broken / cellsIn) * 3) : 0,
  };
}

/** Smoke and steam from a building's chimneys and vents. */
export function emittersOf(b: SceneBuilding, plan: Plan): Emitter[] {
  const out: Emitter[] = [];
  const h = heightOf(b) * (1 - plan.damage * 0.85);
  for (const f of plan.furniture) {
    if (plan.pitched && f.what < 0.3) out.push({ x: f.x + 1 / T, y: f.y, lift: h + 3, kind: "smoke", phase: f.what * 10 });
    if (!plan.pitched && f.what >= 0.35 && f.what < 0.5) out.push({ x: f.x + 1 / T, y: f.y, lift: h, kind: "steam", phase: f.what * 10 });
  }
  return out;
}

export interface Paint {
  walls: CanvasPattern[];
  pitched: CanvasPattern[];
  flat: CanvasPattern[];
  rubble: CanvasPattern;
}

/**
 * Draws one building: visible walls (textured, shaded, with windows, a door or a shopfront),
 * then the roof (textured, ridge or parapet, outline, furniture). Lit windows and signs go to
 * `glow` and `lights`.
 */
export function drawBuilding(
  ctx: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  b: SceneBuilding,
  plan: Plan,
  cam: Camera,
  X: (gx: number) => number,
  Y: (gy: number) => number,
  k: number,
  paint: Paint,
  litChance: number,
  lights: Lamp[],
): void {
  const h = heightOf(b) * k * (1 - plan.damage * 0.85);
  const ring = b.rings[0]!;
  const top = lift(cam, h);
  const sa = signedArea(ring);
  const R = (c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, w: number, hh: number, color: string, s = 1) => {
    c.fillStyle = color;
    c.fillRect(x + dx * k * s, y + dy * k * s, w * k * s, hh * k * s);
  };
  // Visible walls: facing down the screen (oblique) or facing the camera (perspective).
  const walls: { a: Point; c: Point; len: number; shade: number; order: number }[] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i]!;
    const c = ring[i + 1]!;
    const ex = c.x - a.x;
    const ey = c.y - a.y;
    const nx = sa > 0 ? ey : -ey;
    const ny = sa > 0 ? -ex : ex;
    const ax = X(a.x), ay = Y(a.y), cx = X(c.x), cy = Y(c.y);
    let visible: boolean;
    if (cam.mode === "oblique") visible = ny > 0;
    else visible = nx * (cam.cx - (ax + cx) / 2) + ny * (cam.cy - (ay + cy) / 2) > 0;
    if (!visible) continue;
    const nl = Math.hypot(nx, ny) || 1;
    const shade = 0.66 + 0.34 * Math.max(0, (nx * -0.35 + ny * 0.94) / nl);
    const order = cam.mode === "oblique" ? Math.max(a.y, c.y) : -Math.hypot((ax + cx) / 2 - cam.cx, (ay + cy) / 2 - cam.cy);
    walls.push({ a, c, len: Math.hypot(ex, ey) * T, shade, order });
  }
  walls.sort((p, q) => p.order - q.order);
  const front = walls.reduce<(typeof walls)[number] | undefined>((m, w) => (!m || w.len * w.shade > m.len * m.shade ? w : m), undefined);
  const floors = Math.max(1, Math.round((heightOf(b) * (1 - plan.damage * 0.85)) / FLOOR));
  const wallPat = paint.walls[plan.wall]!;
  ctx.lineJoin = "round";
  for (const w of walls) {
    const ax = X(w.a.x), ay = Y(w.a.y), cx = X(w.c.x), cy = Y(w.c.y);
    const at = apply(top, ax, ay);
    const ct = apply(top, cx, cy);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(cx, cy);
    ctx.lineTo(ct.x, ct.y);
    ctx.lineTo(at.x, at.y);
    ctx.closePath();
    ctx.fillStyle = plan.damage > 0.3 ? paint.rubble : wallPat;
    ctx.fill();
    ctx.fillStyle = `rgba(20,16,30,${(1 - w.shade).toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(10,8,14,0.35)";
    ctx.lineWidth = Math.max(1, k * 0.4);
    ctx.stroke();
    if (w.len < 5 || plan.damage > 0.6) continue;
    // A rectangle on this wall, in wall texels: u along the wall, z up from the ground.
    const onWall = (c: CanvasRenderingContext2D, u0: number, u1: number, z0: number, z1: number, color: string) => {
      const pt = (u: number, z: number) => apply(lift(cam, z * k), ax + ((cx - ax) * u) / w.len, ay + ((cy - ay) * u) / w.len);
      const p0 = pt(u0, z0), p1 = pt(u1, z0), p2 = pt(u1, z1), p3 = pt(u0, z1);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      c.lineTo(p1.x, p1.y);
      c.lineTo(p2.x, p2.y);
      c.lineTo(p3.x, p3.y);
      c.closePath();
      c.fill();
    };
    // Windows: one row per floor, every 4 texels along the wall.
    for (let f = 0; f < floors; f++) {
      const z = f * FLOOR + 2;
      for (let t = 2; t + 2 <= w.len - 1; t += 4) {
        const isFront = w === front;
        if (f === 0 && isFront && (plan.shop || Math.abs(t + 1 - w.len / 2) < 3)) continue; // shopfront or door
        onWall(ctx, t, t + 2, z, z + 3, plan.tall ? "#2c3e52" : "#283444");
        onWall(ctx, t, t + 1, z + 2, z + 3, "rgba(170,200,230,0.8)");
        onWall(ctx, t - 0.4, t + 2.4, z - 0.6, z, "rgba(255,255,255,0.3)"); // sill
        if (r01(plan.id, f, t, 1) < litChance) {
          onWall(glow, t, t + 2, z, z + 3, r01(plan.id, t, 2) < 0.2 ? "rgb(170,210,255)" : "rgb(255,214,140)");
          if (f < 2) {
            const u = (t + 1) / w.len;
            lights.push({ x: w.a.x + (w.c.x - w.a.x) * u, y: w.a.y + (w.c.y - w.a.y) * u + 0.5, r: 1.6, color: [255, 200, 130], kind: "window", phase: r01(plan.id, t, 3) });
          }
        }
      }
    }
    // Door or shopfront on the front wall.
    if (w === front && w.len >= 6) {
      const mid = w.len / 2;
      const gx = (w.a.x + w.c.x) / 2;
      const gy = (w.a.y + w.c.y) / 2;
      if (plan.shop) {
        const col = SHOP_COLORS[Math.floor(b.r * SHOP_COLORS.length)]!;
        const neon = NEON[Math.floor(b.r * 7.3) % NEON.length]!;
        const half = Math.min(Math.floor(w.len / 2) - 1, 12);
        onWall(ctx, mid - half, mid + half, 0.5, 4.5, "#1e2630"); // shop window
        for (let x = -half; x < half; x += 3) onWall(ctx, mid + x, mid + x + 1, 3.5, 4.5, "rgba(200,220,240,0.5)");
        for (let x = -half; x < half; x++) onWall(ctx, mid + x, mid + x + 1, 4.5, 6.5, x & 1 ? css(col) : "#f2efe6"); // awning
        onWall(glow, mid - Math.min(half, 5), mid + Math.min(half, 5), 7, 8, css(neon)); // neon sign
        onWall(glow, mid - half + 1, mid + half - 1, 1, 3, "rgba(255,230,180,0.9)"); // lit interior
        lights.push({ x: gx, y: gy + 0.6, r: 3.5, color: neon, kind: "sign", phase: b.r });
      } else {
        onWall(ctx, mid - 1.5, mid + 1.5, 0, 5, "#3a2a22"); // door
        onWall(ctx, mid - 1.5, mid + 1.5, 4.4, 5, "#7a5a44");
        onWall(ctx, mid + 0.5, mid + 1, 2.2, 2.8, "#c8a64a"); // handle
        if (r01(plan.id, 4) < 0.5) {
          onWall(glow, mid - 2.6, mid - 1.8, 5.5, 6.3, "rgb(255,220,160)"); // porch light
          lights.push({ x: gx, y: gy + 0.3, r: 1.8, color: [255, 210, 150], kind: "door", phase: b.r });
        }
      }
    }
  }
  // Roof.
  ctx.save();
  ctx.setTransform(ctx.getTransform().multiply(top));
  ringPath(ctx, b.rings, X, Y);
  ctx.fillStyle = plan.damage > 0.3 ? paint.rubble : plan.pitched ? paint.pitched[plan.roof]! : paint.flat[plan.roof]!;
  ctx.fill("evenodd");
  if (plan.pitched && plan.damage <= 0.3) {
    ctx.save();
    ringPath(ctx, b.rings, X, Y);
    ctx.clip("evenodd");
    ctx.translate(X(b.cx), Y(b.cy));
    ctx.rotate(longestEdgeAngle(ring));
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(-4000, 0, 8000, 4000);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-4000, -k * 0.5, 8000, k);
    ctx.restore();
  } else {
    ctx.save();
    ringPath(ctx, b.rings, X, Y);
    ctx.clip("evenodd");
    // Parapet: a raised rim with a lit top and a shadow line inside.
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = k * 5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(225,220,210,0.9)";
    ctx.lineWidth = k * 3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = "rgba(20,16,20,0.8)";
  ctx.lineWidth = Math.max(1, k * 0.6);
  ringPath(ctx, b.rings, X, Y);
  ctx.stroke();
  if (plan.damage <= 0.3)
    for (const f of plan.furniture) {
      const x = X(f.x);
      const y = Y(f.y);
      const what = f.what;
      if (plan.pitched) {
        if (what < 0.45) {
          R(ctx, x, y, 0, -3, 2, 3, "#8a5040");
          R(ctx, x, y, 0, -3, 2, 1, "#3a2622");
        } else if (what < 0.6) R(ctx, x, y, 0, 0, 2, 2, "#9cc4e0");
        continue;
      }
      if (what < 0.35) {
        R(ctx, x, y, 0, 0, 4, 3, "#c8ccd0"); // AC unit
        R(ctx, x, y, 0, 3, 4, 1, "#7c8084");
        R(ctx, x, y, 1, 1, 2, 1, "#4c5054");
      } else if (what < 0.55) {
        R(ctx, x, y, 0, 0, 2, 2, "#3c3c40"); // vent
        R(ctx, x, y, 0, 0, 2, 1, "#8a8a90");
      } else if (what < 0.7) {
        R(ctx, x, y, 0, 0, 3, 2, "#a8d0ec"); // skylight
        R(ctx, x, y, 0, 0, 1, 1, "#e8f4fc");
        R(ctx, x, y, 0, 2, 3, 1, "#5a6670");
      } else if (what < 0.82 && plan.area > 60) {
        for (let j = 0; j < 3; j++) {
          R(ctx, x, y, j * 3, 0, 2, 3, "#283c6a"); // solar panels
          R(ctx, x, y, j * 3, 0, 2, 1, "#4a6aa8");
        }
      } else if (what < 0.88) {
        R(ctx, x, y, 0, 0, 2, 2, "#6c8c4c"); // potted plants
        R(ctx, x, y, 0, 2, 2, 1, "#9a6040");
      }
    }
  ctx.restore();
}

/** True if a screen point is covered by this building's projected roof or walls (for see-through people). */
export function covers(b: SceneBuilding, plan: Plan, cam: Camera, X: (gx: number) => number, Y: (gy: number) => number, k: number, x: number, y: number): boolean {
  const h = heightOf(b) * k * (1 - plan.damage * 0.85);
  const sx = X(1) - X(0);
  const ring = b.rings[0]!;
  // Inside the footprint lifted to any height between the ground and the roof.
  for (let s = 0.25; s <= 1.0001; s += 0.25) {
    const q = apply(lift(cam, h * s).inverse(), x, y);
    if (pointIn(ring, (q.x - X(0)) / sx, (q.y - Y(0)) / sx)) return true;
  }
  return false;
}

export function ringPath(ctx: CanvasRenderingContext2D, rings: Point[][], X: (x: number) => number, Y: (y: number) => number): void {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
  }
}

export function signedArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += ring[i]!.x * ring[i + 1]!.y - ring[i + 1]!.x * ring[i]!.y;
  return a / 2;
}

function longestEdgeAngle(ring: Point[]): number {
  let best = 0;
  let ang = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l > best) (best = l), (ang = Math.atan2(b.y - a.y, b.x - a.x));
  }
  return ang;
}
