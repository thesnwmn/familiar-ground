import type { StyleInfo } from "./renderers/types.ts";

/** Every style is loaded on demand, so Three.js is only downloaded for the 3D ones. */
export const STYLES: StyleInfo[] = [
  { id: "ascii", label: "ASCII", load: async () => new (await import("./renderers/ascii.ts")).AsciiRenderer() },
  { id: "pixel", label: "Pixel art", load: async () => new (await import("./renderers/pixel.ts")).PixelRenderer() },
  { id: "iso", label: "Isometric", load: async () => new (await import("./renderers/iso.ts")).IsoRenderer() },
  { id: "lumen", label: "Lumen", load: async () => new (await import("./renderers/lumen.ts")).LumenRenderer(false) },
  { id: "lumen-biomes", label: "Lumen + biomes", load: async () => new (await import("./renderers/lumen.ts")).LumenRenderer(true) },
  { id: "sketch", label: "Sketch", load: async () => new (await import("./renderers/sketch.ts")).SketchRenderer() },
  { id: "voxel", label: "Voxel 3D", load: async () => new (await import("./renderers/three/voxel.ts")).VoxelRenderer() },
  { id: "lowpoly", label: "Low-poly 3D", load: async () => new (await import("./renderers/three/lowpoly.ts")).LowPolyRenderer() },
];

export const DEFAULT_STYLE = "pixel";

export function styleById(id: string | null): StyleInfo {
  return STYLES.find((s) => s.id === id) ?? STYLES.find((s) => s.id === DEFAULT_STYLE)!;
}
