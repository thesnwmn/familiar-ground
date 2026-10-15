import { Ground, Structure } from "@familiar-ground/world-core";
import { GROUND_RGB, NAMED_BUILDING_RGB, TREE_RGB, WALL_RGB, buildingLevels } from "../palette.ts";
import { CellSampler, cellNoise, createFillCanvas } from "./sample.ts";
import type { Renderer, View } from "./types.ts";

/** Half-width of a tile diamond in pixels (tiles are 2s wide and s tall). */
const LEVELS = [
  { s: 28, speed: 1 },
  { s: 20, speed: 1 },
  { s: 14, speed: 0.9 },
  { s: 9, speed: 0.8 },
  { s: 6, speed: 0.65 },
  { s: 4, speed: 0.55 },
];

type RGB = [number, number, number];
const css = ([r, g, b]: RGB, k = 1) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;
const ROOFS: RGB[] = [
  [196, 112, 88],
  [126, 136, 160],
  [176, 140, 110],
  [190, 186, 176],
  [150, 96, 84],
];

/**
 * Classic isometric view (think SimCity 2000). Cells are diamonds drawn back to front, so taller
 * columns in front correctly hide what's behind them. Buildings are columns as tall as their floors.
 */
export class IsoRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  mount(container: HTMLElement): void {
    this.canvas = createFillCanvas(container, false);
    this.ctx = this.canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
  }

  viewRadius(view: View): number {
    const { s } = LEVELS[view.zoomLevel]!;
    return Math.ceil(this.width / (2 * s) + this.height / s) + 8;
  }

  render(view: View): void {
    const { ctx } = this;
    const { s } = LEVELS[view.zoomLevel]!;
    const h = s / 2;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#1d2533");
    sky.addColorStop(1, "#2c3442");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    const s2 = new CellSampler(view.world);
    const { x: px, y: py } = view.player;
    const cx0 = this.width / 2;
    const cy0 = this.height / 2;
    const unit = h; // pixels per metre-ish of height: one floor is about one tile-half tall
    // d = dx - dy runs across the screen, k = dx + dy runs down it (back to front).
    const dMax = Math.ceil(this.width / (2 * s)) + 2;
    const kMin = -Math.ceil(this.height / h / 2) - 2;
    const kMax = Math.ceil(this.height / h / 2) + 40; // cells in front may be tall enough to rise into view

    const heightAt = (gx: number, gy: number): number => {
      if (!s2.at(gx, gy)) return -1;
      const st = s2.chunk!.structure[s2.i];
      if (st === Structure.BUILDING) return buildingLevels(s2.chunk!, s2.i) * unit * 1.2;
      if (st === Structure.WALL) return unit * 1.2;
      return 0;
    };

    for (let k = kMin; k <= kMax; k++) {
      for (let d = -dMax; d <= dMax; d++) {
        if (((k + d) & 1) !== 0) continue;
        const dx = (k + d) / 2;
        const dy = (k - d) / 2;
        const gx = px + dx;
        const gy = py + dy;
        const sx = cx0 + d * s;
        const sy = cy0 + k * h;
        if (!s2.at(gx, gy)) continue;
        const chunk = s2.chunk!;
        const i = s2.i;
        const g = chunk.ground[i] as Ground;
        const st = chunk.structure[i]!;
        const noise = 0.95 + cellNoise(gx, gy) * 0.1;

        // Ground diamond (water sits slightly lower).
        const drop = g === Ground.WATER ? h * 0.3 : 0;
        this.diamond(sx, sy + drop, s, h, css(GROUND_RGB[g], noise));

        if (st === Structure.BUILDING || st === Structure.WALL) {
          const b = st === Structure.BUILDING ? chunk.buildings[chunk.building[i]!] : undefined;
          let hash = 0;
          for (const c of b?.id ?? "") hash = (hash * 31 + c.charCodeAt(0)) | 0;
          const top: RGB =
            st === Structure.WALL ? WALL_RGB : b && b.kind !== "building" ? NAMED_BUILDING_RGB : ROOFS[Math.abs(hash) % ROOFS.length]!;
          const height = st === Structure.WALL ? unit * 1.2 : buildingLevels(chunk, i) * unit * 1.2;
          // Only faces not hidden by an equally tall neighbour in front.
          const leftH = heightAt(gx, gy + 1);
          const rightH = heightAt(gx + 1, gy);
          if (leftH < height) this.face(sx, sy, s, h, height, -1, css(top, 0.78), s >= 9 && st === Structure.BUILDING ? unit * 1.2 : 0);
          if (rightH < height) this.face(sx, sy, s, h, height, 1, css(top, 0.6), s >= 9 && st === Structure.BUILDING ? unit * 1.2 : 0);
          this.diamond(sx, sy - height, s, h, css(top, noise));
        } else if (st === Structure.TREE) {
          const r = s * 0.55;
          ctx.fillStyle = "rgb(92,64,40)";
          ctx.fillRect(sx - s * 0.06, sy - r * 1.2, s * 0.12, r * 1.2);
          ctx.beginPath();
          ctx.ellipse(sx, sy - r * 1.7, r, r * 0.95, 0, 0, Math.PI * 2);
          ctx.fillStyle = css(TREE_RGB, noise);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(sx - r * 0.3, sy - r * 1.95, r * 0.45, r * 0.4, 0, 0, Math.PI * 2);
          ctx.fillStyle = css(TREE_RGB, 1.3);
          ctx.fill();
        }

        if (dx === 0 && dy === 0) this.drawPlayer(sx, sy, s);
      }
    }
  }

  private diamond(x: number, y: number, s: number, h: number, fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** A vertical face under the diamond's left (-1) or right (+1) lower edge, with optional floor lines. */
  private face(x: number, y: number, s: number, h: number, height: number, side: -1 | 1, fill: string, floor: number): void {
    const { ctx } = this;
    const ex = x + side * s;
    ctx.beginPath();
    ctx.moveTo(ex, y - height);
    ctx.lineTo(x, y + h - height);
    ctx.lineTo(x, y + h);
    ctx.lineTo(ex, y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (floor > 0) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let f = floor; f < height - 1; f += floor) {
        ctx.moveTo(ex, y - f);
        ctx.lineTo(x, y + h - f);
      }
      ctx.stroke();
    }
  }

  private drawPlayer(x: number, y: number, s: number): void {
    const { ctx } = this;
    const w = s * 0.35;
    const hgt = s * 1.3;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y, w * 1.1, w * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d63a3a";
    ctx.fillRect(x - w / 2, y - hgt, w, hgt * 0.75);
    ctx.fillStyle = "#f1c27d";
    ctx.beginPath();
    ctx.arc(x, y - hgt - w * 0.3, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  destroy(): void {
    this.canvas.remove();
  }
}
