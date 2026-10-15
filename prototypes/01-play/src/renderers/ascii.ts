import { Structure, type Ground } from "@familiar-ground/world-core";
import { Display } from "rot-js";
import { poiAt } from "../pois.ts";
import { GROUND_GLYPHS, NAMED_BUILDING, PLAYER_GLYPH, POI_GLYPH, STRUCTURE_FG, UNLOADED } from "./asciiGlyphs.ts";
import type { Renderer, View } from "./types.ts";

/** Larger glyphs when zoomed in, then several map cells per character when zoomed out. */
const LEVELS = [
  { fontSize: 32, step: 1, speed: 1 },
  { fontSize: 24, step: 1, speed: 1 },
  { fontSize: 16, step: 1, speed: 0.85 },
  { fontSize: 16, step: 2, speed: 0.7 },
  { fontSize: 16, step: 4, speed: 0.55 },
];

export class AsciiRenderer implements Renderer {
  readonly zoomLevels = LEVELS;
  readonly defaultZoom = 2;
  private readonly display = new Display({ fontSize: 16, fontFamily: "ui-monospace, Menlo, Consolas, monospace", bg: "#000" });
  private size = { width: 0, height: 0 };

  mount(container: HTMLElement): void {
    container.append(this.display.getContainer()!);
  }

  resize(width: number, height: number): void {
    this.size = { width, height };
    const [cols, rows] = this.display.computeSize(width, height);
    this.display.setOptions({ width: Math.max(10, cols), height: Math.max(5, rows) });
  }

  viewRadius(view: View): number {
    const { width, height } = this.display.getOptions();
    return Math.max(width, height) * LEVELS[view.zoomLevel]!.step;
  }

  render(view: View): void {
    const level = LEVELS[view.zoomLevel]!;
    if (this.display.getOptions().fontSize !== level.fontSize) {
      this.display.setOptions({ fontSize: level.fontSize });
      this.resize(this.size.width, this.size.height);
    }
    const zoom = level.step;
    const { world, player } = view;
    const { width, height } = this.display.getOptions();
    // Snap to whole characters when zoomed out, so the map scrolls a character at a time.
    const left = Math.floor(player.x / zoom) * zoom - Math.floor(width / 2) * zoom;
    const top = Math.floor(player.y / zoom) * zoom - Math.floor(height / 2) * zoom;
    for (let sy = 0; sy < height; sy++) {
      for (let sx = 0; sx < width; sx++) {
        const gx = left + sx * zoom;
        const gy = top + sy * zoom;
        const c = world.cell(gx, gy);
        if (!c) {
          this.display.draw(sx, sy, ...UNLOADED);
          continue;
        }
        const { chunk, i } = c;
        const structure = chunk.structure[i] as Structure;
        let [ch, fg, bg] = GROUND_GLYPHS[chunk.ground[i] as Ground];
        const s = STRUCTURE_FG[structure];
        if (structure === Structure.BUILDING && chunk.buildings[chunk.building[i]!]?.kind !== "building") {
          [ch, fg, bg] = NAMED_BUILDING;
        } else if (s) {
          [ch, fg] = s;
          bg = s[2] ?? bg;
        }
        if (zoom === 1 && poiAt(chunk, i)) [ch, fg] = POI_GLYPH;
        if (gx === player.x && gy === player.y) [ch, fg] = PLAYER_GLYPH;
        this.display.draw(sx, sy, ch, fg, bg);
      }
    }
    // Zoomed out, the player's own cell may not be sampled; always draw them at the centre.
    if (zoom > 1) this.display.draw(Math.floor(width / 2), Math.floor(height / 2), PLAYER_GLYPH[0], PLAYER_GLYPH[1], "#c03");
  }

  destroy(): void {
    this.display.getContainer()?.remove();
  }
}
