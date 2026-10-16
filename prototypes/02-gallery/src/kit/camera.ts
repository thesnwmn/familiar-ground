import { Scene } from "../scene.ts";
import type { Ctx } from "./layers.ts";

/** The camera angle a scene asks for: a fixed angle, or "auto" (follow the street you're on). */
export function viewAngle(sc: Scene): number {
  const a = sc.view.angle;
  return a === "auto" ? sc.streetAngle() : a;
}

/**
 * Draws a scene through a rotatable camera. The flat ground is painted unrotated into a square
 * big enough to cover the screen at any angle, then turned; buildings (and anything else that
 * stands up) are drawn from a rotated copy of the scene so their walls face the new "south".
 * Returns the rotated scene for overlays (actors, labels, lights).
 */
export function withCamera(sc: Scene, ctx: Ctx, ground: (gs: Scene, g: Ctx) => void, standing: (rs: Scene, ctx: Ctx) => void): Scene {
  const theta = viewAngle(sc);
  if (Math.abs(theta) < 1e-3) {
    ground(sc, ctx);
    standing(sc, ctx);
    return sc;
  }
  const D = Math.ceil(Math.hypot(sc.W, sc.H)) + 4;
  const gs = new Scene(sc.world, sc.seed, sc.cx, sc.cy, sc.scale, D, D);
  gs.view = sc.view;
  const off = document.createElement("canvas");
  off.width = D;
  off.height = D;
  const g = off.getContext("2d", { willReadFrequently: true })!;
  ground(gs, g);
  ctx.save();
  ctx.translate(sc.W / 2, sc.H / 2);
  ctx.rotate(theta);
  ctx.drawImage(off, -D / 2, -D / 2);
  ctx.restore();
  const rs = gs.rotated(theta, sc.W, sc.H);
  standing(rs, ctx);
  return rs;
}
