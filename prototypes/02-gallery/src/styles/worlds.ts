import { css, mix, mul, pick, type Cls, type RGB } from "../kit/color.ts";
import { noisePatches, ruin } from "../kit/fancy.ts";
import { bg, buildingPath, buildings, extrude, isCarRoad, pixelArt, roads, smoothMask, trees, type Ctx } from "../kit/layers.ts";
import { applyLighting, gatherLights, lightPoints, type Lamp } from "../kit/light.ts";
import { blurred, fog, grain, vignette } from "../kit/post.ts";
import type { Scene } from "../scene.ts";
import { isBuildingCls, markings, planBase, planPalette, richShader } from "./common.ts";
import type { StillStyle } from "./types.ts";

const G = "Other worlds";

/** Lumen at any pixel density: rich pixel art, road paint, then lamps, windows and neon. */
function lumenDense(sc: Scene, ctx: Ctx, tpc: number): void {
  const pal = planPalette({ urban: [140, 136, 120], paved: [160, 154, 144], major: [60, 58, 62], minor: [70, 68, 72], building: [100, 82, 74], named: [130, 96, 70], park: [80, 130, 70], grass: [90, 136, 76], forest: [56, 100, 56], tree: [50, 110, 56], water: [40, 76, 130] });
  pixelArt(sc, ctx, richShader(pal, { outline: [40, 32, 30] }), tpc, 1);
  markings(sc, ctx, "rgba(230,226,210,0.8)", 3);
  const lights = gatherLights(sc);
  applyLighting(sc, ctx, lights, { ambient: [150, 132, 150], bloom: 0.35 });
  lightPoints(sc, ctx, lights);
}

export const WORLD_STYLES: StillStyle[] = [
  { id: "lumen-8x", name: "Lumen, 8×8 pixels per cell", group: G, blurb: "The \"massively more pixels\" test: Lumen lighting over 64 pixels per cell instead of 16.", draw: (sc, ctx) => lumenDense(sc, ctx, 8) },
  { id: "lumen-16x", name: "Lumen, 16×16 pixels per cell", group: G, blurb: "Pushed further: 256 pixels per cell. Close up it stops looking like pixel art and starts to look painted.", draw: (sc, ctx) => lumenDense(sc, ctx, 16) },
  {
    id: "ruins",
    name: "After the fall",
    group: G,
    blurb: "Post-apocalypse: roofs caved in, rubble in the streets, weeds everywhere, a few fires burning under a dirty sky.",
    draw(sc, ctx) {
      bg(ctx, [118, 108, 92]);
      smoothMask(sc, ctx, (c) => c === "water", [60, 70, 60]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [86, 96, 60], { wobble: 0.4, grow: 0.15 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#4a4642" } } : null));
      for (const b of sc.buildings) ruin(sc, ctx, b, css(mix([96, 84, 76], [70, 64, 60], b.r)), "rgba(150,140,128,0.9)");
      noisePatches(sc, ctx, [70, 96, 50], 0.55, 30, { maxAlpha: 0.7 });
      const fires: Lamp[] = sc.buildings.filter((b) => b.r > 0.9).map((b) => ({ x: b.cx, y: b.cy, r: 8, color: [255, 120, 40] as RGB, strength: 1, kind: "lamp" as const }));
      applyLighting(sc, ctx, fires, { ambient: [190, 170, 150], bloom: 0.5 });
      fog(ctx, "rgb(150,110,80)", 0.18);
      grain(ctx, 20);
      vignette(ctx, 0.6, "40,20,10");
    },
  },
  {
    id: "flooded",
    name: "The flood",
    group: G,
    blurb: "Sea level rose: streets are canals, parks are lagoons, only rooftops stand above the water, reflected beneath.",
    draw(sc, ctx) {
      bg(ctx, [46, 104, 126]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [52, 116, 110], { wobble: 0.5 });
      ctx.save();
      ctx.globalAlpha = 0.35;
      buildings(sc, ctx, { fill: () => "rgba(20,40,50,1)", shadow: { dx: 0, dy: 0.8, color: "rgba(160,200,210,0.25)" } });
      ctx.restore();
      buildings(sc, ctx, { fill: (b) => css(mix([210, 120, 100], [200, 200, 190], b.r)), stroke: () => "rgba(240,250,255,0.8)", lineWidth: 1 });
      ctx.strokeStyle = "rgba(220,240,255,0.25)";
      for (let y = 4; y < sc.H; y += 6)
        for (let x = (y * 7) % 23; x < sc.W; x += 23) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 6, y);
          ctx.stroke();
        }
      trees(sc, ctx, (x, y, r) => {
        ctx.fillStyle = "rgba(40,90,60,0.8)";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }, 0.3);
    },
  },
  {
    id: "medieval",
    name: "Medieval town",
    group: G,
    blurb: "Same streets, 1450: roads become muddy tracks, blocks become thatched cottages, named places become towers, and yards turn to strip fields.",
    draw(sc, ctx) {
      bg(ctx, [176, 160, 96]);
      noisePatches(sc, ctx, [150, 150, 80], 0.45, 12, { mask: (c) => c === "urban" || c === "paved" });
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [90, 120, 60], { wobble: 0.4 });
      smoothMask(sc, ctx, (c) => c === "water", [90, 120, 140], { wobble: 0.3 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#8a6a44", k: 0.55, add: 1 } } : null));
      for (const b of sc.buildings) {
        buildingPath(sc, ctx, b);
        ctx.fillStyle = b.kind !== "building" ? "#8c8c8c" : css(mix([200, 170, 90], [170, 140, 70], b.r));
        ctx.fill("evenodd");
        ctx.strokeStyle = "#4a3820";
        ctx.lineWidth = 1;
        ctx.stroke();
        if (sc.scale >= 3) {
          ctx.save();
          buildingPath(sc, ctx, b);
          ctx.clip("evenodd");
          ctx.strokeStyle = "rgba(90,60,20,0.35)";
          for (let k = -200; k < 200; k += 3) {
            ctx.beginPath();
            ctx.moveTo(sc.sx(b.cx) + k, sc.sy(b.cy) - 200);
            ctx.lineTo(sc.sx(b.cx) + k + 60, sc.sy(b.cy) + 200);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (b.kind !== "building" && sc.scale >= 2) {
          const x = sc.sx(b.cx);
          const y = sc.sy(b.cy);
          const s = Math.max(4, sc.scale * 2);
          ctx.fillStyle = "#6a6a6a";
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
          ctx.fillStyle = "#a02020";
          ctx.beginPath();
          ctx.moveTo(x - s * 0.7, y - s / 2);
          ctx.lineTo(x, y - s * 1.4);
          ctx.lineTo(x + s * 0.7, y - s / 2);
          ctx.fill();
        }
      }
      trees(sc, ctx, (x, y, r) => {
        ctx.fillStyle = "#3c5a28";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }, 0.5);
      grain(ctx, 16);
    },
  },
  {
    id: "bioluminescent",
    name: "Bioluminescent",
    group: G,
    blurb: "An alien night: dark teal streets, glowing fungus carpets in every park, cyan-edged buildings, spores in the air.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [20, 40, 52], paved: [24, 46, 58], building: [30, 34, 60], named: [50, 30, 70], major: [14, 26, 36], minor: [16, 30, 40], park: [20, 60, 60], forest: [16, 50, 50], tree: [30, 90, 90], water: [10, 20, 60] }), { buildingStroke: [80, 240, 230], roadCasing: [40, 90, 120] });
      const glows: Lamp[] = [];
      sc.forCells((gx, gy, g, s) => {
        if (s !== 3 && g !== 3 && g !== 4) return;
        if (sc.rand(gx, gy, 31) > 0.03) return;
        glows.push({ x: gx + 0.5, y: gy + 0.5, r: 3, color: sc.rand(gx, gy, 32) < 0.6 ? [80, 255, 230] : [200, 110, 255], strength: 0.9, kind: "glow" });
      });
      const city = gatherLights(sc, { lamp: [170, 90, 255], window: [80, 255, 230], signs: [[80, 255, 230], [255, 80, 220]], windowChance: 0.15 });
      glows.push(...city);
      applyLighting(sc, ctx, glows, { ambient: [110, 120, 170], bloom: 0.8 });
      lightPoints(sc, ctx, glows, 0.8);
    },
  },
  {
    id: "winter-postcard",
    name: "Winter postcard",
    group: G,
    blurb: "Christmas card: snow on every roof and lawn, cleared dark streets, warm windows at dusk, a light snowfall.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [236, 240, 246], paved: [226, 232, 240], major: [90, 92, 100], minor: [110, 112, 120], building: [250, 250, 255], named: [255, 236, 220], park: [240, 244, 250], forest: [210, 222, 230], tree: [50, 90, 80], water: [120, 150, 180] }), { roadCasing: [255, 255, 255], buildingStroke: [140, 120, 120], shadow: { dx: 0.3, dy: 0.4, color: "rgba(80,100,140,0.25)" } });
      const lights = gatherLights(sc, { lamp: [255, 170, 90], window: [255, 180, 100], windowChance: 0.2 });
      applyLighting(sc, ctx, lights, { ambient: [150, 150, 205], bloom: 0.15, lightK: 0.6 });
      lightPoints(sc, ctx, lights);
      for (let i = 0; i < sc.W * sc.H * 0.006; i++) {
        const x = ((i * 7919) % 997) / 997 * sc.W;
        const y = ((i * 104729) % 991) / 991 * sc.H;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) * 0.5 + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    id: "dune",
    name: "Desert planet",
    group: G,
    blurb: "Arrakis: everything buried in sand, buildings as sandstone blocks with long low-sun shadows, water as precious oases.",
    draw(sc, ctx) {
      bg(ctx, [214, 168, 104]);
      noisePatches(sc, ctx, [232, 190, 124], 0.48, 10);
      smoothMask(sc, ctx, (c) => c === "water", [40, 130, 140], { wobble: 0.3, edge: [70, 150, 80], edgeWidth: 3 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(150,110,70,0.5)", k: 0.6 } } : null));
      buildings(sc, ctx, { fill: (b) => css(mix([200, 150, 96], [176, 128, 82], b.r)), shadow: { dx: 1.1, dy: 0.5, color: "rgba(110,60,30,0.45)" } });
      extrude(sc, ctx, { roof: (b) => css(mix([226, 182, 120], [210, 166, 106], b.r)), wall: (_b, s) => css(mul([190, 136, 86], 0.6 + 0.4 * s)), heightK: 0.5 });
      vignette(ctx, 0.35, "120,60,20");
    },
  },
  {
    id: "lava",
    name: "The floor is lava",
    group: G,
    blurb: "Insane mode: every road is a river of lava, glowing into the black basalt blocks around it.",
    draw(sc, ctx) {
      bg(ctx, [34, 28, 30]);
      smoothMask(sc, ctx, (c) => c === "water", [30, 30, 50]);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "#ff3a00", add: 3 }, fill: { color: "#ffb000", k: 0.6 } } : null));
      const lava: Lamp[] = [];
      for (const r of sc.roads) {
        if (!isCarRoad(r)) continue;
        for (const p of r.points) lava.push({ x: p.x, y: p.y, r: r.width * 1.6 + 6, color: [255, 90, 20], strength: 0.9, kind: "lamp" });
      }
      buildings(sc, ctx, { fill: (b) => css(mix([46, 40, 44], [62, 54, 56], b.r)), stroke: () => "rgba(255,120,40,0.6)", lineWidth: 1 });
      applyLighting(sc, ctx, lava, { ambient: [120, 90, 100], bloom: 0.5, radiusK: 1 });
    },
  },
  {
    id: "candy",
    name: "Candy kingdom",
    group: G,
    blurb: "Insane mode: candy-stripe roads, frosted-cake buildings with sprinkles, a chocolate river and lollipop trees.",
    draw(sc, ctx) {
      bg(ctx, [255, 220, 236]);
      smoothMask(sc, ctx, (c) => c === "water", [110, 60, 40], { wobble: 0.3 });
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [170, 240, 190], { wobble: 0.3 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "#ffffff", add: 2 }, fill: { color: "#ff4d6d", dash: [Math.max(3, sc.scale), Math.max(3, sc.scale)] } } : null), "butt");
      buildings(sc, ctx, { fill: (b) => ["#ffd6e8", "#c9f2ff", "#fff1b8", "#e6d4ff"][Math.floor(b.r * 4)]!, stroke: () => "#ffffff", lineWidth: Math.max(1.5, sc.scale * 0.3), shadow: { dx: 0.2, dy: 0.3, color: "rgba(200,100,150,0.3)" } });
      if (sc.scale >= 3) {
        for (const b of sc.buildings) {
          for (let k = 0; k < 6; k++) {
            ctx.fillStyle = ["#ff4d6d", "#4dd2ff", "#ffd23f", "#7ae582"][k % 4]!;
            ctx.fillRect(sc.sx(b.cx) + (sc.rand(k, Math.round(b.r * 1e4), 1) - 0.5) * sc.scale * 6, sc.sy(b.cy) + (sc.rand(k, Math.round(b.r * 1e4), 2) - 0.5) * sc.scale * 6, 2, 1);
          }
        }
      }
      trees(sc, ctx, (x, y, r, rnd) => {
        ctx.fillStyle = ["#ff4d6d", "#ffd23f", "#7ae582", "#4dd2ff"][Math.floor(rnd * 4)]!;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, Math.PI * 1.5);
        ctx.stroke();
      }, 0.5);
    },
  },
  {
    id: "atlantis",
    name: "Sunken Atlantis",
    group: G,
    blurb: "The city on the sea floor: blue-green gloom, rippling light caustics, kelp for trees, bubbles rising.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [60, 120, 120], paved: [70, 130, 130], building: [80, 110, 120], named: [120, 120, 100], major: [50, 96, 100], minor: [56, 104, 108], park: [50, 110, 90], water: [20, 50, 80] }), { buildingStroke: [140, 200, 200], treeColor: null });
      trees(sc, ctx, (x, y, r) => {
        ctx.strokeStyle = "rgba(60,140,80,0.8)";
        ctx.lineWidth = Math.max(1, r * 0.25);
        ctx.beginPath();
        ctx.moveTo(x, y + r);
        ctx.bezierCurveTo(x - r, y, x + r, y - r * 0.5, x, y - r * 1.5);
        ctx.stroke();
      }, 0.5);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(160,255,240,0.12)";
      ctx.lineWidth = 1.5;
      for (let y = -20; y < sc.H + 20; y += 9) {
        ctx.beginPath();
        for (let x = 0; x <= sc.W; x += 6) ctx.lineTo(x, y + Math.sin(x * 0.07 + y * 0.3) * 4 + Math.sin(x * 0.023 - y) * 3);
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 40; i++) {
        ctx.strokeStyle = "rgba(220,255,255,0.6)";
        ctx.beginPath();
        ctx.arc(sc.rand(i, 1, 4) * sc.W, sc.rand(i, 2, 4) * sc.H, 1 + sc.rand(i, 3, 4) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.save();
      const g = ctx.createLinearGradient(0, 0, 0, sc.H);
      g.addColorStop(0, "rgba(0,60,80,0.1)");
      g.addColorStop(1, "rgba(0,20,50,0.45)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sc.W, sc.H);
      ctx.restore();
    },
  },
];

