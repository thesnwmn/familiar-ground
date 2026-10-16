import { css, mix, mul, pick, type Palette, type RGB } from "../kit/color.ts";
import { withCamera } from "../kit/camera.ts";
import { bg, buildings, extrude, isCarRoad, pixelArt, roads, smoothMask, trees, type Ctx } from "../kit/layers.ts";
import { applyLighting, gatherLights, lightPoints } from "../kit/light.ts";
import { oblique } from "../kit/play.ts";
import { chromatic, fog, gradientMap, grain, halftone, inkEdges, oneBit, paperGrain, pixelate, posterize, rain, tiltShift, vignette } from "../kit/post.ts";
import { Scene, type SceneBuilding } from "../scene.ts";
import { isBuildingCls, markings, planBase, planPalette, richShader, windowGrid } from "./common.ts";
import type { Tier } from "./tiers.ts";
import type { StillStyle } from "./types.ts";

/**
 * "Plans with walls": the smooth vector plan looks (real footprints, clean lines) stood up with
 * a camera, so you see building sides. Every look comes with several cameras:
 *
 * - oblique 3/4: pushed straight up the screen (Zelda / Stardew); never swings as you move;
 * - from the player: walls lean away from the screen centre (GTA 1/2);
 * - low drone: the same with a low camera (strong lean, set pieces);
 * - cavalier: oblique with a sideways slant (Ultima / old RPGs), so two sides of a block show.
 *
 * All of them honour the camera angle, so the view can turn as you go round buildings.
 */

type Cam = "oblique" | "persp" | "drone" | "cavalier";

interface Look {
  key: string;
  name: string;
  blurb: string;
  tier: Tier;
  why: string;
  /** Extra cameras beyond oblique and from-the-player. */
  more?: Cam[];
  ground(sc: Scene, g: Ctx): void;
  roof(b: SceneBuilding): string;
  wall(b: SceneBuilding, shade: number): string;
  outline?: string;
  lineWidth?: number;
  windows?: string;
  /** Only some windows lit (night looks). */
  litWindows?: boolean;
  /** Height multiplier. */
  k?: number;
  /** Reshape buildings: change heights, drop some (ruins, medieval). */
  shape?(b: SceneBuilding): SceneBuilding | null;
  /** Lighting and post effects, given the (possibly rotated) scene. */
  after?(sc: Scene, ctx: Ctx, rs: Scene): void;
}

const CAMS: Record<Cam, { group: string; label: string; note: string }> = {
  oblique: { group: "Walls: oblique 3/4", label: "oblique", note: "Oblique 3/4 camera: walls pushed straight up, stable while moving." },
  persp: { group: "Walls: from the player", label: "from the player", note: "Perspective from the player: walls lean away from you, like GTA 1/2." },
  drone: { group: "Walls: other cameras", label: "low drone", note: "Low drone camera: a strong lean, very cinematic." },
  cavalier: { group: "Walls: other cameras", label: "cavalier", note: "Cavalier slant (Ultima, old RPGs): pushed up and to the right, so two sides of every block show." },
};

const pal4 = (cs: RGB[], b: SceneBuilding): RGB => cs[Math.floor(b.r * cs.length)]!;
const shadeOf = (c: RGB, s: number, lo = 0.55) => css(mul(c, lo + s * (1 - lo)));
const lit = (b: SceneBuilding) => (i: number) => ((i * 2654435761 + Math.floor(b.r * 1000)) >>> 0) % 7 < 3;

/** A copy of a scene with a different building list. */
function withBuildings(sc: Scene, bs: SceneBuilding[]): Scene {
  const r = Object.create(Scene.prototype) as Scene;
  Object.assign(r, sc, { buildings: bs });
  return r;
}

function plan(pal: Palette, opts: Parameters<typeof planBase>[3] = {}, mark?: string) {
  return (sc: Scene, g: Ctx) => {
    planBase(sc, g, pal, { ...opts, noBuildings: true });
    if (mark) markings(sc, g, mark);
  };
}

function lighting(opts: { ambient: RGB; bloom?: number; lamp?: RGB; window?: RGB; windowChance?: number; signs?: RGB[] }) {
  return (_sc: Scene, ctx: Ctx, rs: Scene) => {
    const lights = gatherLights(rs, { lamp: opts.lamp, window: opts.window, windowChance: opts.windowChance ?? 0.1, signs: opts.signs });
    applyLighting(rs, ctx, lights, { ambient: opts.ambient, bloom: opts.bloom ?? 0.35 });
    lightPoints(rs, ctx, lights);
  };
}

const warmNight = planPalette({
  urban: [150, 140, 132], paved: [164, 154, 144], building: [112, 96, 90], named: [150, 110, 80], major: [86, 84, 90], minor: [98, 96, 102],
  park: [100, 140, 92], forest: [80, 120, 76], tree: [64, 110, 66], grass: [112, 146, 100], water: [56, 90, 140], path: [170, 146, 120],
});
const BRICK: RGB[] = [[196, 150, 120], [214, 196, 170], [206, 204, 196], [180, 168, 150]];
const SLATE: RGB[] = [[150, 92, 76], [110, 116, 132], [164, 140, 104], [128, 128, 124]];

const LOOKS: Look[] = [
  {
    key: "clean",
    name: "Clean plan",
    blurb: "The clean vector plan with real walls: light ground, grey-blue roofs, soft walls. Nothing competes with actors.",
    tier: "A",
    why: "Readable, real shapes, walls for cover",
    more: ["drone", "cavalier"],
    ground: plan(planPalette({ urban: [226, 224, 218], paved: [214, 212, 206], major: [196, 196, 196], minor: [206, 206, 206], park: [190, 214, 176], forest: [160, 196, 150], tree: [140, 186, 130], water: [150, 190, 220] }), { roadCasing: [180, 180, 178] }),
    roof: (b) => css(b.kind !== "building" ? [190, 160, 120] : pal4([[150, 154, 164], [160, 150, 150], [140, 150, 160], [170, 168, 160]], b)),
    wall: (_b, s) => shadeOf([214, 212, 222], s),
    outline: "rgba(60,64,74,0.8)",
    windows: "rgba(90,110,140,0.55)",
  },
  {
    key: "ligne",
    name: "Ligne claire",
    blurb: "Tintin / Moebius: flat bright colours and confident black outlines, now with walls. A comic you can walk through.",
    tier: "A",
    why: "Strong art direction that stays readable",
    more: ["drone", "cavalier"],
    ground: plan(planPalette({ urban: [244, 232, 206], park: [150, 200, 110], forest: [110, 170, 90], tree: [80, 150, 70], water: [110, 180, 220], major: [250, 246, 236], minor: [250, 246, 236] }), { roadCasing: [30, 26, 24], lineWidth: 1.4 }),
    roof: (b) => css(pal4([[232, 120, 90], [240, 200, 90], [200, 110, 150], [120, 180, 170]], b)),
    wall: (b, s) => shadeOf(mix(pal4([[232, 120, 90], [240, 200, 90], [200, 110, 150], [120, 180, 170]], b), [255, 248, 230], 0.55), s, 0.7),
    outline: "rgba(24,20,18,1)",
    lineWidth: 1.4,
    windows: "rgba(40,60,90,0.8)",
  },
  {
    key: "lit",
    name: "Lit plan, warm evening",
    blurb: "Your mashup, stood up: the clean plan's shapes under Lumen's lamps, with lit windows on real walls.",
    tier: "A",
    why: "Lumen mood with walls and cover",
    more: ["drone", "cavalier"],
    ground: plan(warmNight, { roadCasing: [130, 120, 110] }, "rgba(230,220,200,0.6)"),
    roof: (b) => css(b.kind !== "building" ? [150, 110, 80] : pal4([[112, 96, 90], [100, 92, 100], [120, 104, 92], [96, 90, 86]], b)),
    wall: (b, s) => shadeOf(mul(pal4(BRICK, b), 0.8), s),
    outline: "rgba(40,30,26,0.7)",
    windows: "rgba(255,214,140,0.95)",
    litWindows: true,
    after: lighting({ ambient: [150, 138, 160] }),
  },
  {
    key: "moon",
    name: "Moonlit plan",
    blurb: "Cold moonlight on real walls; only neon, a few windows and the odd working lamp.",
    tier: "B",
    why: "Night variant; tense, still readable",
    ground: plan(planPalette({ urban: [150, 160, 176], major: [90, 96, 110], minor: [100, 106, 120], water: [60, 80, 120], park: [110, 140, 130] }), { roadCasing: [200, 210, 230] }),
    roof: () => css([110, 118, 140]),
    wall: (_b, s) => shadeOf([150, 158, 182], s),
    outline: "rgba(210,220,240,0.6)",
    windows: "rgba(200,220,255,0.9)",
    litWindows: true,
    after: lighting({ ambient: [120, 140, 190], lamp: [170, 200, 255], window: [200, 220, 255], windowChance: 0.05, bloom: 0.25 }),
  },
  {
    key: "tactical",
    name: "Tactical",
    blurb: "XCOM / Door Kickers clarity with walls: pale ground, mid-grey blocks, hard outlines. A planning view that still has depth.",
    tier: "A",
    why: "Clearest cover and lines for fights",
    ground: plan(planPalette({ urban: [222, 220, 214], major: [196, 196, 196], minor: [206, 206, 206], park: [190, 214, 176], water: [150, 190, 220] }), { roadCasing: [170, 170, 170] }),
    roof: (b) => css(b.kind !== "building" ? [170, 150, 120] : [150, 154, 164]),
    wall: (_b, s) => shadeOf([110, 114, 126], s, 0.7),
    outline: "rgba(40,44,54,0.95)",
    lineWidth: 1.3,
  },
  {
    key: "pixel",
    name: "16-bit pixels",
    blurb: "Rich pixel-art ground plus real-shaped walls, then pixelated: SNES charm without blob shapes.",
    tier: "A",
    why: "Pixel charm with correct shapes",
    more: ["cavalier"],
    ground(sc, g) {
      const pal = planPalette({ urban: [176, 170, 156], paved: [196, 190, 178], major: [84, 84, 90], minor: [100, 100, 106], park: [118, 168, 96], grass: [130, 176, 104], forest: [80, 136, 72], tree: [70, 130, 70], water: [70, 130, 190], building: [150, 140, 130], path: [200, 176, 130] });
      const shade = richShader(pal);
      pixelArt(sc, g, (t) => (isBuildingCls(t.cls) ? mul(pick(pal, "urban"), 0.8 + t.r * 0.1) : shade(t)), 8, 2);
      markings(sc, g, "rgba(240,236,220,0.85)", 3);
    },
    roof: (b) => css(pal4(SLATE, b)),
    wall: (b, s) => shadeOf(pal4(BRICK, b), s),
    outline: "rgba(20,16,14,0.85)",
    windows: "rgba(40,60,80,0.8)",
    after: (sc, ctx) => pixelate(ctx, sc.scale >= 6 ? 3 : 2),
  },
  {
    key: "gameboy",
    name: "Game Boy",
    blurb: "Four greens, chunky pixels, real walls. Link's Awakening on your street.",
    tier: "B",
    why: "Charming theme; low colour hurts actor contrast",
    ground: plan(planPalette({ urban: [200, 200, 190], major: [120, 120, 120], minor: [140, 140, 140], park: [160, 190, 140], water: [90, 110, 130] })),
    roof: (b) => css(pal4([[90, 90, 90], [120, 120, 120], [70, 70, 70], [110, 110, 110]], b)),
    wall: (_b, s) => shadeOf([170, 170, 170], s),
    outline: "rgba(20,20,20,1)",
    windows: "rgba(40,40,40,0.9)",
    after: (sc, ctx) => {
      pixelate(ctx, sc.scale >= 6 ? 3 : 2);
      gradientMap(ctx, [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]], 1.2);
    },
  },
  {
    key: "toy",
    name: "Toybox",
    blurb: "Primary-coloured toy blocks on a green board, slight tilt-shift blur at the edges. Friendly and very clear.",
    tier: "B",
    why: "Clear; lighter tone",
    ground: plan(planPalette({ urban: [200, 214, 170], major: [96, 96, 104], minor: [116, 116, 122], park: [110, 200, 90], forest: [70, 170, 70], water: [80, 180, 230] }), { roadCasing: [240, 240, 232] }, "rgba(255,255,255,0.8)"),
    roof: (b) => css(pal4([[230, 96, 84], [250, 200, 90], [96, 160, 230], [236, 236, 236]], b)),
    wall: (b, s) => shadeOf(mul(pal4([[230, 96, 84], [250, 200, 90], [96, 160, 230], [236, 236, 236]], b), 0.85), s),
    outline: "rgba(0,0,0,0.25)",
    windows: "rgba(40,60,90,0.5)",
    after: (_sc, ctx) => tiltShift(ctx, 5),
  },
  {
    key: "watercolour",
    name: "Ink & watercolour",
    blurb: "A travel sketchbook stood up: washes bleed past wobbly pen lines; walls are a lighter wash.",
    tier: "B",
    why: "Beautiful; washes can blur actors",
    ground(sc, g) {
      bg(g, [246, 238, 222]);
      smoothMask(sc, g, (c) => ["park", "forest", "grass", "tree", "wet"].includes(c), [160, 200, 140], { wobble: 0.6, alpha: 0.6, grow: 0.1 });
      smoothMask(sc, g, (c) => c === "water", [120, 170, 215], { wobble: 0.7, alpha: 0.7, grow: 0.1 });
      roads(sc, g, (r) => (isCarRoad(r) ? { casing: { color: "rgba(60,46,36,0.85)", add: 1 }, fill: { color: "rgb(246,238,222)", add: -0.5 } } : null));
    },
    roof: (b) => css(pal4([[215, 170, 130], [200, 150, 140], [190, 180, 150], [170, 160, 180]], b), 0.75),
    wall: (_b, s) => css([236, 214, 190], 0.5 + s * 0.4),
    outline: "rgba(60,46,36,0.9)",
    lineWidth: 0.9,
    after: (_sc, ctx) => paperGrain(ctx, 0.07),
  },
  {
    key: "sumi",
    name: "Sumi-e ink",
    blurb: "Black ink on rice paper: grey wash walls, bold roof strokes, red seal on named places.",
    tier: "C",
    why: "Map / cutscene look",
    ground(sc, g) {
      bg(g, [242, 236, 222]);
      smoothMask(sc, g, (c) => c === "water", [200, 200, 196], { wobble: 0.5 });
      smoothMask(sc, g, (c) => ["park", "forest", "tree"].includes(c), [214, 214, 206], { wobble: 0.6 });
      roads(sc, g, (r) => (isCarRoad(r) ? { casing: { color: "rgba(20,20,20,0.7)", add: 0.6 }, fill: { color: "rgb(242,236,222)" } } : null));
    },
    roof: (b) => (b.kind !== "building" ? "rgba(180,40,30,0.85)" : "rgba(30,30,30,0.85)"),
    wall: (_b, s) => css([120, 120, 116], 0.25 + (1 - s) * 0.4),
    outline: "rgba(10,10,10,0.9)",
    after: (_sc, ctx) => paperGrain(ctx, 0.08),
  },
  {
    key: "blueprint",
    name: "Blueprint wireframe",
    blurb: "White linework on Prussian blue, see-through walls: building intel before a raid.",
    tier: "C",
    why: "Intel / planning screen; see-through confuses cover",
    ground(sc, g) {
      bg(g, [22, 66, 130]);
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x < g.canvas.width; x += 12) (g.moveTo(x + 0.5, 0), g.lineTo(x + 0.5, g.canvas.height));
      for (let y = 0; y < g.canvas.height; y += 12) (g.moveTo(0, y + 0.5), g.lineTo(g.canvas.width, y + 0.5));
      g.stroke();
      smoothMask(sc, g, (c) => c === "water", [30, 80, 150], { edge: [200, 230, 255], edgeWidth: 1 });
      roads(sc, g, (r) => (isCarRoad(r) ? { casing: { color: "rgba(230,240,255,0.9)", add: 1.5 }, fill: { color: "rgb(22,66,130)" } } : null));
      buildings(sc, g, { stroke: () => "rgba(240,248,255,0.5)", lineWidth: 0.8 });
    },
    roof: () => "rgba(255,255,255,0.07)",
    wall: (_b, s) => css([200, 225, 255], 0.04 + s * 0.08),
    outline: "rgba(240,248,255,0.95)",
  },
  {
    key: "neon",
    name: "Neon wireframe",
    blurb: "Tron / synthwave: black city, glowing road edges and neon-outlined blocks with a chromatic shimmer.",
    tier: "B",
    why: "Great hacking / dream-sequence mode",
    ground(sc, g) {
      bg(g, [8, 6, 16]);
      smoothMask(sc, g, (c) => c === "water", [10, 20, 50], { edge: [60, 200, 255], edgeWidth: 1 });
      smoothMask(sc, g, (c) => ["park", "forest", "grass"].includes(c), [10, 30, 20], { edge: [60, 255, 140], edgeWidth: 0.8 });
      roads(sc, g, (r) => (isCarRoad(r) ? { casing: { color: "rgba(255,60,200,0.9)", add: 1.2 }, fill: { color: "rgb(14,10,28)" } } : null));
    },
    roof: () => "rgba(20,14,40,0.95)",
    wall: (b, s) => css(mul(b.r > 0.5 ? [60, 20, 90] : [20, 30, 80], 0.6 + s * 0.6)),
    outline: "rgba(80,240,255,0.95)",
    lineWidth: 1.2,
    windows: "rgba(255,80,220,0.8)",
    after: (_sc, ctx) => {
      chromatic(ctx, 1);
      vignette(ctx, 0.5);
    },
  },
  {
    key: "cyber",
    name: "Cyberpunk rain",
    blurb: "Blade Runner: wet dark streets, neon shop signs, lit windows, rain streaks. The lighting comes from the map.",
    tier: "B",
    why: "Mood theme for any A camera",
    ground: plan(planPalette({ urban: [40, 42, 52], paved: [50, 52, 62], major: [24, 26, 32], minor: [30, 32, 38], park: [30, 50, 44], water: [16, 26, 46] }), { roadCasing: [70, 70, 90] }, "rgba(120,200,255,0.4)"),
    roof: (b) => css(pal4([[40, 40, 52], [52, 46, 60], [36, 44, 54], [48, 48, 48]], b)),
    wall: (_b, s) => shadeOf([70, 70, 90], s),
    outline: "rgba(120,200,255,0.35)",
    windows: "rgba(120,220,255,0.9)",
    litWindows: true,
    after: (sc, ctx, rs) => {
      lighting({ ambient: [140, 136, 180], lamp: [255, 120, 220], window: [120, 220, 255], windowChance: 0.14, bloom: 0.55 })(sc, ctx, rs);
      rain(ctx, 0.003);
    },
  },
  {
    key: "noir",
    name: "Noir",
    blurb: "Black-and-white detective film: hard contrast, wet streets, one lamp per corner, heavy vignette.",
    tier: "B",
    why: "Stealth mood; colour can't flag enemies",
    ground: plan(planPalette({ urban: [120, 120, 120], major: [60, 60, 60], minor: [70, 70, 70], park: [100, 100, 100], water: [40, 40, 40] }), { roadCasing: [150, 150, 150] }),
    roof: () => css([70, 70, 70]),
    wall: (_b, s) => shadeOf([150, 150, 150], s, 0.4),
    outline: "rgba(0,0,0,0.9)",
    windows: "rgba(230,230,210,0.9)",
    litWindows: true,
    after: (sc, ctx, rs) => {
      lighting({ ambient: [170, 170, 170], lamp: [255, 255, 240], windowChance: 0.06, signs: [[255, 255, 255]] })(sc, ctx, rs);
      gradientMap(ctx, [[10, 10, 10], [110, 110, 108], [240, 240, 230]], 1.15);
      rain(ctx, 0.002, "rgba(220,220,220,0.3)");
      vignette(ctx, 0.7);
    },
  },
  {
    key: "obra",
    name: "Obra Dinn 1-bit",
    blurb: "Two colours, dithered: Return of the Obra Dinn on a real street.",
    tier: "C",
    why: "Striking; too noisy for long fights",
    ground: plan(planPalette({ urban: [200, 200, 200], major: [90, 90, 90], minor: [110, 110, 110], park: [150, 150, 150], water: [60, 60, 60] })),
    roof: (b) => css(pal4([[110, 110, 110], [140, 140, 140], [90, 90, 90], [160, 160, 160]], b)),
    wall: (_b, s) => shadeOf([220, 220, 220], s, 0.3),
    outline: "rgba(0,0,0,1)",
    after: (_sc, ctx) => oneBit(ctx, [40, 36, 52], [228, 222, 200], 1),
  },
  {
    key: "halftone",
    name: "Comic halftone",
    blurb: "Pop-art print: CMY dots, black ink lines. A splash page of your neighbourhood.",
    tier: "C",
    why: "Intro / title screen",
    ground: plan(planPalette({ urban: [240, 220, 190], major: [250, 250, 240], minor: [250, 250, 240], park: [140, 210, 120], water: [100, 170, 230] }), { roadCasing: [20, 20, 20] }),
    roof: (b) => css(pal4([[230, 80, 80], [250, 210, 60], [80, 150, 230], [240, 140, 60]], b)),
    wall: (_b, s) => shadeOf([250, 236, 210], s),
    outline: "rgba(10,10,10,1)",
    lineWidth: 1.4,
    after: (_sc, ctx) => {
      halftone(ctx, [
        { color: "rgb(0,170,230)", angle: 0.26, channel: (c) => 1 - c[0] / 255 },
        { color: "rgb(230,0,140)", angle: 1.3, channel: (c) => 1 - c[1] / 255 },
        { color: "rgb(250,220,0)", angle: 0, channel: (c) => 1 - c[2] / 255 },
        { color: "rgb(20,20,20)", angle: 0.78, channel: (c) => (Math.max(...c) < 70 ? 1 : 0) },
      ], 4);
    },
  },
  {
    key: "sepia",
    name: "1940s aerial",
    blurb: "Old photo: sepia, grain, soft vignette. A flashback or a 'how it was' mode.",
    tier: "C",
    why: "Flashback / photo mode",
    ground: plan(planPalette({ urban: [190, 186, 176], major: [120, 120, 120], minor: [140, 140, 140], park: [150, 170, 140], water: [90, 100, 110] })),
    roof: (b) => css(pal4([[110, 104, 100], [130, 124, 116], [96, 92, 88], [150, 146, 140]], b)),
    wall: (_b, s) => shadeOf([200, 196, 186], s, 0.45),
    outline: "rgba(40,30,20,0.6)",
    after: (_sc, ctx) => {
      gradientMap(ctx, [[30, 22, 14], [140, 110, 76], [236, 220, 190]], 1.1);
      grain(ctx, 22);
      vignette(ctx, 0.6, "40,26,12");
    },
  },
  {
    key: "pastel",
    name: "Pastel (Monument Valley)",
    blurb: "Soft pastel blocks with deep coloured shadows on the walls, very calm.",
    tier: "B",
    why: "Calm exploration tone",
    ground: plan(planPalette({ urban: [244, 226, 214], major: [226, 206, 214], minor: [232, 214, 220], park: [196, 226, 200], forest: [170, 210, 180], water: [170, 210, 236] })),
    roof: (b) => css(pal4([[250, 196, 186], [196, 220, 240], [250, 230, 180], [214, 200, 240]], b)),
    wall: (b, s) => css(mix(mul(pal4([[250, 196, 186], [196, 220, 240], [250, 230, 180], [214, 200, 240]], b), 0.7), [90, 70, 130], 0.35 * (1 - s))),
    outline: "rgba(120,90,140,0.35)",
  },
  {
    key: "stardew",
    name: "Stardew farmtown",
    blurb: "Warm greens, wooden walls and red/blue roofs: the cosy harvest-game palette on real streets.",
    tier: "B",
    why: "Cosy tone; good for resources and crafting",
    ground: plan(planPalette({ urban: [196, 176, 126], paved: [200, 186, 150], major: [168, 150, 112], minor: [178, 160, 120], park: [118, 180, 76], grass: [130, 186, 84], forest: [70, 140, 60], tree: [60, 130, 56], water: [70, 150, 210], path: [210, 186, 130] }), { roadCasing: [140, 120, 86] }),
    roof: (b) => css(pal4([[190, 70, 60], [70, 110, 170], [150, 90, 60], [90, 140, 90]], b)),
    wall: (_b, s) => shadeOf([200, 150, 96], s),
    outline: "rgba(60,36,20,0.75)",
    windows: "rgba(250,230,160,0.8)",
  },
  {
    key: "medieval",
    name: "Medieval town",
    blurb: "Same streets in 1400: dirt lanes, timber-framed walls, terracotta and thatch, nothing above three floors.",
    tier: "B",
    why: "Altered-reality theme with real layout",
    ground: plan(planPalette({ urban: [170, 160, 120], paved: [176, 166, 136], major: [150, 126, 90], minor: [160, 136, 100], park: [120, 160, 80], forest: [70, 120, 56], water: [80, 120, 150], path: [160, 140, 100] }), { roadCasing: [120, 100, 70] }),
    roof: (b) => css(b.kind !== "building" ? [120, 120, 130] : pal4([[180, 90, 60], [190, 160, 90], [160, 80, 56], [176, 150, 84]], b)),
    wall: (b, s) => shadeOf(b.kind !== "building" ? [190, 186, 170] : [226, 210, 176], s),
    outline: "rgba(70,46,26,0.9)",
    windows: "rgba(70,46,26,0.8)",
    shape: (b) => ({ ...b, levels: Math.min(3, b.levels) }),
  },
  {
    key: "ruins",
    name: "Ruins",
    blurb: "Post-apocalypse: broken heights, some blocks gone, weeds through the tarmac, ash-grey roofs.",
    tier: "B",
    why: "Theme; broken walls make great cover",
    ground(sc, g) {
      planBase(sc, g, planPalette({ urban: [140, 134, 118], paved: [130, 126, 112], major: [90, 88, 84], minor: [100, 98, 92], park: [110, 130, 70], forest: [70, 100, 50], water: [70, 90, 80] }), { noBuildings: true });
      smoothMask(sc, g, (c) => c === "major" || c === "minor" || c === "urban", [100, 120, 60], { wobble: 0.8, alpha: 0.35, grow: -0.3 });
    },
    roof: (b) => css(pal4([[96, 90, 84], [110, 100, 90], [80, 76, 72], [120, 112, 100]], b)),
    wall: (_b, s) => shadeOf([150, 140, 126], s, 0.4),
    outline: "rgba(30,26,22,0.8)",
    windows: "rgba(20,18,16,0.9)",
    shape: (b) => (b.r < 0.12 ? null : { ...b, levels: Math.max(1, Math.round(b.levels * (0.3 + ((b.r * 7) % 1) * 0.6))) }),
    after: (_sc, ctx) => fog(ctx, "rgba(160,150,120,1)", 0.12),
  },
  {
    key: "flood",
    name: "Flooded city",
    blurb: "Sea level rose: streets are canals, parks are marsh, only the upper floors stand clear of the water.",
    tier: "B",
    why: "Theme; boats instead of cars",
    ground(sc, g) {
      const w: RGB = [70, 120, 140];
      planBase(sc, g, planPalette({ urban: w, paved: w, major: mul(w, 1.08), minor: mul(w, 1.05), park: [96, 140, 110], grass: [96, 140, 110], forest: [70, 120, 90], water: [50, 96, 126] }), { noBuildings: true, paths: false });
    },
    roof: (b) => css(pal4([[150, 120, 110], [130, 136, 146], [160, 150, 130], [140, 140, 136]], b)),
    wall: (_b, s) => shadeOf([196, 188, 170], s),
    outline: "rgba(20,40,50,0.6)",
    windows: "rgba(40,60,80,0.6)",
    shape: (b) => (b.levels <= 1 ? null : { ...b, levels: b.levels - 1 }),
    after: (_sc, ctx) => fog(ctx, "rgba(150,200,210,1)", 0.12),
  },
  {
    key: "winter",
    name: "Deep winter",
    blurb: "Snow on every roof, brick walls showing, blue shadows, frozen water.",
    tier: "B",
    why: "Seasonal theme; snow is a resource",
    ground: plan(planPalette({ urban: [236, 240, 246], paved: [226, 232, 240], major: [200, 204, 214], minor: [210, 214, 222], park: [240, 244, 250], forest: [200, 214, 220], tree: [150, 176, 180], water: [190, 214, 230] }), { roadCasing: [170, 180, 196] }),
    roof: () => css([248, 250, 255]),
    wall: (b, s) => shadeOf(mix(pal4(BRICK, b), [120, 140, 190], 0.25), s, 0.5),
    outline: "rgba(90,110,150,0.6)",
    windows: "rgba(255,220,150,0.8)",
  },
  {
    key: "frostpunk",
    name: "Frostpunk night",
    blurb: "Frozen city at night: blue snow, warm windows and braziers. Warmth is survival.",
    tier: "B",
    why: "Survival theme; lights become resources",
    ground: plan(planPalette({ urban: [200, 210, 226], paved: [190, 200, 216], major: [150, 160, 180], minor: [160, 170, 190], park: [210, 220, 236], water: [160, 186, 210] }), { roadCasing: [130, 140, 160] }),
    roof: () => css([230, 236, 246]),
    wall: (_b, s) => shadeOf([120, 110, 110], s),
    outline: "rgba(40,40,60,0.7)",
    windows: "rgba(255,190,110,1)",
    litWindows: true,
    after: lighting({ ambient: [110, 130, 180], lamp: [255, 170, 90], window: [255, 190, 110], windowChance: 0.12, bloom: 0.45 }),
  },
  {
    key: "biolum",
    name: "Bioluminescent",
    blurb: "Overgrown alien night: dark teal ground, glowing moss edges on every wall, spore lights.",
    tier: "B",
    why: "Strange-world theme; glow guides exploring",
    ground: plan(planPalette({ urban: [16, 34, 40], paved: [20, 40, 46], major: [10, 24, 30], minor: [12, 28, 34], park: [20, 60, 50], forest: [10, 70, 60], tree: [40, 160, 140], water: [10, 30, 70] }), { roadCasing: [40, 200, 180] }),
    roof: () => css([20, 50, 56]),
    wall: (_b, s) => shadeOf([30, 70, 80], s),
    outline: "rgba(90,255,220,0.8)",
    windows: "rgba(200,120,255,0.9)",
    litWindows: true,
    after: lighting({ ambient: [90, 120, 140], lamp: [80, 255, 200], window: [200, 120, 255], signs: [[255, 120, 220], [120, 255, 200]], bloom: 0.5 }),
  },
  {
    key: "adobe",
    name: "Desert adobe",
    blurb: "Sun-baked mud walls and flat roofs, sand streets, hard noon shadows: Marrakech everywhere.",
    tier: "B",
    why: "Theme; hot-climate biome",
    ground: plan(planPalette({ urban: [220, 190, 140], paved: [214, 186, 140], major: [190, 160, 116], minor: [200, 170, 126], park: [150, 160, 90], forest: [110, 130, 70], water: [70, 150, 170], sand: [230, 200, 150] }), { roadCasing: [170, 140, 100] }),
    roof: (b) => css(pal4([[214, 160, 110], [226, 180, 130], [200, 146, 100], [236, 200, 150]], b)),
    wall: (_b, s) => shadeOf([196, 130, 86], s, 0.45),
    outline: "rgba(100,60,30,0.5)",
    windows: "rgba(70,40,20,0.8)",
  },
  {
    key: "paper",
    name: "Papercraft",
    blurb: "Cut card stuck on card: matte colours, crisp edges, a soft drop shadow under everything.",
    tier: "C",
    why: "Lovely; reads like a diorama",
    ground: plan(planPalette({ urban: [236, 226, 206], major: [250, 246, 236], minor: [250, 246, 236], park: [170, 200, 140], forest: [120, 170, 110], water: [130, 180, 210] }), { roadCasing: [200, 190, 170], shadow: { dx: 0.3, dy: 0.3, color: "rgba(0,0,0,0.15)" } }),
    roof: (b) => css(pal4([[230, 150, 120], [240, 220, 170], [170, 190, 220], [220, 200, 220]], b)),
    wall: (b, s) => shadeOf(pal4([[210, 130, 100], [220, 196, 150], [150, 170, 200], [200, 180, 200]], b), s, 0.7),
    after: (_sc, ctx) => paperGrain(ctx, 0.05),
  },
  {
    key: "chalk",
    name: "Chalkboard",
    blurb: "A teacher's chalk sketch of the block: dusty white lines on green-black.",
    tier: "D",
    why: "Art toy / tutorial screen",
    ground(sc, g) {
      bg(g, [34, 52, 44]);
      roads(sc, g, (r) => (isCarRoad(r) ? { casing: { color: "rgba(240,240,230,0.6)", add: 0.8 }, fill: { color: "rgb(34,52,44)" } } : null));
      trees(sc, g, (x, y, r) => {
        g.strokeStyle = "rgba(200,240,200,0.5)";
        g.beginPath();
        g.arc(x, y, r * 0.6, 0, Math.PI * 2);
        g.stroke();
      }, 0.4);
    },
    roof: () => "rgba(240,240,230,0.08)",
    wall: (_b, s) => css([240, 240, 230], 0.05 + (1 - s) * 0.12),
    outline: "rgba(240,240,230,0.75)",
    after: (_sc, ctx) => grain(ctx, 16),
  },
  {
    key: "poster",
    name: "Posterised travel poster",
    blurb: "1930s rail poster: four flat tones per colour, bold sky-blue water, cream streets.",
    tier: "C",
    why: "Loading screen / postcard",
    ground: plan(planPalette({ urban: [236, 220, 180], major: [250, 240, 220], minor: [250, 240, 220], park: [120, 170, 100], forest: [70, 130, 80], water: [70, 150, 200] }), { roadCasing: [120, 90, 60] }),
    roof: (b) => css(pal4([[200, 80, 50], [40, 90, 120], [220, 160, 60], [120, 60, 50]], b)),
    wall: (_b, s) => shadeOf([240, 214, 170], s, 0.5),
    outline: "rgba(40,30,20,0.6)",
    after: (_sc, ctx) => posterize(ctx, 4),
  },
  {
    key: "inked",
    name: "Graphic novel ink",
    blurb: "Muted colour with heavy inked edges found automatically on everything: a Sin City-meets-Moebius panel.",
    tier: "B",
    why: "Strong style; edges help cover read",
    ground: plan(planPalette({ urban: [170, 160, 150], major: [110, 108, 110], minor: [120, 118, 120], park: [120, 150, 110], water: [80, 110, 140] }), { roadCasing: [40, 36, 34] }),
    roof: (b) => css(pal4([[150, 110, 100], [110, 120, 140], [160, 140, 110], [130, 130, 126]], b)),
    wall: (_b, s) => shadeOf([200, 190, 176], s, 0.4),
    outline: "rgba(16,14,12,1)",
    lineWidth: 1.2,
    after: (_sc, ctx) => inkEdges(ctx, [16, 14, 12], 60),
  },
];

/** Picks only some windows on unlit faces. */
function windowsFor(ctx: Ctx, look: Look) {
  if (!look.windows) return undefined;
  const color = look.windows;
  return (b: SceneBuilding, quad: { x: number; y: number }[]) => windowGrid(ctx, quad, color, look.litWindows ? lit(b) : undefined);
}

function drawLook(look: Look, cam: Cam, sc: Scene, ctx: Ctx): Scene {
  return withCamera(
    sc,
    ctx,
    (gs, g) => look.ground(gs, g),
    (rs, c) => {
      const s = look.shape ? withBuildings(rs, rs.buildings.flatMap((b) => look.shape!(b) ?? [])) : rs;
      if (cam === "oblique" || cam === "cavalier") {
        oblique(s, c, { roof: look.roof, wall: look.wall, outline: look.outline, lineWidth: look.lineWidth, k: 0.7 * (look.k ?? 1), windows: look.windows, lean: cam === "cavalier" ? 0.5 : 0 });
      } else {
        extrude(s, c, {
          roof: look.roof,
          wall: look.wall,
          outline: look.outline,
          lineWidth: look.lineWidth,
          heightK: 1.1 * (look.k ?? 1),
          camera: cam === "drone" ? Math.max(40, (sc.W / sc.scale) * 0.32) : undefined,
          windows: windowsFor(c, look),
        });
      }
    },
  );
}

const lower: Record<Tier, Tier> = { A: "B", B: "B", C: "C", D: "D" };

export const WALL_TIERS: Record<string, [Tier, string]> = {};

export const WALL_STYLES: StillStyle[] = LOOKS.flatMap((look) =>
  (["oblique", "persp", ...(look.more ?? [])] as Cam[]).map((cam): StillStyle => {
    const id = `walls-${look.key}-${cam}`;
    WALL_TIERS[id] = cam === "oblique" || cam === "persp" ? [look.tier, look.why] : [lower[look.tier], `${look.why}; ${cam === "drone" ? "lean too strong for everyday play" : "slant shows two sides but feels dated"}`];
    return {
      id,
      name: `${look.name}, ${CAMS[cam].label}`,
      group: CAMS[cam].group,
      rotatable: true,
      blurb: `${look.blurb} ${CAMS[cam].note}`,
      draw(sc, ctx) {
        const rs = drawLook(look, cam, sc, ctx);
        look.after?.(sc, ctx, rs);
      },
    };
  }),
);

export { drawLook, LOOKS };
export const lookByKey = (key: string) => LOOKS.find((l) => l.key === key)!;
