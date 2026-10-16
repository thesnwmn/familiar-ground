import type { Scene as SceneType } from "../../../02-gallery/src/scene.ts";
import { Scene } from "../../../02-gallery/src/scene.ts";
import type { StillStyle } from "../../../02-gallery/src/styles/types.ts";
import { createFillCanvas } from "./sample.ts";
import type { Renderer, View } from "./types.ts";

/**
 * Pixels per cell (a cell is ~1.5 m in London). Up close and on foot are for walking and fights,
 * then close, vehicle (driving), street and district. Closer levels walk slower on screen.
 */
const LEVELS = [
  { scale: 40, speed: 0.45 },
  { scale: 28, speed: 0.55 },
  { scale: 20, speed: 0.65 },
  { scale: 14, speed: 0.8 },
  { scale: 7, speed: 0.9 },
  { scale: 4, speed: 0.75 },
  { scale: 2, speed: 0.6 },
];

/**
 * Plays any style-lab still style: each frame it builds a Scene around the player and lets the
 * style draw it. Not optimised (some styles take 100+ ms per frame), but you can walk around in all
 * of them to judge how they feel.
 */
export class LabRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private readonly frame = document.createElement("canvas");
  private width = 0;
  private height = 0;
  private busy = false;
  private cost = 0;
  private lastEnd = 0;
  private last: SceneType | undefined;
  readonly rotatable: boolean;

  constructor(private readonly style: StillStyle) {
    this.rotatable = !!style.rotatable;
  }

  streetAngle(): number | null {
    return this.last ? this.last.streetAngle() : null;
  }

  mount(container: HTMLElement): void {
    this.canvas = createFillCanvas(container, false);
    this.ctx = this.canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  viewRadius(view: View): number {
    return Math.ceil((0.75 * Math.max(this.width, this.height)) / LEVELS[view.zoomLevel]!.scale) + 30;
  }

  render(view: View): boolean {
    // Slow styles: don't queue frames faster than they can draw; ask to be called again instead.
    if (this.busy || performance.now() - this.lastEnd < this.cost * 0.5) return true;
    const t0 = performance.now();
    const sc = new Scene(view.world, view.seed, view.player.x + 0.5, view.player.y + 0.5, LEVELS[view.zoomLevel]!.scale, this.width, this.height);
    sc.view = { angle: this.rotatable ? view.angle : 0 };
    this.last = sc;
    this.frame.width = this.width;
    this.frame.height = this.height;
    const fctx = this.frame.getContext("2d", { willReadFrequently: true })!;
    const done = () => {
      this.blit(sc);
      this.cost = performance.now() - t0;
      this.lastEnd = performance.now();
      this.busy = false;
    };
    const result = this.style.draw(sc, fctx);
    if (result instanceof Promise) {
      this.busy = true;
      void result.then(done, done);
      return true;
    }
    done();
    return false;
  }

  private blit(sc: SceneType): void {
    this.ctx.drawImage(this.frame, 0, 0);
    // Playable mock-ups draw their own player; everything else gets a simple marker.
    if (this.style.id.startsWith("play-")) return;
    const x = sc.W / 2;
    const y = sc.H / 2;
    const r = Math.max(4, Math.min(9, sc.scale * 0.55));
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fillStyle = "#3aa0ff";
    this.ctx.fill();
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#fff";
    this.ctx.stroke();
  }

  destroy(): void {
    this.canvas.remove();
  }
}
