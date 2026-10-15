import { CHUNK_CELLS, Ground, Structure, type Chunk } from "@familiar-ground/world-core";
import { BUILDING_RGB, GROUND_RGB, NAMED_BUILDING_RGB, TREE_RGB, WALL_RGB, buildingLevels } from "../palette.ts";
import { buildGroundAtlas, buildPlayerSprite, buildTreeSprites, T, VARIANTS } from "./pixelTiles.ts";
import { CellSampler, cellNoise, createFillCanvas } from "./sample.ts";
import type { Renderer, View } from "./types.ts";

/** Pixels per cell. Tile levels are whole multiples of the 8-texel tiles; smaller ones switch to a minimap. */
const LEVELS = [
  { cell: 32, speed: 1 },
  { cell: 24, speed: 1 },
  { cell: 16, speed: 1 },
  { cell: 8, speed: 0.9 },
  { cell: 4, speed: 0.75 },
  { cell: 2, speed: 0.6 },
  { cell: 1, speed: 0.5 },
];

type RGB = [number, number, number];
const css = ([r, g, b]: RGB, k = 1) => `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`;

/** Roof/wall palettes picked per building, so a street isn't one colour. */
const ROOFS: [roof: RGB, wall: RGB][] = [
  [[172, 84, 64], [222, 200, 170]],
  [[96, 104, 124], [214, 210, 200]],
  [[136, 96, 72], [200, 176, 150]],
  [[150, 150, 156], [232, 224, 210]],
  [[118, 70, 60], [190, 120, 96]],
];

const isRoad = (g: number) => g === Ground.ROAD_MINOR || g === Ground.ROAD_MAJOR;

/** Top-down pixel art with a 3/4 view: buildings show their roof plus a south wall whose height follows their floors. */
export class PixelRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private readonly atlas = buildGroundAtlas();
  private readonly trees = buildTreeSprites();
  private readonly playerSprite = buildPlayerSprite();
  private readonly minimaps = new Map<Chunk, HTMLCanvasElement>();

  mount(container: HTMLElement): void {
    this.canvas = createFillCanvas(container, true);
    this.ctx = this.canvas.getContext("2d")!;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    // Drawn at CSS resolution and scaled up "pixelated" by the browser: cheaper, and pixels stay crisp.
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  viewRadius(view: View): number {
    return Math.ceil((0.75 * Math.max(this.width, this.height)) / LEVELS[view.zoomLevel]!.cell) + 4;
  }

  chunkChanged(chunk: Chunk): void {
    this.minimaps.delete(chunk);
  }

  chunkEvicted(chunk: Chunk): void {
    this.minimaps.delete(chunk);
  }

  render(view: View): void {
    const { ctx } = this;
    const cell = LEVELS[view.zoomLevel]!.cell;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, this.width, this.height);
    const ox = Math.floor(this.width / 2 - (view.player.x + 0.5) * cell);
    const oy = Math.floor(this.height / 2 - (view.player.y + 0.5) * cell);
    if (cell >= T) this.drawTiles(view, cell, ox, oy);
    else this.drawMinimap(view, cell, ox, oy);
  }

  private drawTiles(view: View, cell: number, ox: number, oy: number): void {
    const { ctx, atlas } = this;
    const s = new CellSampler(view.world);
    const u = cell / T; // screen pixels per texel
    const gx0 = Math.floor(-ox / cell) - 1;
    const gx1 = Math.ceil((this.width - ox) / cell) + 1;
    const gy0 = Math.floor(-oy / cell) - 1;
    const gy1 = Math.ceil((this.height - oy) / cell) + 3; // rows below can rise into view (tall walls, trees)

    // Pass 1: ground tiles, with foam along shores and kerbs along roads.
    for (let gy = gy0; gy <= gy1; gy++) {
      const sy = oy + gy * cell;
      for (let gx = gx0; gx <= gx1; gx++) {
        const sx = ox + gx * cell;
        if (!s.at(gx, gy)) continue;
        const g = s.chunk!.ground[s.i]!;
        const v = Math.floor(cellNoise(gx, gy) * VARIANTS);
        ctx.drawImage(atlas, v * T, g * T, T, T, sx, sy, cell, cell);
        if (g === Ground.WATER || isRoad(g)) {
          const edge = g === Ground.WATER ? "rgba(220,240,255,0.7)" : "rgba(200,200,200,0.55)";
          const differs = (n: number) => n >= 0 && (g === Ground.WATER ? n !== Ground.WATER : !isRoad(n));
          ctx.fillStyle = edge;
          if (differs(s.ground(gx, gy - 1))) ctx.fillRect(sx, sy, cell, u);
          if (differs(s.ground(gx, gy + 1))) ctx.fillRect(sx, sy + cell - u, cell, u);
          if (differs(s.ground(gx - 1, gy))) ctx.fillRect(sx, sy, u, cell);
          if (differs(s.ground(gx + 1, gy))) ctx.fillRect(sx + cell - u, sy, u, cell);
        }
      }
    }

    // Pass 2: things that stand up, row by row from the back so nearer rows overlap farther ones.
    for (let gy = gy0; gy <= gy1; gy++) {
      const sy = oy + gy * cell;
      for (let gx = gx0; gx <= gx1; gx++) {
        if (!s.at(gx, gy)) continue;
        const st = s.chunk!.structure[s.i]!;
        const sx = ox + gx * cell;
        if (st === Structure.BUILDING) this.drawBuildingCell(s, gx, gy, sx, sy, cell, u);
        else if (st === Structure.TREE) ctx.drawImage(this.trees[(gx * 7 + gy) & 1]!, sx, sy - cell / 2, cell, cell * 1.5);
        else if (st === Structure.WALL) {
          const lift = Math.round(cell * 0.6);
          ctx.fillStyle = css(WALL_RGB, 0.75);
          ctx.fillRect(sx, sy + cell - lift, cell, lift);
          ctx.fillStyle = css(WALL_RGB);
          ctx.fillRect(sx, sy - lift, cell, cell);
          ctx.fillStyle = css(WALL_RGB, 0.6);
          for (let k = 1; k < 3; k++) ctx.fillRect(sx, sy + cell - lift + (k * lift) / 3, cell, u);
        }
      }
      if (gy === view.player.y) {
        const px = ox + view.player.x * cell;
        ctx.drawImage(this.playerSprite, px, oy + gy * cell - cell * 0.25, cell, cell * 1.25);
      }
    }
  }

  private drawBuildingCell(s: CellSampler, gx: number, gy: number, sx: number, sy: number, cell: number, u: number): void {
    const { ctx } = this;
    const chunk = s.chunk!;
    const i = s.i;
    const index = chunk.building[i]!;
    const b = chunk.buildings[index];
    const named = !!b && b.kind !== "building";
    const levels = buildingLevels(chunk, i);
    const lift = Math.round(Math.min(2.5, 0.3 + 0.35 * levels) * cell / u) * u;
    let hash = 0;
    for (const c of b?.id ?? "") hash = (hash * 31 + c.charCodeAt(0)) | 0;
    const [roof, wall] = named ? [NAMED_BUILDING_RGB, [236, 224, 200] as RGB] : ROOFS[Math.abs(hash) % ROOFS.length]!;
    const isB = (x: number, y: number) => s.structure(x, y) === Structure.BUILDING;
    const north = isB(gx, gy - 1);
    const south = isB(gx, gy + 1);
    const west = isB(gx - 1, gy);
    const east = isB(gx + 1, gy);
    s.at(gx, gy); // restore the sampler to this cell after the neighbour lookups

    // South wall where the building ends, so the building appears to stand up.
    if (!south) {
      const top = sy + cell - lift;
      ctx.fillStyle = css(wall, 0.92);
      ctx.fillRect(sx, top, cell, lift);
      ctx.fillStyle = css(wall, 0.7);
      ctx.fillRect(sx, sy + cell - u, cell, u);
      if (lift >= 4 * u) {
        ctx.fillStyle = named ? "rgb(70,110,140)" : "rgb(60,70,90)";
        for (let wy = top + 2 * u; wy + 2 * u <= sy + cell - u; wy += 3 * u)
          for (let wx = sx + u; wx + u <= sx + cell; wx += 3 * u) ctx.fillRect(wx, wy, u * 1.5, u * 1.5);
      }
      if (named) {
        ctx.fillStyle = (gx & 1) === 0 ? "rgb(200,60,60)" : "rgb(240,240,240)"; // shop awning
        ctx.fillRect(sx, top, cell, u * 1.5);
      }
    }
    // Roof, lifted by the wall height, with darker eaves where the building ends.
    const ry = sy - lift;
    ctx.fillStyle = css(roof);
    ctx.fillRect(sx, ry, cell, cell);
    ctx.fillStyle = css(roof, 0.88);
    for (let k = 1; k < T; k += 2) ctx.fillRect(sx, ry + k * u, cell, u * 0.5);
    ctx.fillStyle = css(roof, 0.65);
    if (!north) ctx.fillRect(sx, ry, cell, u);
    if (!south) ctx.fillRect(sx, ry + cell - u, cell, u);
    if (!west) ctx.fillRect(sx, ry, u, cell);
    if (!east) ctx.fillRect(sx + cell - u, ry, u, cell);
  }

  /** Zoomed far out: one cached pixel per cell per chunk, scaled up. */
  private drawMinimap(view: View, cell: number, ox: number, oy: number): void {
    const { ctx } = this;
    const span = CHUNK_CELLS * cell;
    for (const chunk of view.world.loaded()) {
      const sx = ox + chunk.cx * CHUNK_CELLS * cell;
      const sy = oy + chunk.cy * CHUNK_CELLS * cell;
      if (sx > this.width || sy > this.height || sx + span < 0 || sy + span < 0) continue;
      ctx.drawImage(this.minimap(chunk), sx, sy, span, span);
    }
    const px = ox + view.player.x * cell;
    const py = oy + view.player.y * cell;
    ctx.fillStyle = "#fff";
    ctx.fillRect(px - 3, py - 3, 7, 7);
    ctx.fillStyle = "#e53935";
    ctx.fillRect(px - 2, py - 2, 5, 5);
  }

  private minimap(chunk: Chunk): HTMLCanvasElement {
    let c = this.minimaps.get(chunk);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = c.height = chunk.size;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(chunk.size, chunk.size);
    for (let i = 0; i < chunk.size * chunk.size; i++) {
      const st = chunk.structure[i];
      let color: RGB =
        st === Structure.BUILDING
          ? chunk.buildings[chunk.building[i]!]?.kind !== "building" && chunk.building[i]! >= 0
            ? NAMED_BUILDING_RGB
            : BUILDING_RGB
          : st === Structure.TREE
            ? TREE_RGB
            : st === Structure.WALL
              ? WALL_RGB
              : GROUND_RGB[chunk.ground[i] as Ground];
      const k = 0.94 + cellNoise(chunk.cx * 256 + (i & 255), chunk.cy * 256 + (i >> 8)) * 0.12;
      color = [color[0] * k, color[1] * k, color[2] * k];
      img.data.set([color[0], color[1], color[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    this.minimaps.set(chunk, c);
    return c;
  }

  destroy(): void {
    this.canvas.remove();
    this.minimaps.clear();
  }
}
