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

/** Style-lab styles (from the 02-gallery prototype), played through a generic adapter. Loaded on demand. */
export async function labStyles(): Promise<{ id: string; label: string; group: string }[]> {
  const { LAB_STYLES } = await import("../../02-gallery/src/styles/lab.ts");
  return LAB_STYLES.map((s) => ({ id: `lab:${s.id}`, label: s.rotatable ? `${s.name} ↻` : s.name, group: s.group }));
}

function labStyle(id: string): StyleInfo {
  return {
    id,
    label: "Style lab",
    load: async () => {
      const [{ LAB_STYLES }, { LabRenderer }] = await Promise.all([import("../../02-gallery/src/styles/lab.ts"), import("./renderers/lab.ts")]);
      const style = LAB_STYLES.find((s) => `lab:${s.id}` === id);
      if (!style) throw new Error(`unknown style ${id}`);
      return new LabRenderer(style);
    },
  };
}

export function styleById(id: string | null): StyleInfo {
  if (id?.startsWith("lab:")) return labStyle(id);
  return STYLES.find((s) => s.id === id) ?? STYLES.find((s) => s.id === DEFAULT_STYLE)!;
}
