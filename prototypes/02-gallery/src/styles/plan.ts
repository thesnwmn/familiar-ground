import { css, hex, mix, mul, pick, type RGB } from "../kit/color.ts";
import { compassRose, noisePatches, topoCity } from "../kit/fancy.ts";
import { bg, buildingPath, buildings, extrude, isCarRoad, labels, roads, smoothMask, trees } from "../kit/layers.ts";
import { applyLighting, gatherLights, lightPoints } from "../kit/light.ts";
import { grain, inkEdges, paperGrain, pixelate, vignette } from "../kit/post.ts";
import { markings, planBase, planPalette } from "./common.ts";
import type { StillStyle } from "./types.ts";

const G = "Plans & lines";

const warmNight = planPalette({
  urban: [150, 140, 132], paved: [164, 154, 144], building: [112, 96, 90], named: [150, 110, 80], major: [86, 84, 90], minor: [98, 96, 102],
  park: [100, 140, 92], forest: [80, 120, 76], tree: [64, 110, 66], grass: [112, 146, 100], water: [56, 90, 140], path: [170, 146, 120],
});

export const PLAN_STYLES: StillStyle[] = [
  {
    id: "lit-plan",
    name: "Lit plan",
    group: G,
    blurb: "Your idea: the clean plan's real shapes (no pixel blobs) under Lumen's warm lamps, windows and neon.",
    draw(sc, ctx) {
      planBase(sc, ctx, warmNight, { roadCasing: [130, 120, 110], buildingStroke: [150, 120, 96] });
      markings(sc, ctx, "rgba(230,220,200,0.6)");
      const lights = gatherLights(sc);
      applyLighting(sc, ctx, lights, { ambient: [150, 138, 160], bloom: 0.35 });
      lightPoints(sc, ctx, lights);
    },
  },
  {
    id: "lit-plan-moon",
    name: "Moonlit plan",
    group: G,
    blurb: "The \"or not\" version: same plan, cold moonlight, no warmth. Only shop neon and a few windows.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [150, 160, 176], building: [110, 118, 140], major: [90, 96, 110], minor: [100, 106, 120], water: [60, 80, 120], park: [110, 140, 130] }), { roadCasing: [200, 210, 230], buildingStroke: [210, 220, 240] });
      const lights = gatherLights(sc, { lamp: [170, 200, 255], window: [200, 220, 255], windowChance: 0.05 }).filter((l) => l.kind !== "lamp" || sc.rand(Math.round(l.x), Math.round(l.y), 2) < 0.3);
      applyLighting(sc, ctx, lights, { ambient: [120, 140, 190], bloom: 0.25 });
      lightPoints(sc, ctx, lights);
    },
  },
  {
    id: "lit-plan-pixels",
    name: "Lit plan → pixels",
    group: G,
    blurb: "Mashup: draw the lit plan with real shapes, then pixelate it. Shapes stay right; you still get chunky pixels.",
    draw(sc, ctx) {
      PLAN_STYLES[0]!.draw(sc, ctx);
      pixelate(ctx, sc.scale >= 8 ? 3 : 2);
    },
  },
  {
    id: "blueprint",
    name: "Blueprint",
    group: G,
    blurb: "Architect's blueprint: white linework on Prussian blue, grid paper, dimension ticks on roads.",
    draw(sc, ctx) {
      bg(ctx, [22, 66, 130]);
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < sc.W; x += 12) (ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, sc.H));
      for (let y = 0; y < sc.H; y += 12) (ctx.moveTo(0, y + 0.5), ctx.lineTo(sc.W, y + 0.5));
      ctx.stroke();
      smoothMask(sc, ctx, (c) => c === "water", [30, 80, 150], { edge: [200, 230, 255], edgeWidth: 1 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "rgba(230,240,255,0.9)", add: 1.5 }, fill: { color: "rgb(22,66,130)" } } : null));
      buildings(sc, ctx, { fill: () => "rgba(255,255,255,0.06)", stroke: () => "rgba(240,248,255,0.95)", lineWidth: 1 });
      if (sc.scale >= 4) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.setLineDash([2, 3]);
        buildings(sc, ctx, { stroke: () => "rgba(255,255,255,0.25)", lineWidth: 0.6 });
        ctx.setLineDash([]);
      }
      labels(sc, ctx, { font: "10px ui-monospace, monospace", color: "rgba(240,248,255,0.9)", upper: true });
    },
  },
  {
    id: "ligne-claire",
    name: "Ligne claire",
    group: G,
    blurb: "Tintin / Moebius comics: flat bright colours, confident black outlines, hatched shadows.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [244, 232, 206], building: [232, 120, 90], named: [90, 150, 210], park: [150, 200, 110], forest: [110, 170, 90], tree: [80, 150, 70], water: [110, 180, 220], major: [250, 246, 236], minor: [250, 246, 236] }), {
        roadCasing: [30, 26, 24], buildingStroke: [24, 20, 18], lineWidth: Math.max(1, sc.scale * 0.18),
        buildingFill: (b) => [[232, 120, 90], [240, 200, 90], [200, 110, 150], [120, 180, 170]][Math.floor(b.r * 4)] as RGB,
        shadow: { dx: 0.35, dy: 0.35, color: "rgba(30,24,40,0.35)" },
      });
      inkEdges(ctx, [24, 20, 18], 140);
      labels(sc, ctx, { font: "bold 11px 'Comic Sans MS', 'Chalkboard SE', sans-serif", color: "#1a1410", halo: "#fff7e0" });
    },
  },
  {
    id: "ink-watercolor",
    name: "Ink & watercolour",
    group: G,
    blurb: "A travel sketchbook: wobbly washes that bleed past the lines, pen outlines, paper grain.",
    draw(sc, ctx) {
      bg(ctx, [246, 238, 222]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree", "wet"].includes(c), [160, 200, 140], { wobble: 0.6, alpha: 0.6, grow: 0.1 });
      smoothMask(sc, ctx, (c) => c === "water", [120, 170, 215], { wobble: 0.7, alpha: 0.7, grow: 0.1 });
      smoothMask(sc, ctx, (c) => c === "building" || c === "named", [215, 170, 130], { wobble: 0.5, alpha: 0.45, grow: 0.15 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "rgba(60,46,36,0.85)", add: 1 }, fill: { color: "rgb(246,238,222)", add: -0.5 } } : null));
      buildings(sc, ctx, { stroke: () => "rgba(60,46,36,0.9)", lineWidth: 0.9 });
      trees(sc, ctx, (x, y, r) => {
        ctx.strokeStyle = "rgba(60,90,50,0.8)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.7, 0.3, Math.PI * 1.9);
        ctx.stroke();
      }, 0.5);
      labels(sc, ctx, { font: "italic 12px Georgia, serif", color: "rgba(60,46,36,0.9)" });
      paperGrain(ctx, 0.07);
    },
  },
  {
    id: "treasure-map",
    name: "Treasure map",
    group: G,
    blurb: "Pirate chart: parchment, brown ink, wave marks, a compass rose, burnt edges and an X on a real shop.",
    draw(sc, ctx) {
      bg(ctx, [228, 204, 156]);
      smoothMask(sc, ctx, (c) => c === "water", [170, 180, 160], { wobble: 0.4, edge: [110, 80, 50], edgeWidth: 1.5 });
      if (sc.scale >= 2) {
        ctx.strokeStyle = "rgba(110,80,50,0.5)";
        ctx.lineWidth = 1;
        for (let y = 8; y < sc.H; y += 14)
          for (let x = (y / 14) % 2 ? 6 : 14; x < sc.W; x += 22) {
            const gx = Math.floor((x - sc.W / 2) / sc.scale + sc.cx);
            const gy = Math.floor((y - sc.H / 2) / sc.scale + sc.cy);
            if (sc.ground(gx, gy) !== 10) continue;
            ctx.beginPath();
            ctx.moveTo(x - 4, y);
            ctx.quadraticCurveTo(x - 2, y - 3, x, y);
            ctx.quadraticCurveTo(x + 2, y - 3, x + 4, y);
            ctx.stroke();
          }
      }
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(120,80,40,0.8)", k: 0.25, add: 1, dash: [4, 3] } } : null));
      buildings(sc, ctx, { fill: () => "rgba(150,100,60,0.35)", stroke: () => "rgba(100,64,32,0.8)", lineWidth: 0.8 });
      trees(sc, ctx, (x, y, r) => {
        ctx.fillStyle = "rgba(90,100,50,0.7)";
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.7, y + r * 0.6);
        ctx.lineTo(x - r * 0.7, y + r * 0.6);
        ctx.fill();
      }, 0.4);
      const target = sc.pois.find((p) => p.inBuilding) ?? sc.pois[0];
      if (target) {
        const x = sc.sx(target.x + 0.5);
        const y = sc.sy(target.y + 0.5);
        ctx.strokeStyle = "#a01010";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - 7);
        ctx.lineTo(x + 7, y + 7);
        ctx.moveTo(x + 7, y - 7);
        ctx.lineTo(x - 7, y + 7);
        ctx.stroke();
      }
      compassRose(ctx, sc.W - 34, 38, 22, "rgba(90,60,30,0.9)", "#a01010");
      paperGrain(ctx, 0.12, 3);
      vignette(ctx, 0.7, "90,50,10");
    },
  },
  {
    id: "neon-grid",
    name: "Neon grid",
    group: G,
    blurb: "Tron / synthwave: black world, roads as cyan light trails, buildings outlined in magenta glow.",
    draw(sc, ctx) {
      bg(ctx, [6, 4, 16]);
      smoothMask(sc, ctx, (c) => c === "water", [10, 10, 40]);
      for (const [k, a] of [[5, 0.12], [2.5, 0.3], [1, 1]] as const) {
        roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: `rgba(0,240,255,${a})`, k: 0, add: k * 1.2 } } : null));
        buildings(sc, ctx, { stroke: (b) => (b.kind !== "building" ? `rgba(255,230,0,${a})` : `rgba(255,40,200,${a})`), lineWidth: k });
      }
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "rgba(120,60,255,0.12)";
      ctx.beginPath();
      for (let x = 0; x < sc.W; x += 20) (ctx.moveTo(x, 0), ctx.lineTo(x, sc.H));
      for (let y = 0; y < sc.H; y += 20) (ctx.moveTo(0, y), ctx.lineTo(sc.W, y));
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: "white-model",
    name: "Architect's white model",
    group: G,
    blurb: "Foam-board city model: everything white, real heights in GTA-style perspective, soft shadows.",
    draw(sc, ctx) {
      bg(ctx, [214, 212, 206]);
      smoothMask(sc, ctx, (c) => c === "water", [170, 190, 200]);
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [196, 204, 186]);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgb(228,226,220)" } } : null));
      buildings(sc, ctx, { shadow: { dx: 0.5, dy: 0.6, color: "rgba(60,60,70,0.18)" } });
      extrude(sc, ctx, { roof: () => "#fbfaf7", wall: (_b, s) => css(mul([240, 238, 232], 0.7 + s * 0.3)), outline: "rgba(0,0,0,0.12)", lineWidth: 0.6 });
      trees(sc, ctx, (x, y, r) => {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.stroke();
      }, 0.3);
    },
  },
  {
    id: "toybox",
    name: "Toybox (Animal Crossing-ish)",
    group: G,
    blurb: "Soft, rounded, pastel; chunky drop shadows; lollipop trees. Cosy-game energy.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [180, 220, 140], paved: [236, 222, 190], major: [236, 222, 190], minor: [240, 230, 204], water: [120, 210, 230], park: [150, 214, 120], forest: [120, 196, 100], building: [255, 200, 200] }), {
        buildingFill: (b) => [[255, 190, 190], [190, 220, 255], [255, 236, 170], [210, 190, 255]][Math.floor(b.r * 4)] as RGB,
        buildingStroke: [255, 255, 255], lineWidth: Math.max(1, sc.scale * 0.25), treeColor: null, wobble: 0.15,
        shadow: { dx: 0.25, dy: 0.4, color: "rgba(60,90,60,0.25)" },
      });
      trees(sc, ctx, (x, y, r, rnd) => {
        ctx.fillStyle = "rgba(40,80,40,0.25)";
        ctx.beginPath();
        ctx.ellipse(x + r * 0.3, y + r * 0.5, r * 0.8, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = rnd < 0.15 ? "#ff9fb0" : "#5fbf5a";
        ctx.beginPath();
        ctx.arc(x, y - r * 0.2, r * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.5, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }, 0.5);
    },
  },
  {
    id: "boogie-woogie",
    name: "Broadway Boogie Woogie",
    group: G,
    blurb: "Mondrian's New York painting as a map: yellow road lines studded with red, blue and grey; blocks as colour fields.",
    draw(sc, ctx) {
      bg(ctx, [242, 238, 228]);
      for (const b of sc.buildings) {
        if (b.r > 0.82) {
          buildingPath(sc, ctx, b);
          ctx.fillStyle = ["#d22d2d", "#2550a0", "#f2c200"][Math.floor(b.r * 100) % 3]!;
          ctx.fill("evenodd");
        }
      }
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#f2c200", k: 0.45, add: 2 } } : null), "square");
      const step = Math.max(6, sc.scale * 3);
      for (const r of sc.roads) {
        if (!isCarRoad(r)) continue;
        let along = 0;
        for (let i = 0; i + 1 < r.points.length; i++) {
          const a = r.points[i]!;
          const c = r.points[i + 1]!;
          const len = Math.hypot(c.x - a.x, c.y - a.y) * sc.scale;
          for (; along < len; along += step) {
            const t = along / len;
            const x = sc.sx(a.x + (c.x - a.x) * t);
            const y = sc.sy(a.y + (c.y - a.y) * t);
            const pick3 = sc.rand(Math.round(x), Math.round(y), 5);
            if (pick3 < 0.45) continue;
            const s = Math.max(2, r.width * sc.scale * 0.45 + 2);
            ctx.fillStyle = pick3 < 0.65 ? "#d22d2d" : pick3 < 0.85 ? "#2550a0" : "#b8b4ac";
            ctx.fillRect(x - s / 2, y - s / 2, s, s);
          }
          along -= len;
        }
      }
    },
  },
  {
    id: "topo-city",
    name: "Topographic city",
    group: G,
    blurb: "Buildings become terrain: their heights melt into a smooth landscape with contour lines and hill shading.",
    draw(sc, ctx) {
      topoCity(sc, ctx, [[70, 110, 160], [120, 170, 120], [200, 200, 140], [190, 150, 110], [240, 240, 240]], [80, 60, 40], 1.5);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(60,40,30,0.35)", k: 0, add: 1, dash: [3, 2] } } : null));
    },
  },
  {
    id: "cad-night",
    name: "CAD terminal",
    group: G,
    blurb: "1980s CAD workstation: green and amber vectors on black, layer colours per feature.",
    draw(sc, ctx) {
      bg(ctx, [4, 8, 6]);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "rgba(255,180,40,0.9)", add: 1 }, fill: { color: "rgb(4,8,6)" } } : null));
      smoothMask(sc, ctx, (c) => c === "water", [4, 8, 6], { edge: [80, 160, 255], edgeWidth: 1 });
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [4, 8, 6], { edge: [60, 255, 120], edgeWidth: 1 });
      buildings(sc, ctx, { stroke: () => "rgba(120,255,160,0.9)", lineWidth: 1 });
      labels(sc, ctx, { font: "10px ui-monospace, monospace", color: "rgba(255,200,80,0.95)", upper: true });
      grain(ctx, 10);
    },
  },
  {
    id: "moss-plan",
    name: "Overgrown plan",
    group: G,
    blurb: "Mashup: the clean plan, decades after people left: moss and vines creeping over everything.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [196, 196, 180], building: [170, 160, 150] }), { roadCasing: [140, 140, 130] });
      noisePatches(sc, ctx, [80, 130, 60], 0.52, 40, { maxAlpha: 0.75 });
      noisePatches(sc, ctx, [50, 100, 50], 0.62, 14, { salt: 83, maxAlpha: 0.8 });
      vignette(ctx, 0.35, "20,30,10");
    },
  },
  {
    id: "lit-plan-warm-pixels",
    name: "Warm night, painted",
    group: G,
    blurb: "Mashup: the lit plan with a painterly filter, posterised colour bands and soft ink edges, like a night painting.",
    draw(sc, ctx) {
      PLAN_STYLES[0]!.draw(sc, ctx);
      inkEdges(ctx, [30, 20, 20], 90);
      grain(ctx, 12);
    },
  },
];

