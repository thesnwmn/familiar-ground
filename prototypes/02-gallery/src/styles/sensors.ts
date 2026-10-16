import { mul, type Cls, type RGB } from "../kit/color.ts";
import { bg, buildingPath, buildings, isCarRoad, paintCells, roads, smoothMask } from "../kit/layers.ts";
import { applyLighting, gatherLights, glowSprite } from "../kit/light.ts";
import { blurred, gradientMap, grain, vignette } from "../kit/post.ts";
import { planBase, planPalette } from "./common.ts";
import type { StillStyle } from "./types.ts";

const G = "Sensors & data";

const IRONBOW: RGB[] = [[0, 0, 20], [40, 0, 90], [140, 0, 140], [220, 60, 40], [255, 160, 0], [255, 240, 140], [255, 255, 255]];

function softHeat(sc: Parameters<StillStyle["draw"]>[0], ctx: CanvasRenderingContext2D, heat: (c: Cls, gx: number, gy: number) => number, blur: number): void {
  paintCells(sc, ctx, (c, gx, gy) => {
    const v = Math.max(0, Math.min(255, heat(c, gx, gy) * 255));
    return [v, v, v];
  }, true);
  const b = blurred(ctx.canvas, blur);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.7;
  ctx.drawImage(b, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

export const SENSOR_STYLES: StillStyle[] = [
  {
    id: "thermal",
    name: "Thermal camera",
    group: G,
    blurb: "Predator-vision: buildings glow by height, roads hold the day's heat, water and parks run cold.",
    draw(sc, ctx) {
      softHeat(sc, ctx, (c, gx, gy) => {
        if (c === "building" || c === "named") return 0.55 + Math.min(0.4, sc.levelsAt(gx, gy) * 0.04) + (c === "named" ? 0.1 : 0);
        if (c === "major") return 0.5;
        if (c === "minor") return 0.42;
        if (c === "water") return 0.05;
        if (c === "tree" || c === "forest") return 0.15;
        if (c === "park" || c === "grass") return 0.22;
        return 0.33;
      }, 3);
      gradientMap(ctx, IRONBOW, 1.2);
      grain(ctx, 8);
    },
  },
  {
    id: "earth-night",
    name: "Earth at night",
    group: G,
    blurb: "The NASA night-lights photo, zoomed into your street: sodium-orange roads and glowing blocks on black.",
    draw(sc, ctx) {
      bg(ctx, [2, 4, 10]);
      smoothMask(sc, ctx, (c) => c === "water", [4, 8, 20]);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: r.ground === 13 ? "rgba(255,170,60,0.55)" : "rgba(255,150,50,0.3)", k: 0.6, add: 1 } } : null));
      for (const b of sc.buildings) {
        buildingPath(sc, ctx, b);
        ctx.fillStyle = `rgba(255,${190 + b.r * 50},${110 + b.r * 60},${0.08 + Math.min(0.35, b.levels * 0.03)})`;
        ctx.fill("evenodd");
      }
      ctx.restore();
      const glow = blurred(ctx.canvas, 6);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glow, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(glow, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
  },
  {
    id: "aerial-1940s",
    name: "1940s aerial photo",
    group: G,
    blurb: "A wartime reconnaissance print: silver grain, long shadows, soft focus, scratched and vignetted.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [150, 150, 140], building: [200, 196, 186], named: [210, 206, 196], major: [120, 120, 116], minor: [130, 130, 126], park: [100, 110, 90], forest: [70, 80, 64], tree: [60, 70, 56], water: [60, 66, 70] }), { buildingStroke: null, shadow: { dx: 0.9, dy: 0.7, color: "rgba(20,20,20,0.6)" } });
      const soft = blurred(ctx.canvas, 1.6);
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(soft, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
      gradientMap(ctx, [[20, 16, 12], [110, 96, 80], [196, 184, 160], [244, 236, 220]], 1.15);
      grain(ctx, 36, 5);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      for (let k = 0; k < 4; k++) {
        const x = sc.rand(k, 1, 9) * sc.W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (sc.rand(k, 2, 9) - 0.5) * 30, sc.H);
        ctx.stroke();
      }
      vignette(ctx, 0.75);
    },
  },
  {
    id: "xray",
    name: "X-ray",
    group: G,
    blurb: "The city on a light box: inverted plan in cold cyan, bones of streets showing through.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [230, 230, 230], building: [80, 80, 80], named: [40, 40, 40], major: [255, 255, 255], minor: [250, 250, 250], water: [200, 200, 200], park: [210, 210, 210] }), { roadCasing: [140, 140, 140] });
      gradientMap(ctx, [[220, 255, 255], [80, 170, 200], [10, 30, 50], [0, 6, 14]], 1);
      vignette(ctx, 0.6, "0,10,20");
    },
  },
  {
    id: "hotspots",
    name: "Hotspot heatmap",
    group: G,
    blurb: "Data-viz: a quiet grey map with heat blobs wherever named places cluster (shops, cafés, stations).",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [236, 236, 236], building: [214, 214, 214], named: [200, 200, 200], major: [255, 255, 255], minor: [250, 250, 250], water: [210, 220, 230], park: [222, 230, 222] }), { buildingStroke: [200, 200, 200], treeColor: null });
      const heat = document.createElement("canvas");
      heat.width = ctx.canvas.width;
      heat.height = ctx.canvas.height;
      const h = heat.getContext("2d")!;
      h.globalCompositeOperation = "lighter";
      const r = Math.max(14, sc.scale * 10);
      for (const p of sc.pois) {
        h.globalAlpha = 0.35;
        h.drawImage(glowSprite([255, 255, 255], 0.2), sc.sx(p.x) - r, sc.sy(p.y) - r, r * 2, r * 2);
      }
      const img = h.getImageData(0, 0, heat.width, heat.height);
      let peak = 0.001;
      for (let i = 3; i < img.data.length; i += 4) peak = Math.max(peak, img.data[i]!);
      const stops: RGB[] = [[40, 0, 120], [0, 120, 255], [0, 220, 140], [255, 230, 0], [255, 60, 0]];
      for (let i = 0; i < img.data.length; i += 4) {
        const v = img.data[i + 3]! / peak; // additive white on transparent: intensity lives in alpha
        if (v < 0.02) { img.data[i + 3] = 0; continue; }
        const f = Math.min(0.999, v) * (stops.length - 1);
        const a = stops[Math.floor(f)]!;
        const b = stops[Math.ceil(f)]!;
        const t = f - Math.floor(f);
        img.data[i] = a[0] + (b[0] - a[0]) * t;
        img.data[i + 1] = a[1] + (b[1] - a[1]) * t;
        img.data[i + 2] = a[2] + (b[2] - a[2]) * t;
        img.data[i + 3] = Math.min(220, v * 400);
      }
      h.putImageData(img, 0, 0);
      ctx.drawImage(heat, 0, 0);
    },
  },
  {
    id: "night-vision",
    name: "Night vision",
    group: G,
    blurb: "Mashup: the lit plan seen through NV goggles: phosphor green, blooming lamps, sensor noise.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [90, 90, 90], building: [60, 60, 60], major: [40, 40, 40], minor: [50, 50, 50], water: [20, 20, 20], park: [70, 70, 70] }), { roadCasing: [110, 110, 110] });
      const lights = gatherLights(sc);
      applyLighting(sc, ctx, lights, { ambient: [120, 120, 120], bloom: 0.6 });
      gradientMap(ctx, [[0, 8, 0], [20, 90, 20], [120, 255, 120], [230, 255, 230]], 1.4);
      grain(ctx, 40, 2);
      vignette(ctx, 0.85);
    },
  },
];

