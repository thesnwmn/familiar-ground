import { css, hex, mix, mul, pick, type Cls, type RGB } from "../kit/color.ts";
import { braille, clsAtScreen, fogOfWar, glyphs, hexMap, radar } from "../kit/fancy.ts";
import { bg, buildingPath, buildings, extrude, isCarRoad, labels, pixelArt, roads, smoothMask, trees, type Ctx } from "../kit/layers.ts";
import { applyLighting, gatherLights, lightPoints } from "../kit/light.ts";
import { chromatic, gradientMap, grain, inkEdges, oneBit, pixelate, quantize, rain, scanlines, tiltShift, vignette } from "../kit/post.ts";
import type { Scene, SceneBuilding } from "../scene.ts";
import { isBuildingCls, isGreenCls, markings, planBase, planPalette, richShader, windowGrid } from "./common.ts";
import type { StillStyle } from "./types.ts";

const G = "Top-down games";

function noisePattern(ctx: Ctx, base: RGB, spread: number, size = 16, seed = 1): CanvasPattern {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  let s = seed * 7919;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      s = (s * 16807) % 2147483647;
      const k = 1 + ((s / 2147483647) - 0.5) * spread;
      g.fillStyle = css(mul(base, k));
      g.fillRect(x, y, 1, 1);
    }
  return ctx.createPattern(c, "repeat")!;
}

const ROOFS: RGB[] = [[120, 116, 110], [96, 92, 90], [140, 120, 100], [104, 110, 116]];

/** GTA1/2: textured ground, lane paint, buildings leaning away from a camera high above the player. */
export function gta(sc: Scene, ctx: Ctx, night: boolean, opts: { camera?: number } = {}): void {
  const pal = planPalette({ urban: [118, 112, 100], paved: [150, 146, 136], major: [60, 60, 62], minor: [68, 68, 70], park: [70, 110, 50], forest: [50, 90, 40], tree: [40, 80, 36], grass: [80, 116, 56], water: [40, 70, 110], building: [110, 106, 100] });
  pixelArt(sc, ctx, richShader(pal, { roofRows: false }), 8, 2);
  markings(sc, ctx, night ? "rgba(230,210,120,0.8)" : "rgba(240,220,120,0.9)", 2);
  const gravel = ROOFS.map((c, i) => noisePattern(ctx, c, 0.35, 12, i + 2));
  extrude(sc, ctx, {
    roof: (b) => (b.kind !== "building" ? gravel[0]! : gravel[Math.floor(b.r * 4)]!),
    wall: (b, s) => css(mul(b.kind !== "building" ? [190, 150, 110] : [150, 140, 130], 0.55 + s * 0.45)),
    outline: "rgba(0,0,0,0.5)",
    lineWidth: 1,
    heightK: 1.2,
    camera: opts.camera,
    windows: (b, quad, shade) => windowGrid(ctx, quad, night ? "rgba(255,220,140,0.95)" : `rgba(40,60,80,${0.5 + shade * 0.3})`, night ? (i) => ((i * 2654435761) >>> 0) % 7 < 3 + (b.r > 0.5 ? 1 : 0) : undefined),
    roofDetail: (b, pts) => {
      if (sc.scale < 3 || pts.length < 4) return;
      const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
      const s = Math.max(2, sc.scale * 0.8);
      ctx.fillStyle = "rgba(60,60,60,0.8)";
      ctx.fillRect(cx - s / 2 + (b.r - 0.5) * s * 3, cy - s / 2, s, s); // rooftop AC unit
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(cx - s / 2 + (b.r - 0.5) * s * 3, cy - s / 2, s, 1);
    },
  });
  if (night) {
    const lights = gatherLights(sc, { windowChance: 0.08 });
    applyLighting(sc, ctx, lights, { ambient: [70, 72, 110], bloom: 0.4 });
    lightPoints(sc, ctx, lights);
  }
}

export const GAME_STYLES: StillStyle[] = [
  { id: "gta2", name: "GTA2 day", group: G, blurb: "Top-down perspective like GTA 1/2: roofs lean out from the screen centre so you see walls, windows and rooftop clutter.", draw: (sc, ctx) => gta(sc, ctx, false) },
  { id: "gta2-night", name: "GTA2 night", group: G, blurb: "Mashup: GTA2 perspective with Lumen lighting: lamps, lit windows, neon signs.", draw: (sc, ctx) => gta(sc, ctx, true) },
  {
    id: "hotline",
    name: "Hotline Miami",
    group: G,
    blurb: "Hot pink and purple floors, hard black shadows, VHS scanlines and colour fringing.",
    draw(sc, ctx) {
      bg(ctx, [60, 10, 70]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [20, 160, 130]);
      smoothMask(sc, ctx, (c) => c === "water", [0, 200, 255]);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#ff2e88" } } : null));
      buildings(sc, ctx, { fill: (b) => (b.kind !== "building" ? "#ffe600" : b.r > 0.5 ? "#7b2cbf" : "#9d4edd"), stroke: () => "#14001e", lineWidth: Math.max(1.5, sc.scale * 0.3), shadow: { dx: 0.6, dy: 0.6, color: "rgba(0,0,0,0.85)" } });
      for (let y = 0; y < sc.H; y += Math.max(6, sc.scale * 2)) {
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fillRect(0, y, sc.W, Math.max(3, sc.scale));
      }
      chromatic(ctx, 2);
      scanlines(ctx, 0.25, 3);
      vignette(ctx, 0.6, "20,0,30");
    },
  },
  {
    id: "pokemon",
    name: "Pokémon GBA",
    group: G,
    blurb: "Bright GBA tiles: outlined roofs, tufted grass, flowerbeds, lollipop trees. Dense pixels (8 per cell).",
    draw(sc, ctx) {
      const pal = planPalette({ urban: [232, 224, 184], paved: [224, 216, 176], major: [200, 192, 168], minor: [214, 206, 176], park: [120, 200, 96], grass: [136, 208, 104], forest: [88, 168, 72], tree: [56, 152, 72], water: [96, 160, 248], building: [216, 72, 64], named: [64, 120, 216], path: [216, 192, 128] });
      pixelArt(sc, ctx, richShader(pal, { outline: [40, 32, 48], roofRows: true }), 8, 1);
      labels(sc, ctx, { font: "bold 10px ui-monospace, monospace", color: "#303030", halo: "#ffffff", upper: true, max: 6 });
    },
  },
  {
    id: "gameboy",
    name: "Game Boy (Link's Awakening)",
    group: G,
    blurb: "Four shades of pea green, ordered dithering, chunky pixels. Pokémon tiles squeezed through a DMG screen.",
    draw(sc, ctx) {
      GAME_STYLES[3]!.draw(sc, ctx);
      pixelate(ctx, 2);
      quantize(ctx, [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]], "bayer4", 40, 2);
    },
  },
  {
    id: "stardew",
    name: "Stardew cosy",
    group: G,
    blurb: "Warm, saturated farm-sim pixels: crops on farmland, picket fences round buildings, flower-dotted grass.",
    draw(sc, ctx) {
      const pal = planPalette({ urban: [170, 140, 96], paved: [196, 170, 130], major: [150, 130, 110], minor: [170, 150, 120], park: [108, 168, 64], grass: [120, 176, 70], forest: [70, 130, 50], tree: [60, 130, 50], water: [70, 150, 210], building: [180, 90, 60], named: [210, 150, 70], farm: [150, 110, 60] });
      const base = richShader(pal, { outline: [70, 40, 30], flowers: [[255, 120, 140], [255, 230, 120], [180, 140, 255]] });
      pixelArt(sc, ctx, (t) => {
        if (t.cls === "farm" && t.t >= 4) return (t.gx + t.tx) % 3 === 0 && t.ty > 0 ? [80, 150, 50] : [140, 100, 56];
        if (t.cls === "urban" && t.t >= 4) {
          const nearB = isBuildingCls(t.n(0, -1)) || isBuildingCls(t.n(0, 1)) || isBuildingCls(t.n(-1, 0)) || isBuildingCls(t.n(1, 0));
          if (nearB && (t.tx === 0 || t.ty === 0) && (t.tx + t.ty) % 2 === 0) return [240, 230, 210]; // picket fence
          return mix(pick(pal, "grass"), [170, 140, 96], 0.5);
        }
        return base(t);
      }, 8, 1);
      vignette(ctx, 0.25, "80,40,0");
    },
  },
  {
    id: "civ-hex",
    name: "Civ hex map",
    group: G,
    blurb: "Civilization: the city resampled into hexes, each with its dominant terrain and a little icon.",
    draw(sc, ctx) {
      const size = sc.scale >= 8 ? 14 : 10;
      hexMap(sc, ctx, size, (c) => {
        const m: Partial<Record<Cls, RGB>> = { water: [70, 130, 200], park: [120, 170, 80], forest: [70, 120, 60], tree: [70, 120, 60], grass: [140, 180, 90], building: [200, 180, 140], named: [230, 190, 90], major: [170, 150, 120], minor: [180, 165, 130], farm: [210, 200, 110] };
        return m[c] ?? [190, 180, 150];
      }, (c, x, y, s, r) => {
        ctx.save();
        if (c === "forest" || c === "tree" || c === "park") {
          ctx.fillStyle = "rgba(30,70,30,0.8)";
          for (const dx of [-0.35, 0.3]) (ctx.beginPath(), ctx.moveTo(x + dx * s, y - s * 0.45), ctx.lineTo(x + dx * s + s * 0.22, y + s * 0.15), ctx.lineTo(x + dx * s - s * 0.22, y + s * 0.15), ctx.fill());
        } else if (c === "building" || c === "named") {
          ctx.fillStyle = c === "named" ? "#7a2020" : "rgba(90,60,40,0.85)";
          ctx.fillRect(x - s * 0.3, y - s * 0.1, s * 0.6, s * 0.4);
          ctx.beginPath();
          ctx.moveTo(x - s * 0.38, y - s * 0.1);
          ctx.lineTo(x, y - s * 0.45);
          ctx.lineTo(x + s * 0.38, y - s * 0.1);
          ctx.fill();
        } else if (c === "water" && r < 0.4) {
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath();
          ctx.moveTo(x - s * 0.3, y);
          ctx.quadraticCurveTo(x, y - s * 0.2, x + s * 0.3, y);
          ctx.stroke();
        }
        ctx.restore();
      });
    },
  },
  {
    id: "factorio",
    name: "Factorio",
    group: G,
    blurb: "Every road is a conveyor belt with chevrons, every building a machine with vents and rivets, on brown dirt.",
    draw(sc, ctx) {
      bg(ctx, [86, 72, 52]);
      smoothMask(sc, ctx, (c) => c === "water", [40, 60, 70]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [70, 80, 44]);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "#2a2a2a", k: 0.7, add: 2 }, fill: { color: "#c8a000", k: 0.55 } } : null), "butt");
      if (sc.scale >= 2) roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(40,30,0,0.7)", k: 0.5, dash: [2, Math.max(4, sc.scale * 1.5)] } } : null), "butt");
      buildings(sc, ctx, { fill: (b) => (b.kind !== "building" ? "#7a6a8a" : "#6a6a70"), stroke: () => "#1c1c1e", lineWidth: Math.max(1, sc.scale * 0.2), shadow: { dx: 0.3, dy: 0.3, color: "rgba(0,0,0,0.5)" } });
      if (sc.scale >= 3) {
        for (const b of sc.buildings) {
          const x = sc.sx(b.cx);
          const y = sc.sy(b.cy);
          const s = sc.scale * 1.2;
          ctx.fillStyle = "#2a2a2c";
          ctx.fillRect(x - s, y - s / 2, s * 2, s);
          ctx.fillStyle = b.r > 0.5 ? "#ff8800" : "#44ccff";
          ctx.fillRect(x - s / 4, y - s / 4, s / 2, s / 2);
        }
      }
      grain(ctx, 14);
    },
  },
  {
    id: "frostpunk",
    name: "Frostpunk",
    group: G,
    blurb: "Snowbound city at the end of the world: white roofs, dark streets, warm windows and furnace glow against the cold.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [214, 222, 232], paved: [200, 208, 220], major: [70, 72, 80], minor: [96, 98, 106], building: [236, 240, 246], named: [240, 230, 220], water: [150, 180, 200], park: [220, 228, 236], forest: [190, 205, 215], tree: [80, 100, 100] }), { roadCasing: [240, 244, 250], buildingStroke: [90, 90, 100], shadow: { dx: 0.4, dy: 0.5, color: "rgba(30,40,60,0.35)" } });
      const lights = gatherLights(sc, { lamp: [255, 150, 60], window: [255, 170, 90], windowChance: 0.18 });
      applyLighting(sc, ctx, lights, { ambient: [110, 125, 170], bloom: 0.2, lightK: 0.7 });
      lightPoints(sc, ctx, lights);
      for (let i = 0; i < sc.W * sc.H * 0.004; i++) {
        const x = ((i * 7919) % 1000) / 1000 * sc.W;
        const y = ((i * 104729) % 1000) / 1000 * sc.H;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      vignette(ctx, 0.5, "10,20,40");
    },
  },
  {
    id: "snes",
    name: "SNES 16-bit",
    group: G,
    blurb: "A Link to the Past-ish: dense pixels (8 per cell), soft outlines, muted earthy greens, warm roofs.",
    draw(sc, ctx) {
      const pal = planPalette({ urban: [168, 160, 120], paved: [184, 176, 140], major: [136, 128, 104], minor: [152, 144, 112], park: [72, 152, 72], grass: [88, 160, 80], forest: [40, 112, 56], tree: [40, 120, 64], water: [64, 104, 176], building: [176, 96, 64], named: [104, 104, 168], path: [200, 168, 104] });
      pixelArt(sc, ctx, richShader(pal, { outline: [56, 40, 40] }), 8, 1);
      quantize(ctx, [[24, 24, 32], [56, 40, 40], [40, 112, 56], [72, 152, 72], [104, 184, 96], [64, 104, 176], [120, 160, 220], [176, 96, 64], [216, 136, 88], [104, 104, 168], [136, 128, 104], [168, 160, 120], [200, 192, 152], [232, 224, 192], [200, 168, 104], [248, 248, 232]], "none");
    },
  },
  {
    id: "pipboy",
    name: "Pip-Boy",
    group: G,
    blurb: "Fallout's wrist computer: monochrome green map, glowing lines, scanlines, a reticle on you.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [20, 20, 20], building: [90, 90, 90], named: [140, 140, 140], major: [60, 60, 60], minor: [50, 50, 50], water: [36, 36, 36], park: [30, 30, 30] }), { buildingStroke: [200, 200, 200], roadCasing: [120, 120, 120], treeColor: null });
      labels(sc, ctx, { font: "bold 10px ui-monospace, monospace", color: "#fff", upper: true, max: 8 });
      gradientMap(ctx, [[0, 10, 0], [20, 120, 40], [120, 255, 140]], 1.3);
      ctx.strokeStyle = "rgba(160,255,170,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sc.W / 2, sc.H / 2, 7, 0, Math.PI * 2);
      ctx.moveTo(sc.W / 2 - 12, sc.H / 2);
      ctx.lineTo(sc.W / 2 + 12, sc.H / 2);
      ctx.moveTo(sc.W / 2, sc.H / 2 - 12);
      ctx.lineTo(sc.W / 2, sc.H / 2 + 12);
      ctx.stroke();
      scanlines(ctx, 0.3, 3);
      vignette(ctx, 0.6);
    },
  },
  {
    id: "radar",
    name: "Radar minimap",
    group: G,
    blurb: "Submarine / RTS radar: green outlines, a sweeping beam and blips for every named place.",
    draw(sc, ctx) {
      bg(ctx, [4, 22, 10]);
      buildings(sc, ctx, { stroke: () => "rgba(80,255,120,0.35)", lineWidth: 1 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(80,255,120,0.18)", k: 0.3, add: 1 } } : null));
      radar(ctx, sc.pois.map((p) => ({ x: sc.sx(p.x), y: sc.sy(p.y) })));
    },
  },
  {
    id: "dwarf-fortress",
    name: "Dwarf Fortress",
    group: G,
    blurb: "Classic DF text-mode: CP437 glyphs, coloured by material: walls ▓, trees ♣, water ≈, roads ·.",
    draw(sc, ctx) {
      bg(ctx, [0, 0, 0]);
      const size = sc.scale >= 8 ? 12 : sc.scale >= 3 ? 9 : 7;
      glyphs(sc, ctx, size, (c, r) => {
        switch (c) {
          case "building": return ["▓", r < 0.5 ? "#a87850" : "#906040"];
          case "named": return ["☼", "#ffd040"];
          case "tree": return [r < 0.5 ? "♣" : "♠", r < 0.3 ? "#40c040" : "#208020"];
          case "forest": return [r < 0.4 ? "♣" : "'", "#208020"];
          case "park": case "grass": return [r < 0.3 ? "\"" : r < 0.6 ? "'" : ",", r < 0.5 ? "#50a030" : "#308020"];
          case "water": return ["≈", r < 0.5 ? "#3070ff" : "#2040c0", "#001040"];
          case "major": case "minor": return ["·", "#909090", "#202020"];
          case "path": return ["░", "#a08060"];
          case "rail": return ["═", "#c0c0c0"];
          case "wall": return ["#", "#c0c0c0"];
          default: return r < 0.15 ? [".", "#505050"] : null;
        }
      });
    },
  },
  {
    id: "braille",
    name: "Braille dot-matrix",
    group: G,
    blurb: "The whole map as Unicode Braille characters: 2×4 dots per letter, the finest text-mode trick there is.",
    draw(sc, ctx) {
      bg(ctx, [16, 16, 20]);
      braille(sc, ctx, 10, (c) => c === "building" || c === "named" || c === "water", "#e8e8f0");
      braille(sc, ctx, 10, (c) => c === "major", "rgba(255,180,80,0.9)");
    },
  },
  {
    id: "obra-dinn",
    name: "Obra Dinn 1-bit",
    group: G,
    blurb: "Return of the Obra Dinn: GTA-style perspective buildings with ink outlines, crushed to two dithered tones.",
    draw(sc, ctx) {
      // Clean, smooth base (textures would turn to dither noise), shaded perspective blocks, ink outlines.
      planBase(sc, ctx, planPalette({ urban: [200, 200, 200], paved: [210, 210, 210], major: [120, 120, 120], minor: [140, 140, 140], park: [150, 150, 150], forest: [110, 110, 110], tree: [90, 90, 90], water: [70, 70, 70], building: [170, 170, 170] }), { buildingStroke: null, shadow: { dx: 0.6, dy: 0.6, color: "rgba(0,0,0,0.45)" } });
      extrude(sc, ctx, { roof: (b) => css(mul([235, 235, 235], 0.9 + b.r * 0.1)), wall: (_b, s) => css(mul([200, 200, 200], 0.25 + s * 0.6)), outline: "rgba(0,0,0,0.9)", lineWidth: 1 });
      oneBit(ctx, [32, 24, 18], [228, 214, 180], 1, 0.02);
    },
  },
  {
    id: "rts-fog",
    name: "RTS fog of war",
    group: G,
    blurb: "Red Alert / StarCraft: gritty textured ground, selection circles on named buildings, and fog beyond your sight.",
    draw(sc, ctx) {
      const pal = planPalette({ urban: [120, 110, 86], major: [90, 86, 80], minor: [100, 96, 88], park: [90, 110, 56], grass: [100, 120, 60], forest: [60, 86, 40], water: [40, 70, 96], building: [130, 120, 110] });
      pixelArt(sc, ctx, richShader(pal), 4, 2);
      extrude(sc, ctx, { roof: (b) => css(b.kind !== "building" ? [140, 60, 50] : mul([130, 120, 110], 0.9 + b.r * 0.2)), wall: (_b, s) => css(mul([90, 84, 76], 0.6 + s * 0.4)), outline: "rgba(0,0,0,0.6)", heightK: 0.6 });
      ctx.strokeStyle = "rgba(80,255,80,0.9)";
      ctx.lineWidth = 1.5;
      for (const p of sc.pois.filter((p) => p.inBuilding).slice(0, 6)) {
        ctx.beginPath();
        ctx.ellipse(sc.sx(p.x), sc.sy(p.y), 10, 6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      fogOfWar(ctx, Math.min(sc.W, sc.H) * 0.38);
    },
  },
  {
    id: "cyberpunk-rain",
    name: "Cyberpunk rain",
    group: G,
    blurb: "Mashup: GTA perspective at night, magenta/cyan neon on every shop, wet streets, driving rain.",
    draw(sc, ctx) {
      gta(sc, ctx, false);
      const lights = gatherLights(sc, { lamp: [120, 220, 255], window: [255, 80, 200], signs: [[255, 40, 180], [0, 240, 255], [180, 80, 255]], windowChance: 0.1 });
      applyLighting(sc, ctx, lights, { ambient: [90, 70, 140], bloom: 0.55, radiusK: 1.2 });
      lightPoints(sc, ctx, lights);
      rain(ctx, 0.004, "rgba(170,200,255,0.35)");
      chromatic(ctx, 1);
    },
  },
  {
    id: "tilt-shift",
    name: "Tilt-shift toy town",
    group: G,
    blurb: "Mashup: GTA perspective, saturated colours and a tilt-shift blur that makes the real city look like a model.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [200, 210, 170], major: [90, 90, 96], minor: [110, 110, 116], park: [110, 200, 90], forest: [70, 170, 70], water: [70, 170, 230] }), { roadCasing: [240, 240, 230] });
      markings(sc, ctx, "rgba(255,255,255,0.9)");
      extrude(sc, ctx, {
        roof: (b) => css([[230, 90, 80], [250, 200, 80], [90, 160, 230], [240, 240, 240]][Math.floor(b.r * 4)] as RGB),
        wall: (b, s) => css(mul([[200, 70, 60], [220, 170, 60], [70, 130, 200], [210, 210, 210]][Math.floor(b.r * 4)] as RGB, 0.6 + s * 0.4)),
        outline: "rgba(0,0,0,0.2)",
      });
      tiltShift(ctx, 5);
    },
  },
  {
    id: "zelda-dungeon-map",
    name: "Dungeon map",
    group: G,
    blurb: "Zelda's dungeon map screen: buildings as rooms on a grid, corridors for roads, a skull on the boss room (the biggest named place).",
    draw(sc, ctx) {
      bg(ctx, [24, 20, 40]);
      const grid = Math.max(8, sc.scale * 4);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#8a7a5a", k: 0.3, add: 2 } } : null), "square");
      for (const b of sc.buildings) {
        const x = Math.round(sc.sx(b.cx) / grid) * grid;
        const y = Math.round(sc.sy(b.cy) / grid) * grid;
        ctx.fillStyle = b.kind !== "building" ? "#e8c070" : "#5a7ad0";
        ctx.fillRect(x - grid / 2 + 1, y - grid / 2 + 1, grid - 2, grid - 2);
        ctx.strokeStyle = "#1a1830";
        ctx.strokeRect(x - grid / 2 + 1.5, y - grid / 2 + 1.5, grid - 3, grid - 3);
      }
      const boss = sc.pois.find((p) => p.inBuilding);
      if (boss) {
        ctx.font = `${grid}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("💀", Math.round(sc.sx(boss.x) / grid) * grid, Math.round(sc.sy(boss.y) / grid) * grid);
      }
      ctx.fillStyle = "#ff4040";
      ctx.beginPath();
      ctx.arc(sc.W / 2, sc.H / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
];

