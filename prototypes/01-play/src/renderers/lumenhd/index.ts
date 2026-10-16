import { CHUNK_CELLS, hashInts, type Chunk, type Point } from "@familiar-ground/world-core";
import { Scene, type SceneBuilding } from "../../../../02-gallery/src/scene.ts";
import { CellSampler, createFillCanvas } from "../sample.ts";
import type { Renderer, View } from "../types.ts";
import { Ambience, type SoundMood } from "./audio.ts";
import { T, TILE, bakeTile, bbox, drawCar, pointIn, type BakeMood, type Emitter, type Lamp, type TileBake, type TreeSpot } from "./bake.ts";
import { covers, drawBuilding, emittersOf, lift, planFor, type Camera, type Paint, type Plan } from "./buildings.ts";
import { Life } from "./life.ts";
import { PLAYER_LOOK, canopy, drawPerson, drawPigeon, glowSprite } from "./sprites.ts";
import { makeTextures, texCanvas, type RGB, type Textures } from "./textures.ts";

/** Pixels per cell. Integer texel sizes (P / 8) keep the chunky texels even. */
const LEVELS = [
  { P: 40, speed: 0.45 },
  { P: 32, speed: 0.55 },
  { P: 24, speed: 0.7 },
  { P: 16, speed: 0.85 },
  { P: 8, speed: 0.8 },
];
const FRAME_MS = 33;
const TILE_CACHE = 140;

export type MoodId = "golden" | "day" | "night" | "rain" | "cycle";
interface Mood {
  /** 0 = full daylight, 1 = deep night: how much the light map and glows matter. */
  dark: number;
  ambient: RGB;
  shadow: number;
  rain: boolean;
  grade: RGB | null;
  sound: SoundMood;
}
const MOODS: Record<Exclude<MoodId, "cycle">, Mood> = {
  day: { dark: 0, ambient: [255, 255, 255], shadow: 0.3, rain: false, grade: [255, 236, 200], sound: "day" },
  golden: { dark: 0.3, ambient: [255, 196, 150], shadow: 0.34, rain: false, grade: [255, 150, 70], sound: "golden" },
  night: { dark: 1, ambient: [50, 58, 104], shadow: 0.12, rain: false, grade: null, sound: "night" },
  rain: { dark: 0.85, ambient: [74, 84, 118], shadow: 0.06, rain: true, grade: null, sound: "rain" },
};
const BAKE: Record<MoodId, BakeMood> = {
  day: { sun: [0.45, 0.3], wet: false, litWindows: 0.03 },
  golden: { sun: [0.95, 0.4], wet: false, litWindows: 0.22 },
  night: { sun: [0.3, 0.2], wet: false, litWindows: 0.36 },
  rain: { sun: [0.3, 0.2], wet: true, litWindows: 0.4 },
  cycle: { sun: [0.6, 0.35], wet: false, litWindows: 0.3 },
};
const CANOPY: [RGB, RGB, RGB][] = [
  [[60, 124, 58], [104, 168, 78], [36, 84, 44]],
  [[70, 136, 64], [120, 180, 86], [40, 92, 48]],
  [[52, 112, 70], [92, 156, 96], [30, 76, 50]],
  [[86, 130, 52], [140, 176, 70], [52, 90, 36]],
];
const CANOPY_AUTUMN: [RGB, RGB, RGB] = [[196, 110, 44], [232, 170, 70], [140, 66, 34]];

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/**
 * Lumen HD: a detailed, living pixel world. Smooth vector geometry (no stepped diagonals) at full
 * screen resolution, textured with chunky texels; live buildings with windows, doors, shopfronts and
 * roof clutter; props, parked cars, traffic, pedestrians, pigeons, swaying trees, chimney smoke,
 * rippling water; lamps, lit windows, neon and your lantern; rain; generative music.
 * Two cameras: oblique 3/4 or perspective from the player (button or C key).
 */
export class LumenHDRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private container!: HTMLElement;
  private readonly glow = document.createElement("canvas");
  private readonly light = document.createElement("canvas");
  private readonly waterLayer = document.createElement("canvas");
  private dpr = 1;
  private width = 1;
  private height = 1;
  private last = 0;
  private P = 0;
  private tex!: Textures;
  private paint: Paint | null = null;
  private readonly tiles = new Map<string, TileBake>();
  private readonly plans = new Map<string, Plan>();
  private scene: Scene | null = null;
  private sceneAt = { x: NaN, y: NaN, P: 0 };
  private sceneStale = true;
  private shops = new Set<SceneBuilding>();
  private emitters: Emitter[] = [];
  private cells!: CellSampler;
  private life!: Life;
  private ambience!: Ambience;
  private camButton!: HTMLButtonElement;
  private camMode: "oblique" | "persp";
  private pos = { x: NaN, y: NaN };
  private walked = 0;
  private splashes: { x: number; y: number; t: number }[] = [];
  private keyHandler = (e: KeyboardEvent) => {
    if ((e.key === "c" || e.key === "C") && !(e.target instanceof HTMLSelectElement)) this.toggleCamera();
  };

  constructor(private readonly moodId: MoodId) {
    const cam = new URLSearchParams(location.search).get("cam");
    this.camMode = cam === "persp" || cam === "perspective" ? "persp" : "oblique";
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.canvas = createFillCanvas(container, false);
    this.ctx = this.canvas.getContext("2d")!;
    this.tex = makeTextures(7);
    this.ambience = new Ambience(container);
    this.camButton = document.createElement("button");
    this.camButton.type = "button";
    this.camButton.style.cssText =
      "position:absolute;top:56px;right:8px;z-index:5;min-width:44px;min-height:40px;border-radius:8px;border:1px solid #fff4;background:#0008;color:#fff;font:15px system-ui;padding:6px 10px;cursor:pointer";
    this.camButton.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.camButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleCamera();
    });
    container.append(this.camButton);
    this.labelCamera();
    window.addEventListener("keydown", this.keyHandler);
  }

  private toggleCamera(): void {
    this.camMode = this.camMode === "oblique" ? "persp" : "oblique";
    this.labelCamera();
    const params = new URLSearchParams(location.search);
    params.set("cam", this.camMode);
    history.replaceState(null, "", `?${params}`);
  }
  private labelCamera(): void {
    this.camButton.textContent = this.camMode === "oblique" ? "📐 Oblique" : "🎥 Perspective";
    this.camButton.title = "Switch camera: oblique 3/4 or perspective from the player (C)";
  }

  resize(width: number, height: number): void {
    // Render at device resolution (capped), so smooth lines stay smooth on phones.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(width * this.dpr));
    this.height = Math.max(1, Math.round(height * this.dpr));
    for (const c of [this.canvas, this.glow, this.waterLayer]) [c.width, c.height] = [this.width, this.height];
    this.sceneStale = true;
  }

  viewRadius(view: View): number {
    const P = LEVELS[view.zoomLevel]!.P * this.dpr;
    return Math.ceil((0.6 * Math.max(this.width, this.height)) / P) + 40;
  }

  chunkLoaded(chunk: Chunk): void {
    this.dropTiles(chunk);
    this.sceneStale = true;
  }
  chunkChanged(chunk: Chunk): void {
    this.dropTiles(chunk);
    this.plans.clear();
    this.sceneStale = true;
  }
  chunkEvicted(chunk: Chunk): void {
    this.dropTiles(chunk);
  }
  private dropTiles(chunk: Chunk): void {
    const n = CHUNK_CELLS / TILE;
    // Neighbouring tiles too: buildings and props overhang tile edges.
    for (const [key, t] of this.tiles) {
      if (t.tx >= chunk.cx * n - 1 && t.tx <= (chunk.cx + 1) * n && t.ty >= chunk.cy * n - 1 && t.ty <= (chunk.cy + 1) * n + 3) this.tiles.delete(key);
    }
  }

  private mood(t: number): { m: Mood; id: Exclude<MoodId, "cycle"> } {
    if (this.moodId !== "cycle") return { m: MOODS[this.moodId], id: this.moodId };
    // A four-minute day: day → golden → night → dawn → day.
    const tod = (t / 240) % 1;
    const stops: [number, Exclude<MoodId, "cycle">][] = [[0, "day"], [0.3, "day"], [0.42, "golden"], [0.55, "night"], [0.85, "night"], [0.94, "golden"], [1, "day"]];
    let i = 0;
    while (i < stops.length - 2 && stops[i + 1]![0] <= tod) i++;
    const [t0, a] = stops[i]!;
    const [t1, b] = stops[i + 1]!;
    const u = t1 > t0 ? (tod - t0) / (t1 - t0) : 0;
    const A = MOODS[a];
    const B = MOODS[b];
    return {
      m: { dark: A.dark + (B.dark - A.dark) * u, ambient: mixRGB(A.ambient, B.ambient, u), shadow: A.shadow + (B.shadow - A.shadow) * u, rain: false, grade: u < 0.5 ? A.grade : B.grade, sound: u < 0.5 ? A.sound : B.sound },
      id: u < 0.5 ? a : b,
    };
  }

  render(view: View): boolean {
    const now = performance.now();
    if (now - this.last < FRAME_MS) return true;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    const P = LEVELS[view.zoomLevel]!.P * this.dpr;
    const k = P / T;
    if (P !== this.P) {
      this.P = P;
      this.tiles.clear();
      this.sceneStale = true;
      this.paint = null;
    }
    if (!this.cells) {
      this.cells = new CellSampler(view.world);
      this.life = new Life(this.cells, () => this.ambience.flutter());
    }
    const { m: mood } = this.mood(t);
    this.ambience.setMood(mood.sound);
    const bakeMood = BAKE[this.moodId];
    const W = this.width;
    const H = this.height;

    // Smooth camera: glide after the player's cell-by-cell steps.
    const tx = view.player.x + 0.5;
    const ty = view.player.y + 0.5;
    if (!Number.isFinite(this.pos.x) || Math.hypot(tx - this.pos.x, ty - this.pos.y) > 8) this.pos = { x: tx, y: ty };
    const ease = Math.min(1, dt * 14);
    const before = { ...this.pos };
    this.pos.x += (tx - this.pos.x) * ease;
    this.pos.y += (ty - this.pos.y) * ease;
    this.walked += Math.hypot(this.pos.x - before.x, this.pos.y - before.y);
    const moving = Math.hypot(tx - this.pos.x, ty - this.pos.y) > 0.05;
    const camX = Math.round(this.pos.x * P) / P;
    const camY = Math.round(this.pos.y * P) / P;
    const X = (gx: number) => (gx - camX) * P + W / 2;
    const Y = (gy: number) => (gy - camY) * P + H / 2;
    const cam: Camera = { mode: this.camMode, cx: W / 2, cy: H / 2, camH: Math.max(W, H) * 0.85 };
    const viewCells = Math.max(W, H) / P / 2;

    // Vector data around the player (rebuilt as you move).
    if (this.sceneStale || Math.hypot(camX - this.sceneAt.x, camY - this.sceneAt.y) > 10) this.rebuildScene(view, camX, camY, W, H, P);
    const ctx = this.ctx;
    if (!this.paint) this.paint = this.makePaint(ctx);
    this.alignPaint(X(0), Y(0), k);

    // Tiles covering the view (and a margin), baking at most one per frame.
    const tx0 = Math.floor((camX - W / 2 / P) / TILE) - 1;
    const ty0 = Math.floor((camY - H / 2 / P) / TILE) - 1;
    const tx1 = Math.floor((camX + W / 2 / P) / TILE) + 1;
    const ty1 = Math.floor((camY + H / 2 / P) / TILE) + 1;
    const visible: TileBake[] = [];
    let baked = 0;
    let missing = false;
    for (let y = ty0; y <= ty1; y++)
      for (let x = tx0; x <= tx1; x++) {
        const key = `${x},${y}`;
        let tile = this.tiles.get(key);
        if (!tile) {
          const onScreen = x > tx0 && x < tx1 && y > ty0 && y < ty1;
          if (baked >= (onScreen ? 6 : 2)) {
            missing = true;
            continue;
          }
          tile = bakeTile(view.world, view.seed, this.tex, x, y, P, bakeMood, this.scene!);
          baked++;
        }
        this.tiles.delete(key);
        this.tiles.set(key, tile);
        visible.push(tile);
      }
    while (this.tiles.size > TILE_CACHE) this.tiles.delete(this.tiles.keys().next().value!);
    void missing;
    const tileXY = (tl: TileBake) => [Math.round(X(tl.tx * TILE)), Math.round(Y(tl.ty * TILE))] as const;

    // --- Ground ---
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#0c0c10";
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    for (const tl of visible) ctx.drawImage(tl.ground, ...tileXY(tl));
    this.drawWater(ctx, visible, tileXY, t, k, X, Y);
    ctx.globalAlpha = mood.shadow;
    for (const tl of visible) ctx.drawImage(tl.shadow, ...tileXY(tl));
    ctx.globalAlpha = 1;
    if (mood.rain) this.drawSplashes(ctx, dt, t, W, H, k);
    for (const tl of visible) ctx.drawImage(tl.top, ...tileXY(tl)); // props: lamps, bins, benches, parked cars

    // --- Things that stand up, depth-sorted: buildings, trees, people, cars, birds ---
    const lights: Lamp[] = [];
    for (const tl of visible) for (const l of tl.lights) lights.push(l);
    const g = this.glow.getContext("2d")!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    for (const tl of visible) g.drawImage(tl.glow, ...tileXY(tl));
    const order = (gx: number, gy: number) => (cam.mode === "oblique" ? gy : -Math.hypot(X(gx) - cam.cx, Y(gy) - cam.cy) / P);
    const items: { o: number; draw: () => void }[] = [];
    const sc = this.scene!;
    const margin = 4;
    const litChance = Math.max(0.03, bakeMood.litWindows * Math.min(1, mood.dark * 1.5 + 0.1));
    const drawn: { b: SceneBuilding; plan: Plan; o: number }[] = [];
    for (const b of sc.buildings) {
      const bb = bbox(b);
      if (X(bb.maxX) < -W * 0.3 || X(bb.minX) > W * 1.3 || Y(bb.maxY) < -H * 0.2 || Y(bb.minY) > H * 1.6) continue;
      const plan = this.planOf(b);
      // Oblique: by the south edge. Perspective: by distance to the camera of the nearest point.
      const nx = Math.max(bb.minX, Math.min(camX, bb.maxX));
      const ny = Math.max(bb.minY, Math.min(camY, bb.maxY));
      const o = cam.mode === "oblique" ? bb.maxY : -Math.hypot(nx - camX, ny - camY);
      drawn.push({ b, plan, o });
      items.push({ o, draw: () => drawBuilding(ctx, g, b, plan, cam, X, Y, k, this.paint!, litChance, lights) });
    }
    const trees: TreeSpot[] = [];
    for (const tl of visible) for (const tr of tl.trees) trees.push(tr);
    const canopyAlpha = (tr: TreeSpot) => (Math.hypot(tr.x - camX, tr.y - 0.8 - camY) < tr.radius / T + 0.3 ? 0.45 : 1);
    for (const tr of trees) {
      if (X(tr.x) < -60 || X(tr.x) > W + 60 || Y(tr.y) < -60 || Y(tr.y) > H + 100) continue;
      items.push({ o: order(tr.x, tr.y), draw: () => this.drawTree(ctx, tr, X, Y, k, t, canopyAlpha(tr), cam) });
    }
    // Life.
    const perches: Point[] = [];
    for (const tl of visible) for (const p of tl.perches) perches.push(p);
    this.life.update(dt, t, tx, ty, viewCells, perches);
    for (const w of this.life.walkers) {
      const dir = Math.abs(w.dx) > Math.abs(w.dy) ? (w.dx < 0 ? 2 : 3) : w.dy < 0 ? 1 : 0;
      items.push({ o: order(w.x, w.y), draw: () => drawPerson(ctx, Math.round(X(w.x)), Math.round(Y(w.y)), k, w.look, dir, Math.floor(w.travelled * 4)) });
    }
    for (const c of this.life.cars) {
      items.push({ o: order(c.x, c.y), draw: () => drawCar(ctx, ctx, X(c.x), Y(c.y), c.ang, c.color, k, mood.dark > 0.3) });
      if (mood.dark > 0.3) {
        R(g, X(c.x) + Math.cos(c.ang) * 9 * k, Y(c.y) + Math.sin(c.ang) * 9 * k, k, "rgb(255,250,220)");
        lights.push({ x: c.x + Math.cos(c.ang) * 3, y: c.y + Math.sin(c.ang) * 3, r: 4, color: [255, 240, 200], kind: "lamp", phase: 0 });
      }
    }
    for (const f of this.life.flocks.values()) {
      if (Math.abs(f.x - camX) > viewCells + 4 || Math.abs(f.y - camY) > viewCells + 4) continue;
      const since = f.fledAt < 0 ? -1 : t - f.fledAt;
      if (since > 2.5) continue;
      for (const b of f.birds) {
        const x = f.x + b.ox + (since > 0 ? f.away.x * since * since * 5 + b.ox * since : 0);
        const y = f.y + b.oy + (since > 0 ? f.away.y * since * since * 5 : 0);
        const lifted = since > 0 ? since * 30 * k : 0;
        const peck = since < 0 && Math.sin(t * 3 + b.phase) > 0.6;
        const hop = since < 0 ? Math.round(Math.sin(t * 0.7 + b.phase) * 0.6) : 0;
        items.push({ o: order(x, y) + (since > 0 ? 100 : 0), draw: () => drawPigeon(ctx, X(x + hop * 0.1), Y(y) - lifted, k, since > 0 ? Math.floor(t * 14 + b.phase) : -1, peck, b.phase > 5) });
      }
    }
    // The player.
    const facing = view.player.fx < 0 && Math.abs(view.player.fx) >= Math.abs(view.player.fy) ? 2 : view.player.fx > 0 && Math.abs(view.player.fx) >= Math.abs(view.player.fy) ? 3 : view.player.fy < 0 ? 1 : 0;
    const step = moving ? Math.floor(this.walked * 4) : 0;
    const playerO = order(this.pos.x, this.pos.y + 0.01);
    items.push({ o: playerO, draw: () => drawPerson(ctx, Math.round(X(this.pos.x)), Math.round(Y(this.pos.y + 0.35)), k, PLAYER_LOOK, facing, step) });
    items.sort((a, b) => a.o - b.o);
    for (const it of items) it.draw();
    // See-through silhouette when a building is between you and the camera.
    const px = Math.round(X(this.pos.x));
    const py = Math.round(Y(this.pos.y + 0.35));
    if (drawn.some((d) => d.o > playerO && covers(d.b, d.plan, cam, X, Y, k, px, py - 4 * k))) drawPerson(ctx, px, py, k, PLAYER_LOOK, facing, step, true);

    // --- Air: smoke and steam, leaves, fireflies, moths, rain ---
    this.drawEmitters(ctx, X, Y, k, t, cam);
    this.drawParticles(ctx, g, trees, lights, X, Y, k, t, mood, W, H);

    // --- Light ---
    if (mood.dark > 0.02) {
      const lp = Math.max(4, P / 2);
      const lw = Math.ceil(W / lp) + 2;
      const lh = Math.ceil(H / lp) + 2;
      if (this.light.width !== lw || this.light.height !== lh) [this.light.width, this.light.height] = [lw, lh];
      const lc = this.light.getContext("2d")!;
      lc.globalCompositeOperation = "source-over";
      lc.globalAlpha = 1;
      lc.fillStyle = rgba(mixRGB([255, 255, 255], mood.ambient, Math.min(1, mood.dark * 1.2)));
      lc.fillRect(0, 0, lw, lh);
      lc.globalCompositeOperation = "lighter";
      const LX = (gx: number) => X(gx) / lp;
      const LY = (gy: number) => Y(gy) / lp;
      const cellL = P / lp;
      for (const l of lights) {
        const r = l.r * cellL;
        lc.globalAlpha = Math.min(1, flicker(l, t) * mood.dark * (l.kind === "window" ? 0.7 : 1));
        lc.drawImage(glowSprite(l.color), LX(l.x) - r, LY(l.y) - r, r * 2, r * 2);
      }
      // Your lantern, and a torch beam where you're facing at night.
      lc.globalAlpha = Math.min(1, mood.dark * 0.9);
      const pr = 4.5 * cellL;
      lc.drawImage(glowSprite([255, 206, 140]), LX(this.pos.x) - pr, LY(this.pos.y) - pr, pr * 2, pr * 2);
      if (mood.dark > 0.5) {
        const a = Math.atan2(view.player.fy, view.player.fx);
        lc.save();
        lc.translate(LX(this.pos.x), LY(this.pos.y));
        lc.rotate(a);
        const grad = lc.createRadialGradient(0, 0, 0, 0, 0, 9 * cellL);
        grad.addColorStop(0, "rgba(255,240,210,0.55)");
        grad.addColorStop(1, "rgba(255,240,210,0)");
        lc.fillStyle = grad;
        lc.beginPath();
        lc.moveTo(0, 0);
        lc.arc(0, 0, 9 * cellL, -0.42, 0.42);
        lc.closePath();
        lc.fill();
        lc.restore();
      }
      lc.globalAlpha = 1;
      ctx.globalCompositeOperation = "multiply";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.light, 0, 0, lw * lp, lh * lp);
      ctx.globalCompositeOperation = "source-over";
      // Emissive pixels and bloom.
      ctx.globalAlpha = Math.min(1, mood.dark * 1.3);
      ctx.drawImage(this.glow, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      for (const l of lights) {
        if (l.kind === "window" || l.kind === "door") continue;
        const r = l.r * P * 0.55;
        ctx.globalAlpha = 0.22 * mood.dark * flicker(l, t);
        ctx.drawImage(glowSprite(l.color, 0.15), X(l.x) - r, Y(l.y) - r - 10 * k, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (mood.rain) this.drawRain(ctx, t, W, H, k);

    // --- Grade ---
    if (mood.grade) {
      ctx.globalCompositeOperation = "soft-light";
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, rgba(mood.grade, 0.55));
      grad.addColorStop(1, rgba(mood.grade, 0.1));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, `rgba(0,0,10,${0.25 + mood.dark * 0.25})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    return true;
  }

  private rebuildScene(view: View, camX: number, camY: number, W: number, H: number, P: number): void {
    this.sceneStale = false;
    this.sceneAt = { x: camX, y: camY, P };
    const sc = new Scene(view.world, view.seed, camX, camY + 12, 1, Math.ceil(W / P) + 50, Math.ceil(H / P) + 80);
    this.scene = sc;
    this.shops = new Set();
    for (const p of sc.pois) {
      if (!p.inBuilding) continue;
      const b = sc.buildings.find((bb) => pointIn(bb.rings[0]!, p.x + 0.5, p.y + 0.5));
      if (b) this.shops.add(b);
    }
    this.emitters = [];
    for (const b of sc.buildings) this.emitters.push(...emittersOf(b, this.planOf(b)));
    this.life.setScene(sc);
  }

  private planOf(b: SceneBuilding): Plan {
    const key = `${b.id}:${Math.round(b.cx * 4)}:${Math.round(b.cy * 4)}`;
    let p = this.plans.get(key);
    if (!p) {
      p = planFor(b, this.shops.has(b), this.cells);
      this.plans.set(key, p);
      if (this.plans.size > 4000) this.plans.clear();
    }
    return p;
  }

  private makePaint(ctx: CanvasRenderingContext2D): Paint {
    const pat = (t: { w: number; h: number; data: Uint8ClampedArray }) => ctx.createPattern(texCanvas(t), "repeat")!;
    return { walls: this.tex.walls.map(pat), pitched: this.tex.roofsPitched.map(pat), flat: this.tex.roofsFlat.map(pat), rubble: pat(this.tex.rubble) };
  }
  /** Pins the texture patterns to the world, so they move with the ground. */
  private alignPaint(x0: number, y0: number, k: number): void {
    const p = this.paint!;
    const m = new DOMMatrix().translate(x0, y0).scale(k);
    for (const pat of [...p.walls, ...p.pitched, ...p.flat, p.rubble]) pat.setTransform(m);
  }

  private drawTree(ctx: CanvasRenderingContext2D, tr: TreeSpot, X: (x: number) => number, Y: (y: number) => number, k: number, t: number, alpha: number, cam: Camera): void {
    const autumn = this.moodId === "golden" && tr.variant === 3;
    const sprite = canopy(tr.radius, tr.variant, k, autumn ? CANOPY_AUTUMN : CANOPY[tr.variant]!);
    const phase = r01(Math.round(tr.x * 8), Math.round(tr.y * 8), 1) * 6.28;
    const sway = (Math.sin(t * 1.1 + phase + tr.x * 0.2) + Math.sin(t * 2.3 + phase) * 0.35) * k * 0.7;
    const base = lift(cam, 9 * k);
    const x = X(tr.x);
    const y = Y(tr.y);
    const top = { x: base.a * x + base.e, y: base.d * y + base.f };
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, Math.round(top.x - sprite.width / 2 + sway), Math.round(top.y - sprite.height / 2));
    ctx.globalAlpha = 1;
  }

  private drawWater(ctx: CanvasRenderingContext2D, tiles: TileBake[], at: (t: TileBake) => readonly [number, number], t: number, k: number, X: (x: number) => number, Y: (y: number) => number): void {
    const wet = tiles.filter((tl) => tl.water);
    if (!wet.length) return;
    const w = this.waterLayer.getContext("2d")!;
    w.globalCompositeOperation = "source-over";
    w.clearRect(0, 0, this.width, this.height);
    for (const tl of wet) w.drawImage(tl.water!, ...at(tl));
    // Slow moving ripples, clipped to the water.
    w.globalCompositeOperation = "source-in";
    w.fillStyle = "rgba(0,0,0,0)";
    const step = Math.max(2, Math.round(k * 2));
    for (let y = 0; y < this.height; y += step) {
      const wy = (y - Y(0)) / (k * 8);
      const ph = Math.sin(wy * 2.1 + t * 0.9) + Math.sin(wy * 0.7 - t * 0.6);
      w.fillStyle = ph > 1.2 ? "rgba(170,210,240,0.35)" : ph < -1.1 ? "rgba(10,30,60,0.3)" : "rgba(0,0,0,0)";
      w.fillRect(0, y, this.width, Math.max(1, Math.round(k * 0.7)));
    }
    ctx.drawImage(this.waterLayer, 0, 0);
    // Glints.
    for (const tl of wet)
      for (let i = 0; i + 1 < tl.waterPts.length; i += 2) {
        const gx = tl.waterPts[i]!;
        const gy = tl.waterPts[i + 1]!;
        const s = Math.sin(t * 2.2 + gx * 1.7 + gy * 0.9);
        if (s < 0.92) continue;
        const x = Math.round(X(gx));
        const y = Math.round(Y(gy));
        ctx.fillStyle = "rgba(235,248,255,0.9)";
        ctx.fillRect(x - k, y, 3 * k, Math.ceil(k * 0.8));
        if (s > 0.98) ctx.fillRect(x, y - k, k, 3 * k);
      }
  }

  private drawEmitters(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (y: number) => number, k: number, t: number, cam: Camera): void {
    for (const e of this.emitters) {
      const m = lift(cam, e.lift * k);
      const x0 = m.a * X(e.x) + m.e;
      const y0 = m.d * Y(e.y) + m.f;
      if (x0 < -50 || x0 > this.width + 50 || y0 < -100 || y0 > this.height + 50) continue;
      for (let i = 0; i < 7; i++) {
        const age = (t * (e.kind === "steam" ? 0.6 : 0.35) + i / 7 + e.phase) % 1;
        const r = (1.2 + age * (e.kind === "steam" ? 3 : 4)) * k;
        const x = x0 + (age * 10 + Math.sin(age * 6 + i) * 1.5) * k;
        const y = y0 - age * 26 * k;
        ctx.fillStyle = e.kind === "steam" ? `rgba(240,244,250,${(0.4 * (1 - age)).toFixed(2)})` : `rgba(110,106,104,${(0.45 * (1 - age)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, g: CanvasRenderingContext2D, trees: TreeSpot[], lights: Lamp[], X: (x: number) => number, Y: (y: number) => number, k: number, t: number, mood: Mood, W: number, H: number): void {
    // Falling leaves from some trees, by day and at golden hour.
    if (mood.dark < 0.6 && !mood.rain)
      for (const tr of trees) {
        const h = r01(Math.round(tr.x * 8), Math.round(tr.y * 8), 9);
        if (h > 0.3) continue;
        const age = (t * 0.25 + h * 10) % 1;
        const x = X(tr.x) + (Math.sin(age * 9 + h * 20) * 6 + age * 16) * k;
        const y = Y(tr.y) - (16 - age * 18) * k;
        ctx.fillStyle = this.moodId === "golden" ? "rgb(230,150,60)" : "rgb(120,170,80)";
        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(k), Math.ceil(k * (age * 7 % 1 > 0.5 ? 1 : 0.5)));
      }
    // Butterflies by day, fireflies at night, near trees.
    for (const tr of trees) {
      const h = r01(Math.round(tr.x * 8), Math.round(tr.y * 8), 10);
      if (h > 0.25) continue;
      const a = t * 0.6 + h * 30;
      const x = X(tr.x) + Math.sin(a) * 2.5 * T * k * 0.5;
      const y = Y(tr.y) + Math.cos(a * 1.3) * 1.5 * T * k * 0.5 - 4 * k;
      if (mood.dark < 0.4) {
        ctx.fillStyle = h < 0.1 ? "#f4f0f8" : "#f0c040";
        const flap = Math.sin(t * 18 + h * 50) > 0 ? 1 : 0.4;
        ctx.fillRect(Math.round(x - k * flap), Math.round(y), Math.ceil(k * flap), Math.ceil(k));
        ctx.fillRect(Math.round(x + k * 0.2), Math.round(y), Math.ceil(k * flap), Math.ceil(k));
      } else if (Math.sin(t * 2.4 + h * 40) > 0.2) {
        g.fillStyle = "rgb(210,255,120)";
        g.fillRect(Math.round(x), Math.round(y), Math.ceil(k), Math.ceil(k));
      }
    }
    // Moths around lamps at night.
    if (mood.dark > 0.5)
      for (const l of lights) {
        if (l.kind !== "lamp") continue;
        for (let i = 0; i < 2; i++) {
          const a = t * (3 + i) + l.phase * 20 + i * 2;
          const x = X(l.x) + Math.cos(a) * 2.5 * k;
          const y = Y(l.y) - 13 * k + Math.sin(a * 1.3) * 1.5 * k;
          g.fillStyle = "rgb(255,250,230)";
          g.fillRect(Math.round(x), Math.round(y), Math.ceil(k * 0.6), Math.ceil(k * 0.6));
        }
      }
    // Dust motes in the golden light.
    if (this.moodId === "golden") {
      ctx.fillStyle = "rgba(255,230,170,0.6)";
      for (let i = 0; i < 40; i++) {
        const x = (r01(i, 1) * W + t * 6 * (0.5 + r01(i, 2))) % W;
        const y = (r01(i, 3) * H + Math.sin(t * 0.5 + i) * 10) % H;
        ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(k * 0.5), Math.ceil(k * 0.5));
      }
    }
  }

  private drawSplashes(ctx: CanvasRenderingContext2D, dt: number, t: number, W: number, H: number, k: number): void {
    for (let i = 0; i < Math.ceil((W * H) / 9000 * dt * 30); i++) this.splashes.push({ x: Math.random() * W, y: Math.random() * H, t });
    this.splashes = this.splashes.filter((s) => t - s.t < 0.35);
    ctx.strokeStyle = "rgba(200,215,240,0.55)";
    ctx.lineWidth = Math.max(1, k * 0.4);
    for (const s of this.splashes) {
      const a = (t - s.t) / 0.35;
      ctx.globalAlpha = 1 - a;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, (1 + a * 3) * k, (0.5 + a * 1.4) * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawRain(ctx: CanvasRenderingContext2D, t: number, W: number, H: number, k: number): void {
    ctx.strokeStyle = "rgba(190,205,240,0.35)";
    ctx.lineWidth = Math.max(1, k * 0.35);
    ctx.beginPath();
    const n = Math.round((W * H) / 2200);
    for (let i = 0; i < n; i++) {
      const speed = 500 + r01(i, 5) * 300;
      const x = (r01(i, 6) * (W + 100) - t * speed * 0.18) % (W + 100);
      const y = (r01(i, 7) * (H + 100) + t * speed) % (H + 100) - 50;
      const xx = x < 0 ? x + W + 100 : x;
      ctx.moveTo(xx, y);
      ctx.lineTo(xx - 3 * k * 0.6, y + 12 * k * 0.6);
    }
    ctx.stroke();
  }

  destroy(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.ambience?.destroy();
    this.camButton?.remove();
    this.canvas.remove();
    this.tiles.clear();
  }
}

function R(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - k), Math.round(y - k), Math.ceil(k * 2), Math.ceil(k * 2));
}

function flicker(l: Lamp, t: number): number {
  switch (l.kind) {
    case "lamp":
      return 0.92 + 0.08 * Math.sin(t * 7 + l.phase * 20) * Math.sin(t * 3.1 + l.phase * 9);
    case "sign":
      return Math.sin(t * 0.5 + l.phase * 30) > 0.97 ? 0.3 : 1; // the odd neon stutter
    default:
      return 1;
  }
}

