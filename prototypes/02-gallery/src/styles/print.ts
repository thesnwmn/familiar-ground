import { css, mix, mul, pick, type Cls, type RGB } from "../kit/color.ts";
import { crossStitch, lego, mosaic, pointillism } from "../kit/fancy.ts";
import { bg, buildingPath, buildings, isCarRoad, roads, smoothMask, trees } from "../kit/layers.ts";
import { grain, halftone, paperGrain, vignette } from "../kit/post.ts";
import { planBase, planPalette } from "./common.ts";
import type { StillStyle } from "./types.ts";

const G = "Print & craft";

const CRAFT: Partial<Record<Cls, RGB>> = {
  water: [60, 140, 220], park: [90, 170, 70], forest: [50, 120, 50], tree: [40, 110, 40], grass: [120, 190, 80],
  building: [200, 80, 60], named: [250, 200, 40], major: [90, 90, 96], minor: [140, 140, 146], path: [200, 170, 120], rail: [110, 90, 80], farm: [220, 200, 110],
};
const craft = (c: Cls, fallback: RGB = [220, 214, 200]): RGB => CRAFT[c] ?? fallback;

export const PRINT_STYLES: StillStyle[] = [
  {
    id: "riso",
    name: "Risograph",
    group: G,
    blurb: "Two-ink risograph zine: fluorescent pink and blue, misregistered layers, grainy halftone.",
    draw(sc, ctx) {
      bg(ctx, [245, 240, 228]);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.translate(-1.5, 1);
      smoothMask(sc, ctx, (c) => c === "water" || c === "park" || c === "forest" || c === "tree", [80, 120, 230], { alpha: 0.8 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(60,100,220,0.85)", k: 0.5, add: 1 } } : null));
      ctx.translate(3, -2);
      buildings(sc, ctx, { fill: (b) => `rgba(255,72,150,${0.55 + b.r * 0.4})` });
      ctx.restore();
      grain(ctx, 30);
    },
  },
  {
    id: "newsprint",
    name: "Newspaper halftone",
    group: G,
    blurb: "A city map printed in a Sunday paper: CMYK-ish halftone rosettes on cheap newsprint.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [230, 226, 214], building: [200, 120, 90], named: [240, 190, 60], water: [110, 170, 220], park: [140, 200, 110] }), { roadCasing: [120, 120, 120] });
      halftone(ctx, [
        { color: "rgb(0,170,230)", angle: 0.26, channel: (c) => 1 - c[0] / 255 },
        { color: "rgb(230,0,140)", angle: 1.31, channel: (c) => 1 - c[1] / 255 },
        { color: "rgb(250,220,0)", angle: 0, channel: (c) => 1 - c[2] / 255 },
      ], sc.scale >= 6 ? 6 : 4, "#efe9da");
    },
  },
  {
    id: "lego",
    name: "Lego baseplate",
    group: G,
    blurb: "The city built from 1×1 plates: a stud per square, raised bricks for buildings.",
    draw(sc, ctx) {
      lego(sc, ctx, sc.scale >= 8 ? 10 : 7, (c) => craft(c, [180, 200, 120]), (c) => c === "building" || c === "named");
    },
  },
  {
    id: "cross-stitch",
    name: "Cross-stitch sampler",
    group: G,
    blurb: "Your street embroidered on linen: one X per square, thread colours per feature.",
    draw(sc, ctx) {
      crossStitch(sc, ctx, sc.scale >= 8 ? 8 : 6, (c) => (c === "urban" || c === "paved" || c === "void" ? null : craft(c)));
    },
  },
  {
    id: "papercraft",
    name: "Papercraft cut-out",
    group: G,
    blurb: "Layers of coloured card cut to the real shapes, stacked with soft shadows between them.",
    draw(sc, ctx) {
      bg(ctx, [236, 222, 196]);
      const layer = (mask: (c: Cls) => boolean, color: RGB, lift: number) => {
        ctx.save();
        ctx.translate(lift, lift);
        smoothMask(sc, ctx, mask, [120, 100, 80], { alpha: 0.35 });
        ctx.restore();
        smoothMask(sc, ctx, mask, color, { wobble: 0.08 });
      };
      layer((c) => c === "water", [120, 180, 220], 0);
      layer((c) => ["park", "forest", "grass", "tree"].includes(c), [130, 190, 110], 2);
      roads(sc, ctx, (r) => (isCarRoad(r) ? { casing: { color: "rgba(120,100,80,0.35)", add: 3 }, fill: { color: "#faf4e8" } } : null));
      buildings(sc, ctx, { fill: (b) => css([[226, 110, 90], [240, 190, 90], [120, 160, 210], [190, 140, 200]][Math.floor(b.r * 4)] as RGB), shadow: { dx: 0.4, dy: 0.4, color: "rgba(90,70,50,0.35)" } });
      paperGrain(ctx, 0.1, 9);
    },
  },
  {
    id: "stained-glass",
    name: "Stained glass",
    group: G,
    blurb: "A cathedral window of your neighbourhood: Voronoi panes of jewel-coloured glass with lead between.",
    draw(sc, ctx) {
      mosaic(sc, ctx, sc.scale >= 8 ? 16 : 11, (c, r) => {
        const base: RGB = ({ water: [40, 90, 200], park: [60, 160, 70], forest: [30, 110, 50], tree: [30, 110, 50], building: [180, 40, 50], named: [240, 190, 40], major: [120, 60, 160], minor: [140, 90, 180] } as Partial<Record<Cls, RGB>>)[c] ?? [220, 200, 150];
        return mul(base, 0.75 + r * 0.45);
      });
      vignette(ctx, 0.4);
    },
  },
  {
    id: "pointillism",
    name: "Pointillism",
    group: G,
    blurb: "Seurat paints the street: jittered dots of colour that only resolve into a map from a distance.",
    draw(sc, ctx) {
      pointillism(sc, ctx, sc.scale >= 8 ? 5 : 4, (c) => craft(c, [230, 210, 170]), [244, 236, 220]);
    },
  },
  {
    id: "sumi-e",
    name: "Sumi-e ink wash",
    group: G,
    blurb: "Japanese ink painting: grey washes for water and parks, single brushstrokes for streets, buildings as dark blots.",
    draw(sc, ctx) {
      bg(ctx, [240, 234, 220]);
      smoothMask(sc, ctx, (c) => c === "water", [170, 170, 165], { wobble: 0.8, alpha: 0.6 });
      smoothMask(sc, ctx, (c) => ["park", "forest", "tree"].includes(c), [120, 120, 112], { wobble: 0.9, alpha: 0.35 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(30,28,26,0.75)", k: 0.18, add: 1.2 } } : null));
      for (const b of sc.buildings) {
        buildingPath(sc, ctx, b);
        ctx.fillStyle = `rgba(30,28,26,${0.25 + b.r * 0.45})`;
        ctx.fill("evenodd");
      }
      trees(sc, ctx, (x, y, r, rnd) => {
        ctx.fillStyle = `rgba(30,28,26,${0.2 + rnd * 0.3})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.9, r * 0.5, rnd * 3, 0, Math.PI * 2);
        ctx.fill();
      }, 0.4);
      const seal = 16;
      ctx.fillStyle = "#c0281c";
      ctx.fillRect(sc.W - seal - 10, sc.H - seal - 10, seal, seal);
      paperGrain(ctx, 0.08, 4);
    },
  },
  {
    id: "embroidered-patch",
    name: "Felt & thread",
    group: G,
    blurb: "A felt-appliqué patch: soft felt shapes with running-stitch borders.",
    draw(sc, ctx) {
      bg(ctx, [196, 178, 150]);
      smoothMask(sc, ctx, (c) => c === "water", [90, 140, 190], { wobble: 0.2 });
      smoothMask(sc, ctx, (c) => ["park", "forest", "grass", "tree"].includes(c), [110, 160, 90], { wobble: 0.2 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "#e9dcc4" } } : null));
      buildings(sc, ctx, { fill: (b) => css(mix([200, 90, 80], [90, 120, 170], b.r)), stroke: () => "rgba(255,250,235,0.9)", lineWidth: 1 });
      ctx.save();
      ctx.setLineDash([2, 2]);
      buildings(sc, ctx, { stroke: () => "rgba(255,250,235,0.9)", lineWidth: 1 });
      roads(sc, ctx, (r) => (isCarRoad(r) ? { fill: { color: "rgba(120,90,60,0.6)", k: 0, add: 1, dash: [3, 3] } } : null));
      ctx.restore();
      grain(ctx, 20);
    },
  },
];

