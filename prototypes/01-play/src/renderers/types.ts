import type { Chunk, World } from "@familiar-ground/world-core";

/** What every renderer gets to draw: the world and the player. Renderers never change the world. */
export interface View {
  world: World;
  player: { x: number; y: number; fx: number; fy: number };
  /** Index into the renderer's own `zoomLevels`. */
  zoomLevel: number;
  /** World seed, for renderers that add deterministic decoration (biomes, lamps). */
  seed: number;
}

export interface ZoomLevel {
  /** Multiplier for joystick speed, so zoomed-out views don't race across the map. */
  speed: number;
}

/**
 * A rendering style. The shell owns the world, input, HUD and streaming; a renderer only draws.
 * Chunk hooks let renderers cache per-chunk work (canvases, paths, meshes).
 */
export interface Renderer {
  /** Most zoomed-in first. */
  readonly zoomLevels: readonly ZoomLevel[];
  readonly defaultZoom: number;
  mount(container: HTMLElement): void;
  resize(width: number, height: number): void;
  /** Radius in cells around the player that should be loaded for the current view. */
  viewRadius(view: View): number;
  /** Draws a frame. Returning true asks for another frame (e.g. while caches are still being built). */
  render(view: View): boolean | void;
  chunkLoaded?(chunk: Chunk): void;
  /** A loaded chunk was edited by the player. */
  chunkChanged?(chunk: Chunk): void;
  chunkEvicted?(chunk: Chunk): void;
  destroy(): void;
}

export interface StyleInfo {
  id: string;
  label: string;
  load: () => Promise<Renderer>;
}
