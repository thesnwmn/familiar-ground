import { css, mix, mul, pick, type RGB } from "../kit/color.ts";
import { bg, extrude, pixelArt, type Ctx } from "../kit/layers.ts";
import { applyLighting, gatherLights, lightPoints } from "../kit/light.ts";
import { withCamera } from "../kit/camera.ts";
import { cutawayInterior, drawActors, drawHud, drawPlayer, enteredBuilding, lineOfSight, mockActors, oblique, rotateActors, rotateScreen, shadeOutside, torchCone, type Actor } from "../kit/play.ts";
import { pixelate } from "../kit/post.ts";
import type { Scene } from "../scene.ts";
import { isBuildingCls, markings, planBase, planPalette, richShader, windowGrid } from "./common.ts";
import { gta } from "./games.ts";
import { drawLook, lookByKey } from "./walls.ts";
import type { StillStyle } from "./types.ts";

const G = "Playable candidates";
const FACING = -0.7;

/** Player, gangs, loot, resources and HUD on top of any base. `rs` is the (possibly rotated) scene drawn. */
export function play(sc: Scene, ctx: Ctx, actors: Actor[] = mockActors(sc), tone: "dark" | "light" = "dark", rs: Scene = sc): void {
  const placed = rotateActors(rs, actors);
  drawActors(rs, ctx, placed);
  drawPlayer(rs, ctx, FACING);
  drawHud(rs, ctx, placed, tone);
}

const obliqueOpts = { roof: (b: { r: number }) => css(ROOF[Math.floor(b.r * 4)]!), wall: (b: { r: number }, s: number) => css(mul(WALL[Math.floor(b.r * 4)]!, s)) };

const streetPal = planPalette({
  urban: [176, 170, 156], paved: [196, 190, 178], major: [84, 84, 90], minor: [100, 100, 106], park: [118, 168, 96], grass: [130, 176, 104],
  forest: [80, 136, 72], tree: [70, 130, 70], water: [70, 130, 190], building: [150, 140, 130], path: [200, 176, 130],
});

/** Ground only (buildings drawn by the camera projection instead). */
function ground(sc: Scene, ctx: Ctx, pal = streetPal, tpc = 4): void {
  const shade = richShader(pal);
  pixelArt(sc, ctx, (t) => (isBuildingCls(t.cls) ? mul(pick(pal, "urban"), 0.8 + t.r * 0.1) : shade(t)), tpc, 2);
  markings(sc, ctx, "rgba(240,236,220,0.85)", 3);
}

const ROOF: RGB[] = [[150, 92, 76], [110, 116, 132], [164, 140, 104], [128, 128, 124]];
const WALL: RGB[] = [[214, 196, 170], [196, 150, 120], [206, 204, 196], [180, 168, 150]];

/** A "plans with walls" look plus actors and HUD. */
function wallsPlay(id: string, key: string, cam: "oblique" | "persp", name: string, blurb: string, tone: "dark" | "light" = "dark"): StillStyle {
  return {
    id,
    name,
    group: G,
    rotatable: true,
    blurb: `${blurb} Rotatable.`,
    draw(sc, ctx) {
      const look = lookByKey(key);
      const rs = drawLook(look, cam, sc, ctx);
      look.after?.(sc, ctx, rs);
      play(sc, ctx, mockActors(sc), tone, rs);
    },
  };
}

export const PLAYABLE_STYLES: StillStyle[] = [
  wallsPlay("play-ligne-oblique", "ligne", "oblique", "Ligne claire oblique, in play", "Tintin colours and black outlines stood up as oblique walls, with gangs, loot and HUD on top. Smooth lines, clear cover."),
  wallsPlay("play-lit-persp", "lit", "persp", "Lit plan from the player, in play", "The warm lit plan with GTA-style leaning walls and lit windows, with actors. Lumen mood, real shapes."),
  wallsPlay("play-tactical-oblique", "tactical", "oblique", "Tactical oblique, in play", "XCOM-clear plan with oblique walls: the most readable fight view so far.", "light"),
  wallsPlay("play-clean-persp", "clean", "persp", "Clean plan from the player, in play", "The clean plan with perspective walls around you: calm, readable, strong sense of the street.", "light"),
  {
    id: "play-follow-street",
    name: "Oblique that follows the street",
    group: G,
    blurb: "The camera turns so the street you're on always runs up the screen: walk round a corner and the city swings round with you, showing new walls. (Always auto, whatever the angle control says.)",
    draw(sc, ctx) {
      const prev = sc.view;
      sc.view = { angle: "auto" };
      const rs = withCamera(sc, ctx, (gs, g) => ground(gs, g), (r, c) => oblique(r, c, { ...obliqueOpts, outline: "rgba(20,16,14,0.6)", windows: "rgba(50,70,90,0.7)" }));
      sc.view = prev;
      play(sc, ctx, mockActors(sc), "dark", rs);
    },
  },
  {
    id: "play-oblique",
    name: "Oblique 3/4 street",
    group: G,
    rotatable: true,
    blurb: "Zelda / Stardew camera: buildings stand straight up so you always see south walls, and the view never swings as you move. Very readable for fights. Rotatable.",
    draw(sc, ctx) {
      const rs = withCamera(sc, ctx, (gs, g) => ground(gs, g), (r, c) => oblique(r, c, { ...obliqueOpts, outline: "rgba(20,16,14,0.6)", windows: "rgba(50,70,90,0.7)" }));
      play(sc, ctx, mockActors(sc), "dark", rs);
    },
  },
  {
    id: "play-oblique-pixel",
    name: "Oblique 3/4, pixelated",
    group: G,
    rotatable: true,
    blurb: "The oblique street drawn with real shapes, then pixelated: pixel-art charm without the odd blob shapes. Actors stay crisp on top. Rotatable.",
    draw(sc, ctx) {
      const rs = withCamera(sc, ctx, (gs, g) => ground(gs, g, streetPal, 8), (r, c) => oblique(r, c, { ...obliqueOpts, outline: "rgba(20,16,14,0.8)", windows: "rgba(40,60,80,0.8)" }));
      pixelate(ctx, sc.scale >= 6 ? 3 : 2);
      play(sc, ctx, mockActors(sc), "dark", rs);
    },
  },
  {
    id: "play-perspective",
    name: "Perspective from the player (GTA)",
    group: G,
    blurb: "Roofs lean away from you, so you see the walls of whatever you're near; nearby streets feel like canyons. Great sense of place; can feel swimmy when moving fast.",
    draw(sc, ctx) {
      gta(sc, ctx, false);
      play(sc, ctx);
    },
  },
  {
    id: "play-drone",
    name: "Low drone camera",
    group: G,
    blurb: "The same perspective with the camera much lower: strong lean, big walls, very cinematic. Probably too much for long play, but great for set pieces.",
    draw(sc, ctx) {
      gta(sc, ctx, false, { camera: Math.max(40, (sc.W / sc.scale) * 0.32) });
      play(sc, ctx);
    },
  },
  {
    id: "play-los-night",
    name: "Line of sight at night",
    group: G,
    blurb: "Darkwood / Teleglitch: you only see what your character can see. Buildings cast hard shadows, a torch lights your aim. Makes gang fights tense and stealth possible.",
    draw(sc, ctx) {
      gta(sc, ctx, true);
      const actors = mockActors(sc);
      drawActors(sc, ctx, actors);
      shadeOutside(ctx, lineOfSight(sc, Math.max(sc.W, sc.H) / sc.scale), "rgba(4,4,10,0.86)", 3);
      torchCone(ctx, sc.W / 2, sc.H / 2, FACING, Math.min(sc.W, sc.H) * 0.45);
      drawPlayer(sc, ctx, FACING);
      drawHud(sc, ctx, actors);
    },
  },
  {
    id: "play-los-day",
    name: "Line of sight by day",
    group: G,
    rotatable: true,
    blurb: "Same vision rule in daylight on the oblique street: what's behind buildings is greyed out (remembered, not seen). Shows enemies only when you could really spot them. Rotatable.",
    draw(sc, ctx) {
      const rs = withCamera(sc, ctx, (gs, g) => ground(gs, g), (r, c) => oblique(r, c, { ...obliqueOpts, outline: "rgba(20,16,14,0.6)" }));
      const actors = rotateActors(rs, mockActors(sc));
      drawActors(rs, ctx, actors);
      shadeOutside(ctx, rotateScreen(sc, lineOfSight(sc, Math.max(sc.W, sc.H) / sc.scale), rs.rotation), "rgba(40,44,60,0.55)", 2);
      drawPlayer(rs, ctx, FACING);
      drawHud(rs, ctx, actors);
    },
  },
  {
    id: "play-enter",
    name: "Entering a building",
    group: G,
    blurb: "Door Kickers-style cutaway: the building you're in loses its roof and shows generated rooms, doors, loot and occupants. Outside dims. Interiors are made from the real footprint.",
    draw(sc, ctx) {
      gta(sc, ctx, false);
      const b = enteredBuilding(sc);
      ctx.save();
      ctx.fillStyle = "rgba(10,10,20,0.45)";
      ctx.fillRect(0, 0, sc.W, sc.H);
      ctx.restore();
      const inside = b ? cutawayInterior(sc, ctx, b) : [];
      const actors = [...inside, ...mockActors(sc).filter((a) => a.kind !== "gang" && a.kind !== "rival")];
      drawActors(sc, ctx, inside);
      drawPlayer(sc, ctx, FACING);
      drawHud(sc, ctx, actors);
    },
  },
  {
    id: "play-lit-oblique",
    name: "Lit oblique night",
    group: G,
    rotatable: true,
    blurb: "Mashup: oblique 3/4 buildings with lit windows, streetlamps and neon (Lumen's lighting on real shapes). Moody but every wall and enemy still reads. Rotatable.",
    draw(sc, ctx) {
      const rs = withCamera(sc, ctx, (gs, g) => ground(gs, g), (r, c) =>
        oblique(r, c, {
          roof: (b) => css(mul(ROOF[Math.floor(b.r * 4)]!, 0.8)),
          wall: (b, s) => css(mul(WALL[Math.floor(b.r * 4)]!, s * 0.8)),
          outline: "rgba(10,8,8,0.7)",
          windows: "rgba(255,214,140,0.95)",
        }),
      );
      const lights = gatherLights(rs, { windowChance: 0.1 });
      applyLighting(rs, ctx, lights, { ambient: [120, 116, 160], bloom: 0.35 });
      lightPoints(rs, ctx, lights);
      play(sc, ctx, mockActors(sc), "dark", rs);
    },
  },
  {
    id: "play-tactical",
    name: "Clean tactical plan",
    group: G,
    blurb: "XCOM / Door Kickers readability: flat plan, soft shadows, strong outlines, nothing competing with the actors. Best for planning fights; least atmospheric.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [222, 220, 214], building: [150, 154, 164], named: [170, 150, 120], major: [196, 196, 196], minor: [206, 206, 206], park: [190, 214, 176], water: [150, 190, 220] }), { buildingStroke: [60, 64, 74], shadow: { dx: 0.3, dy: 0.3, color: "rgba(0,0,0,0.18)" }, lineWidth: 1.4 });
      play(sc, ctx, mockActors(sc), "light");
    },
  },
  {
    id: "play-toy",
    name: "Toy perspective",
    group: G,
    blurb: "Bright tilt-shift city with leaning buildings: friendly, very clear, good for a lighter-toned game or a co-op mode.",
    draw(sc, ctx) {
      planBase(sc, ctx, planPalette({ urban: [200, 214, 170], major: [96, 96, 104], minor: [116, 116, 122], park: [110, 200, 90], forest: [70, 170, 70], water: [80, 180, 230] }), { roadCasing: [240, 240, 232], buildingStroke: null });
      extrude(sc, ctx, {
        roof: (b) => css([[230, 96, 84], [250, 200, 90], [96, 160, 230], [236, 236, 236]][Math.floor(b.r * 4)] as RGB),
        wall: (b, s) => css(mul([[210, 80, 70], [226, 176, 70], [80, 136, 200], [212, 212, 212]][Math.floor(b.r * 4)] as RGB, 0.55 + s * 0.45)),
        outline: "rgba(0,0,0,0.25)",
        windows: (b, quad) => windowGrid(ctx, quad, "rgba(40,60,90,0.5)"),
      });
      play(sc, ctx, mockActors(sc), "light");
    },
  },
];

