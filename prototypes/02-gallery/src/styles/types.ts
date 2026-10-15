import type { Scene } from "../scene.ts";

export interface StillStyle {
  id: string;
  name: string;
  group: string;
  /** One line: what it is and what it's inspired by. */
  blurb: string;
  /** Present for styles that exist in the game, so the gallery can link to them. */
  playable?: string;
  /** Honours the camera angle (gallery control / in-game Q, E, twist and auto street-follow). */
  rotatable?: boolean;
  draw(sc: Scene, ctx: CanvasRenderingContext2D): void | Promise<void>;
}
