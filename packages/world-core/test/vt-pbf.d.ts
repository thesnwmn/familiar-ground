declare module "vt-pbf" {
  export function fromGeojsonVt(layers: Record<string, unknown>, options?: { version?: number; extent?: number }): Uint8Array;
}
