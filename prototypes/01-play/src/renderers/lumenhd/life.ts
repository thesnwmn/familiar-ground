import { Ground, Structure, hashInts, type Point } from "@familiar-ground/world-core";
import type { Scene } from "../../../../02-gallery/src/scene.ts";
import type { CellSampler } from "../sample.ts";
import { offsetLine } from "./bake.ts";
import { randomLook, type Look } from "./sprites.ts";
import { CAR_COLORS } from "./bake.ts";
import type { RGB } from "./textures.ts";

/**
 * Ambient life: pedestrians on the pavements, traffic in the lanes, pigeons that scatter when you
 * get close. Purely visual: none of it is world state, and it never changes the world.
 */

export interface Path {
  pts: Point[];
  cum: number[];
  len: number;
}
export interface Walker {
  path: Path;
  s: number;
  dir: 1 | -1;
  speed: number;
  look: Look;
  travelled: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}
export interface Car {
  path: Path;
  s: number;
  speed: number;
  max: number;
  color: RGB;
  x: number;
  y: number;
  ang: number;
}
export interface Bird {
  ox: number;
  oy: number;
  phase: number;
}
export interface Flock {
  x: number;
  y: number;
  birds: Bird[];
  fledAt: number;
  away: Point;
}

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;

function toPath(pts: Point[]): Path | null {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  const len = cum[cum.length - 1]!;
  return len > 4 ? { pts, cum, len } : null;
}

export function pointAt(p: Path, s: number): { x: number; y: number; dx: number; dy: number } {
  s = Math.max(0, Math.min(p.len, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i]! < s) i++;
  const a = p.pts[i - 1]!;
  const b = p.pts[i]!;
  const seg = p.cum[i]! - p.cum[i - 1]! || 1;
  const t = (s - p.cum[i - 1]!) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx: (b.x - a.x) / seg, dy: (b.y - a.y) / seg };
}

export class Life {
  walkers: Walker[] = [];
  cars: Car[] = [];
  flocks = new Map<string, Flock>();
  private paths: Path[] = [];
  private lanes: Path[] = [];
  private spawned = 0;

  constructor(private readonly cells: CellSampler, private readonly onFlutter: () => void) {}

  setScene(sc: Scene): void {
    this.paths = [];
    this.lanes = [];
    for (const r of sc.roads) {
      const car = r.ground === Ground.ROAD_MAJOR || r.ground === Ground.ROAD_MINOR;
      if (car) {
        for (const side of [-1, 1]) {
          const p = toPath(offsetLine(r.points, side * (r.width / 2 + 0.9)));
          if (p) this.paths.push(p);
        }
        // Traffic on main roads and wide streets; quieter streets are for parking.
        if ((r.ground === Ground.ROAD_MAJOR && r.width >= 3) || r.width >= 6) {
          for (const side of [-1, 1]) {
            const pts = offsetLine(r.points, side * r.width * 0.25);
            const p = toPath(side > 0 ? pts : [...pts].reverse());
            if (p) this.lanes.push(p);
          }
        }
      } else if (r.ground === Ground.PATH) {
        const p = toPath(r.points);
        if (p) this.paths.push(p);
      }
    }
    this.walkers = this.walkers.filter((w) => this.paths.includes(w.path));
    this.cars = this.cars.filter((c) => this.lanes.includes(c.path));
  }

  private walkable(x: number, y: number): boolean {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    const g = this.cells.ground(gx, gy);
    return g >= 0 && g !== Ground.WATER && this.cells.structure(gx, gy) === Structure.NONE;
  }

  update(dt: number, t: number, px: number, py: number, viewCells: number, perches: Point[]): void {
    const near = (x: number, y: number, r: number) => Math.abs(x - px) < r && Math.abs(y - py) < r;
    const R = viewCells;
    // Pedestrians: keep a few around, spawned just beyond the screen edge when possible.
    const wantWalkers = Math.min(16, Math.round(this.paths.length * 0.6));
    this.walkers = this.walkers.filter((w) => near(w.x, w.y, R * 1.6));
    for (let tries = 0; this.walkers.length < wantWalkers && tries < 20 && this.paths.length; tries++) {
      const id = this.spawned++;
      const path = this.paths[Math.floor(Math.random() * this.paths.length)]!;
      const s = Math.random() * path.len;
      const p = pointAt(path, s);
      if (!near(p.x, p.y, R * 1.3) || !this.walkable(p.x, p.y)) continue;
      this.walkers.push({ path, s, dir: Math.random() < 0.5 ? 1 : -1, speed: 1.1 + Math.random() * 0.9, look: randomLook(id * 7919 + 13), travelled: 0, x: p.x, y: p.y, dx: p.dx, dy: p.dy });
    }
    for (const w of this.walkers) {
      const next = w.s + w.dir * w.speed * dt;
      const p = pointAt(w.path, next);
      if (next < 0 || next > w.path.len || !this.walkable(p.x, p.y) || Math.hypot(p.x - px, p.y - py) < 0.8) {
        w.dir = w.dir > 0 ? -1 : 1;
        continue;
      }
      w.s = next;
      w.travelled += w.speed * dt;
      w.x = p.x;
      w.y = p.y;
      w.dx = p.dx * w.dir;
      w.dy = p.dy * w.dir;
    }
    // Traffic.
    const wantCars = Math.min(6, Math.round(this.lanes.length * 0.5));
    this.cars = this.cars.filter((c) => c.s < c.path.len && near(c.x, c.y, R * 2));
    for (let tries = 0; this.cars.length < wantCars && tries < 10 && this.lanes.length; tries++) {
      const path = this.lanes[Math.floor(Math.random() * this.lanes.length)]!;
      const s = Math.random() < 0.5 ? 0 : Math.random() * path.len * 0.5;
      const p = pointAt(path, s);
      if (!near(p.x, p.y, R * 1.5)) continue;
      if (this.cars.some((c) => c.path === path && Math.abs(c.s - s) < 6)) continue;
      const max = 4 + Math.random() * 4;
      this.cars.push({ path, s, speed: max, max, color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]!, x: p.x, y: p.y, ang: Math.atan2(p.dy, p.dx) });
    }
    for (const c of this.cars) {
      // Brake for the player and for the car in front.
      const ahead = pointAt(c.path, c.s + 2.2);
      const blocked = Math.hypot(ahead.x - px, ahead.y - py) < 1.6 || this.cars.some((o) => o !== c && o.path === c.path && o.s > c.s && o.s - c.s < 3.5);
      c.speed += ((blocked ? 0 : c.max) - c.speed) * Math.min(1, dt * (blocked ? 6 : 1.2));
      c.s += c.speed * dt;
      const p = pointAt(c.path, c.s);
      c.x = p.x;
      c.y = p.y;
      c.ang = Math.atan2(p.dy, p.dx);
    }
    // Pigeons: a flock at each perch near the player; they scatter when you come close.
    for (const p of perches) {
      const key = `${p.x},${p.y}`;
      let f = this.flocks.get(key);
      if (!f) {
        const n = 3 + Math.floor(r01(p.x * 10, p.y * 10, 1) * 4);
        f = { x: p.x, y: p.y, fledAt: -1, away: { x: 0, y: 0 }, birds: Array.from({ length: n }, (_, i) => ({ ox: (r01(p.x * 10, p.y * 10, i, 2) - 0.5) * 2.4, oy: (r01(p.x * 10, p.y * 10, i, 3) - 0.5) * 1.6, phase: r01(i, p.x * 10, 4) * 10 })) };
        this.flocks.set(key, f);
      }
      const d = Math.hypot(f.x - px, f.y - py);
      if (f.fledAt < 0 && d < 2.6) {
        f.fledAt = t;
        const len = d || 1;
        f.away = { x: (f.x - px) / len, y: (f.y - py) / len - 0.4 };
        this.onFlutter();
      } else if (f.fledAt >= 0 && t - f.fledAt > 20 && d > 9) f.fledAt = -1; // they come back
    }
    if (this.flocks.size > 200) this.flocks.clear();
  }
}
