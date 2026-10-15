import { Biome, CHUNK_CELLS, CHUNK_ZOOM, Ground, Structure, hashInts, tileToLngLat, type Chunk } from "@familiar-ground/world-core";
import { LightKind, T, bakeChunk, type Baked, type Light, type RGB } from "./lumenBake.ts";
import { createFillCanvas } from "./sample.ts";
import type { Renderer, View } from "./types.ts";

/** Screen pixels per texel (a cell is T texels wide). */
const LEVELS = [
  { texel: 6, speed: 1 },
  { texel: 5, speed: 1 },
  { texel: 4, speed: 0.9 },
  { texel: 3, speed: 0.8 },
  { texel: 2, speed: 0.65 },
];
/** Animation is gentle, so ~30 fps is plenty and kinder to phone batteries. */
const FRAME_MS = 33;
const BAKES_PER_FRAME = 2;
const PLAYER_LANTERN: RGB = [255, 200, 130];

const rand = (a: number, b: number, salt: number) => hashInts(a, b, salt) / 4294967296;
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const CANOPY: Record<Biome, [RGB, RGB, RGB]> = {
  [Biome.TEMPERATE]: [[52, 120, 56], [70, 140, 64], [40, 100, 50]],
  [Biome.OVERGROWN]: [[40, 130, 50], [60, 160, 60], [30, 110, 44]],
  [Biome.FUNGAL]: [[50, 110, 120], [80, 90, 150], [40, 130, 120]],
  [Biome.AUTUMN]: [[200, 110, 40], [220, 160, 50], [170, 70, 40]],
  [Biome.FROST]: [[60, 104, 92], [228, 238, 248], [40, 80, 72]],
};

type TimeMode = "evening" | "night" | "dusk" | "day" | "auto";

/**
 * "Lumen": chunky pixels in the dark, lit by streetlamps, windows, neon shop signs, glowing fungi
 * and your own lantern. Trees sway, water glints, and particles drift according to the biome.
 *
 * Each frame: static texels come from per-chunk baked canvases; canopies, water and particles are
 * drawn on top; a low-res light map (ambient + additive light sprites) is multiplied over the
 * scene with smoothing for soft falloff; emissive texels and soft bloom halos go on last.
 */
export class LumenRenderer implements Renderer {
  /** With biomes off, everywhere is temperate: same lighting, no fantasy zones. */
  constructor(private readonly biomes: boolean) {
    const t = new URLSearchParams(location.search).get("time");
    this.timeMode = t === "night" || t === "day" || t === "dusk" || t === "auto" ? t : "evening";
  }

  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private readonly frame = document.createElement("canvas");
  private readonly frameCtx = this.frame.getContext("2d")!;
  private readonly glow = document.createElement("canvas");
  private readonly glowCtx = this.glow.getContext("2d")!;
  private readonly lightMap = document.createElement("canvas");
  private readonly lightCtx = this.lightMap.getContext("2d")!;
  private width = 0;
  private height = 0;
  private last = 0;
  private readonly baked = new Map<Chunk, Baked>();
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private readonly canopies = new Map<string, HTMLCanvasElement>();
  private readonly timeMode: TimeMode;

  mount(container: HTMLElement): void {
    this.canvas = createFillCanvas(container, true);
    this.ctx = this.canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  viewRadius(view: View): number {
    return Math.ceil((0.75 * Math.max(this.width, this.height)) / (LEVELS[view.zoomLevel]!.texel * T)) + 12;
  }

  chunkChanged(chunk: Chunk): void {
    this.baked.delete(chunk);
  }

  chunkEvicted(chunk: Chunk): void {
    this.baked.delete(chunk);
  }

  render(view: View): boolean {
    const now = performance.now();
    if (now - this.last < FRAME_MS) return true;
    this.last = now;
    const t = now / 1000;
    const { texel } = LEVELS[view.zoomLevel]!;
    const cell = texel * T;
    const { player } = view;

    // Visible cells, with the camera snapped to whole texels.
    const ox = Math.round(this.width / 2 - (player.x + 0.5) * cell);
    const oy = Math.round(this.height / 2 - (player.y + 0.5) * cell);
    const gx0 = Math.floor(-ox / cell) - 1;
    const gy0 = Math.floor(-oy / cell) - 1;
    const cols = Math.ceil(this.width / cell) + 3;
    const rows = Math.ceil(this.height / cell) + 3;
    const fw = cols * T;
    const fh = rows * T;
    for (const c of [this.frame, this.glow]) if (c.width !== fw || c.height !== fh) [c.width, c.height] = [fw, fh];
    if (this.lightMap.width !== cols || this.lightMap.height !== rows) [this.lightMap.width, this.lightMap.height] = [cols, rows];

    const light = this.lighting(player.x);
    const { frameCtx: f, glowCtx: e } = this;
    f.imageSmoothingEnabled = false;
    e.imageSmoothingEnabled = false;
    f.fillStyle = "#000";
    f.fillRect(0, 0, fw, fh);
    e.clearRect(0, 0, fw, fh);

    // Static layers from baked chunks (a couple of new bakes per frame).
    let bakes = 0;
    const lights: Light[] = [];
    const visible: { chunk: Chunk; baked: Baked }[] = [];
    for (const chunk of view.world.loaded()) {
      const cx = chunk.cx * CHUNK_CELLS - gx0;
      const cy = chunk.cy * CHUNK_CELLS - gy0;
      if (cx > cols + 16 || cy > rows + 16 || cx + CHUNK_CELLS < -16 || cy + CHUNK_CELLS < -16) continue;
      let baked = this.baked.get(chunk);
      if (!baked && bakes < BAKES_PER_FRAME) {
        baked = bakeChunk(chunk, view.seed, this.biomes);
        this.baked.set(chunk, baked);
        bakes++;
      }
      if (!baked) continue;
      visible.push({ chunk, baked });
      f.drawImage(baked.albedo, cx * T, cy * T);
      e.drawImage(baked.emissive, cx * T, cy * T);
      for (const l of baked.lights) {
        if (l.x - l.r > gx0 + cols || l.x + l.r < gx0 || l.y - l.r > gy0 + rows || l.y + l.r < gy0) continue;
        lights.push(l);
      }
    }

    // Moving things, over the visible cells only.
    for (const { chunk, baked } of visible) {
      const x0 = Math.max(0, gx0 - chunk.cx * CHUNK_CELLS);
      const y0 = Math.max(0, gy0 - chunk.cy * CHUNK_CELLS);
      const x1 = Math.min(CHUNK_CELLS - 1, gx0 + cols - chunk.cx * CHUNK_CELLS);
      const y1 = Math.min(CHUNK_CELLS - 1, gy0 + rows - chunk.cy * CHUNK_CELLS);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * CHUNK_CELLS + x;
          const gx = chunk.cx * CHUNK_CELLS + x;
          const gy = chunk.cy * CHUNK_CELLS + y;
          const tx = (gx - gx0) * T;
          const ty = (gy - gy0) * T;
          const s = chunk.structure[i]!;
          const g = chunk.ground[i]!;
          const b = baked.biome[i] as Biome;
          if (s === Structure.TREE) this.drawCanopy(f, b, gx, gy, tx, ty, t);
          else if (g === Ground.WATER) this.drawWater(f, gx, gy, tx, ty, t, b);
          else if (s === Structure.BUILDING) this.drawSmoke(f, gx, gy, tx, ty, t, light.dark);
          if (s !== Structure.BUILDING) this.drawParticles(f, e, b, g, gx, gy, tx, ty, t, light.dark);
        }
      }
    }

    // The player and their lantern.
    const ptx = (player.x - gx0) * T;
    const pty = (player.y - gy0) * T;
    this.drawPlayer(f, e, ptx, pty, player.fx);
    lights.push({ x: player.x + 0.5, y: player.y + 0.5, r: 13, color: PLAYER_LANTERN, kind: LightKind.LAMP, intensity: 1, phase: 0.3 });

    // Light map: ambient plus additive light sprites, one pixel per cell.
    const lc = this.lightCtx;
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = rgba(light.ambient);
    lc.fillRect(0, 0, cols, rows);
    lc.globalCompositeOperation = "lighter";
    for (const l of lights) {
      lc.globalAlpha = Math.min(1, l.intensity * flicker(l, t) * (0.35 + 0.65 * light.dark));
      lc.drawImage(this.sprite(l.color), l.x - gx0 - l.r, l.y - gy0 - l.r, l.r * 2, l.r * 2);
    }
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = "source-over";

    // Compose: pixels, × light (smooth), + emissive texels, + bloom.
    const { ctx } = this;
    const dx = ox + gx0 * cell;
    const dy = oy + gy0 * cell;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.frame, dx, dy, fw * texel, fh * texel);
    ctx.globalCompositeOperation = "multiply";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.lightMap, dx, dy, cols * cell, rows * cell);
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.4 + 0.6 * light.dark;
    ctx.drawImage(this.glow, dx, dy, fw * texel, fh * texel);
    ctx.globalAlpha = 1;
    if (light.dark > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      for (const l of lights) {
        if (l.kind === LightKind.WINDOW) continue;
        const r = l.r * cell * (l.kind === LightKind.FUNGUS ? 0.9 : 0.55);
        ctx.globalAlpha = 0.22 * light.dark * flicker(l, t) * l.intensity;
        ctx.drawImage(this.sprite(l.color), dx + (l.x - gx0) * cell - r, dy + (l.y - gy0) * cell - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    return true; // always animating
  }

  /**
   * Ambient light from the time of day: a readable evening by default; ?time=night|dusk|day picks
   * one, and ?time=auto follows the sun at this longitude.
   */
  private lighting(playerX: number): { ambient: RGB; dark: number } {
    let day: number;
    if (this.timeMode === "auto") {
      const lng = tileToLngLat(playerX / CHUNK_CELLS, 0, CHUNK_ZOOM).lng;
      const now = new Date();
      const solar = (now.getUTCHours() + now.getUTCMinutes() / 60 + lng / 15 + 48) % 24;
      day = Math.max(0, Math.min(1, (Math.cos(((solar - 13) / 24) * Math.PI * 2) + 0.15) * 1.6));
    } else day = { evening: 0.35, night: 0, dusk: 0.5, day: 1 }[this.timeMode];
    const night: RGB = [58, 60, 92];
    const dusk: RGB = [190, 160, 165];
    const noon: RGB = [255, 255, 250];
    const ambient: RGB =
      day < 0.5
        ? night.map((v, k) => v + (dusk[k]! - v) * (day / 0.5)) as RGB
        : dusk.map((v, k) => v + (noon[k]! - v) * ((day - 0.5) / 0.5)) as RGB;
    return { ambient, dark: 1 - day };
  }

  private drawCanopy(f: CanvasRenderingContext2D, b: Biome, gx: number, gy: number, tx: number, ty: number, t: number): void {
    const variant = Math.floor(rand(gx, gy, 40) * 3);
    const phase = rand(gx, gy, 41) * Math.PI * 2;
    // Sway: shift a texel when the breeze peaks; neighbouring trees are out of step.
    const w = Math.sin(t * 1.3 + phase + gx * 0.15);
    const sway = w > 0.65 ? 1 : w < -0.65 ? -1 : 0;
    f.drawImage(this.canopy(b, variant), tx - 2 + sway, ty - 3);
  }

  private drawWater(f: CanvasRenderingContext2D, gx: number, gy: number, tx: number, ty: number, t: number, b: Biome): void {
    if (rand(gx, gy, 50) > 0.25) return;
    const wave = Math.sin(t * 2 + gx * 0.6 + gy * 0.3 + rand(gx, gy, 51) * 6);
    if (wave < 0.55) return;
    f.fillStyle = b === Biome.FROST ? "rgba(235,245,255,0.9)" : "rgba(120,180,240,0.85)";
    f.fillRect(tx + (rand(gx, gy, 52) < 0.5 ? 0 : 1), ty + (wave > 0.85 ? 0 : 1), 1, 1);
  }

  /** Chimney smoke from a few buildings: grey puffs rising and fading. */
  private drawSmoke(f: CanvasRenderingContext2D, gx: number, gy: number, tx: number, ty: number, t: number, dark: number): void {
    if (rand(gx, gy, 60) > 0.0025 || dark < 0.2) return;
    for (let k = 0; k < 5; k++) {
      const age = (t * 0.8 + k * 0.6 + rand(gx, gy, 61) * 3) % 3;
      f.fillStyle = `rgba(150,150,155,${(0.5 * (1 - age / 3)).toFixed(2)})`;
      f.fillRect(tx + Math.round(Math.sin(age * 2 + k) * 1.2), ty - Math.round(age * 4), 1, 1);
    }
  }

  private drawParticles(f: CanvasRenderingContext2D, e: CanvasRenderingContext2D, b: Biome, g: number, gx: number, gy: number, tx: number, ty: number, t: number, dark: number): void {
    const r = rand(gx, gy, 70);
    const ph = rand(gx, gy, 71) * Math.PI * 2;
    const green = g === Ground.PARK || g === Ground.FOREST || g === Ground.GRASS || g === Ground.WETLAND;
    switch (b) {
      case Biome.TEMPERATE:
      case Biome.OVERGROWN:
        // Fireflies over greenery at night, blinking as they wander.
        if (green && dark > 0.4 && r < (b === Biome.OVERGROWN ? 0.008 : 0.004) && Math.sin(t * 2.2 + ph) > 0.1) {
          e.fillStyle = "rgb(210,255,120)";
          e.fillRect(tx + Math.round(Math.sin(t * 0.7 + ph) * 3), ty + Math.round(Math.cos(t * 0.53 + ph) * 3), 1, 1);
        }
        break;
      case Biome.FUNGAL:
        // Spores drifting up from the ground.
        if (r < 0.006) {
          const rise = (t * 2.5 + ph * 4) % 14;
          e.fillStyle = `rgba(120,240,255,${(0.9 * (1 - rise / 14)).toFixed(2)})`;
          e.fillRect(tx + Math.round(Math.sin(t + ph) * 1.5), ty - Math.round(rise), 1, 1);
        }
        break;
      case Biome.AUTUMN:
        // Falling leaves.
        if (r < 0.006) {
          const fall = (t * 4 + ph * 5) % 18;
          f.fillStyle = r < 0.003 ? "rgb(220,120,40)" : "rgb(230,180,60)";
          f.fillRect(tx + Math.round(fall * 0.4 + Math.sin(t * 2 + ph) * 1.5), ty - 9 + Math.round(fall), 1, 1);
        }
        break;
      case Biome.FROST:
        // Snow.
        if (r < 0.03) {
          const fall = (t * 6 + ph * 6) % 20;
          f.fillStyle = "rgba(250,252,255,0.95)";
          f.fillRect(tx + Math.round(Math.sin(t * 1.5 + ph) * 1.2), ty - 10 + Math.round(fall), 1, 1);
        }
        break;
    }
  }

  private drawPlayer(f: CanvasRenderingContext2D, e: CanvasRenderingContext2D, tx: number, ty: number, facing: number): void {
    const px = (c: string, x: number, y: number) => {
      f.fillStyle = c;
      f.fillRect(tx + x, ty + y, 1, 1);
    };
    // 3×4 texels, standing on the cell.
    px("#4a2c1a", 0, -2); px("#4a2c1a", 1, -2);
    px("#f1c27d", 0, -1); px("#f1c27d", 1, -1);
    px("#d63a3a", -1, 0); px("#d63a3a", 0, 0); px("#d63a3a", 1, 0);
    px("#2b3a67", 0, 1); px("#2b3a67", 1, 1);
    e.fillStyle = "rgb(255,220,150)";
    e.fillRect(tx + (facing < 0 ? -1 : 2), ty, 1, 1); // lantern
  }

  /** Soft radial light sprite per colour. */
  private sprite(c: RGB): HTMLCanvasElement {
    const key = c.join(",");
    let s = this.sprites.get(key);
    if (s) return s;
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const ctx = s.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(c, 1));
    grad.addColorStop(0.35, rgba(c, 0.55));
    grad.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.sprites.set(key, s);
    return s;
  }

  /** 5×5 texel canopy: rounded blob with a lit top-left and shaded bottom-right. */
  private canopy(b: Biome, variant: number): HTMLCanvasElement {
    const key = `${b}:${variant}`;
    let c = this.canopies.get(key);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = 5;
    const ctx = c.getContext("2d")!;
    const [base, light, dark] = CANOPY[b];
    const shape = [".###.", "#####", "#####", "#####", ".###."];
    shape.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== "#") return;
        if (variant === 2 && (x + y) % 4 === 0) return; // a scruffier variant
        const lit = x + y < 3;
        const shade = x + y > 5;
        const k = 0.9 + rand(x + variant * 7, y, b) * 0.2;
        // Frost trees are snow-capped: white where the light catches them.
        const col = lit ? light : shade ? dark : base;
        ctx.fillStyle = rgba([col[0] * k, col[1] * k, col[2] * k]);
        ctx.fillRect(x, y, 1, 1);
      }),
    );
    this.canopies.set(key, c);
    return c;
  }

  destroy(): void {
    this.canvas.remove();
    this.baked.clear();
  }
}

function flicker(l: Light, t: number): number {
  switch (l.kind) {
    case LightKind.LAMP:
      return 0.92 + 0.08 * Math.sin(t * 7 + l.phase * 20) * Math.sin(t * 3.1 + l.phase * 9);
    case LightKind.SIGN:
      return Math.sin(t * 0.5 + l.phase * 30) > 0.97 ? 0.3 : 1; // the odd neon stutter
    case LightKind.FUNGUS:
      return 0.65 + 0.35 * Math.sin(t * 1.2 + l.phase * 6);
    default:
      return 1;
  }
}
