import { hashInts } from "@familiar-ground/world-core";

export type RGB = [number, number, number];

/** A small tileable texture: RGB per texel, sampled with world texel coordinates. */
export interface Tex {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const r01 = (...n: number[]) => hashInts(...n) / 4294967296;
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function make(w: number, h: number, fn: (x: number, y: number) => RGB): Tex {
  const data = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = fn(x, y);
      const o = (y * w + x) * 3;
      data[o] = clamp(c[0]);
      data[o + 1] = clamp(c[1]);
      data[o + 2] = clamp(c[2]);
    }
  return { w, h, data };
}

/** Writes a texture texel (wrapped at world coordinates wx, wy) into ImageData at index o. */
export function put(img: Uint8ClampedArray, o: number, t: Tex, wx: number, wy: number, k = 1): void {
  const x = ((wx % t.w) + t.w) % t.w;
  const y = ((wy % t.h) + t.h) % t.h;
  const s = (y * t.w + x) * 3;
  img[o] = t.data[s]! * k;
  img[o + 1] = t.data[s + 1]! * k;
  img[o + 2] = t.data[s + 2]! * k;
  img[o + 3] = 255;
}

/** Reads a texture texel (wrapped) into out. */
export function sample(t: Tex, wx: number, wy: number, out: RGB): RGB {
  const x = ((wx % t.w) + t.w) % t.w;
  const y = ((wy % t.h) + t.h) % t.h;
  const s = (y * t.w + x) * 3;
  out[0] = t.data[s]!;
  out[1] = t.data[s + 1]!;
  out[2] = t.data[s + 2]!;
  return out;
}

/** A canvas version of a texture, for pattern fills (roofs, walls). */
export function texCanvas(t: Tex): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = t.w;
  c.height = t.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(t.w, t.h);
  for (let i = 0, j = 0; i < t.w * t.h; i++, j += 3) {
    img.data[i * 4] = t.data[j]!;
    img.data[i * 4 + 1] = t.data[j + 1]!;
    img.data[i * 4 + 2] = t.data[j + 2]!;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Ground and building materials. All tile seamlessly. */
export function makeTextures(salt: number) {
  const n = (x: number, y: number, s: number) => r01(x, y, s, salt);
  const tarmac = (base: RGB) =>
    make(32, 32, (x, y) => {
      const v = n(x, y, 1);
      let c = shade(base, 0.94 + v * 0.1);
      if (v > 0.97) c = shade(base, 1.25); // aggregate glints
      if (n(x >> 3, y >> 3, 2) > 0.85) c = shade(c, 0.93); // repair patches
      return c;
    });
  const slabs = (base: RGB, sw: number, sh: number) =>
    make(sw * 4, sh * 4, (x, y) => {
      const row = Math.floor(y / sh);
      const xo = row % 2 ? sw >> 1 : 0;
      const col = Math.floor((x + xo) / sw);
      const grout = y % sh === 0 || (x + xo) % sw === 0;
      if (grout) return shade(base, 0.86);
      let c = shade(base, 0.97 + n(col, row, 3) * 0.05);
      if (n(x, y, 4) > 0.985) c = shade(c, 0.85); // stains
      if ((x + xo) % sw === 1 || y % sh === 1) c = shade(c, 1.05); // bevel light
      return c;
    });
  const cobbles = (base: RGB) =>
    make(24, 24, (x, y) => {
      const row = Math.floor(y / 3);
      const xo = row % 2 ? 2 : 0;
      const col = Math.floor((x + xo) / 4);
      const ex = (x + xo) % 4;
      const ey = y % 3;
      if (ex === 0 || ey === 0) return shade(base, 0.7);
      return shade(base, (ey === 1 ? 1.08 : 0.95) * (0.9 + n(col, row, 5) * 0.2));
    });
  const grass = (base: RGB) =>
    make(32, 32, (x, y) => {
      const v = n(x, y, 6);
      let c = shade(base, 0.92 + n(x >> 2, y >> 2, 7) * 0.1);
      if (v > 0.93) c = shade(base, 1.22); // blades
      else if (v < 0.04) c = shade(base, 0.78);
      if (n(x, y >> 1, 8) > 0.97) c = mixc(base, [220, 236, 140], 0.5);
      return c;
    });
  const dirt = (base: RGB) =>
    make(32, 32, (x, y) => {
      const v = n(x, y, 9);
      let c = shade(base, 0.92 + n(x >> 1, y >> 1, 10) * 0.14);
      if (v > 0.96) c = shade(base, 1.25); // pebbles
      if (v < 0.03) c = shade(base, 0.75);
      return c;
    });
  const water = (base: RGB) => make(32, 32, (x, y) => shade(base, 0.95 + n(x >> 2, y >> 1, 11) * 0.08));
  const forest = (base: RGB) =>
    make(32, 32, (x, y) => {
      const v = n(x, y, 12);
      let c = shade(base, 0.85 + n(x >> 1, y >> 1, 13) * 0.2);
      if (v > 0.95) c = [120, 90, 50]; // leaf litter
      return c;
    });
  const rubble = make(32, 32, (x, y) => {
    const v = n(x >> 1, y >> 1, 14);
    let c: RGB = v > 0.7 ? [150, 120, 100] : v > 0.4 ? [120, 116, 110] : [96, 92, 88];
    if (n(x, y, 15) > 0.9) c = shade(c, 1.3);
    if (n(x, y, 16) < 0.08) c = shade(c, 0.6);
    return c;
  });
  // Building materials.
  const brick = (base: RGB) =>
    make(16, 16, (x, y) => {
      const row = Math.floor(y / 2);
      const xo = row % 2 ? 2 : 0;
      if ((x + xo) % 4 === 0 || y % 2 === 0) return shade(base, 0.72);
      return shade(base, 0.9 + n(Math.floor((x + xo) / 4), row, 17) * 0.2);
    });
  const render = (base: RGB) => make(16, 16, (x, y) => shade(base, 0.96 + n(x, y, 18) * 0.06));
  const stone = (base: RGB) =>
    make(24, 24, (x, y) => {
      const row = Math.floor(y / 4);
      const xo = row % 2 ? 3 : 0;
      if ((x + xo) % 6 === 0 || y % 4 === 0) return shade(base, 0.78);
      return shade(base, 0.92 + n(Math.floor((x + xo) / 6), row, 19) * 0.14);
    });
  const slate = (base: RGB) =>
    make(16, 16, (x, y) => {
      const row = Math.floor(y / 3);
      const xo = row % 2 ? 2 : 0;
      if (y % 3 === 2) return shade(base, 0.7);
      if ((x + xo) % 4 === 0) return shade(base, 0.82);
      return shade(base, (y % 3 === 0 ? 1.1 : 1) * (0.92 + n(Math.floor((x + xo) / 4), row, 20) * 0.14));
    });
  const pantile = (base: RGB) =>
    make(16, 16, (x, y) => {
      const ridge = x % 4;
      if (y % 4 === 3) return shade(base, 0.68);
      return shade(base, [0.8, 1.15, 1.0, 0.88][ridge]! * (0.94 + n(x >> 2, y >> 2, 21) * 0.1));
    });
  const gravel = (base: RGB) =>
    make(16, 16, (x, y) => {
      const v = n(x, y, 22);
      return shade(base, v > 0.9 ? 1.12 : v < 0.08 ? 0.86 : 0.97 + n(x, y, 24) * 0.05);
    });
  const tar = (base: RGB) => make(32, 32, (x, y) => (x % 16 === 0 || y % 16 === 0 ? shade(base, 0.8) : shade(base, 0.97 + n(x, y, 23) * 0.05)));
  const metal = (base: RGB) => make(16, 16, (x) => shade(base, x % 4 === 0 ? 1.2 : x % 4 === 1 ? 0.85 : 1));
  const glass = (base: RGB) => make(12, 12, (x, y) => (x % 6 === 0 || y % 6 === 0 ? [60, 66, 74] : shade(base, (x % 6) + (y % 6) < 4 ? 1.25 : 1)));
  const greenRoof = grass([88, 128, 64]);

  return {
    tarmac: tarmac([62, 62, 68]),
    tarmacMajor: tarmac([54, 54, 60]),
    pavement: slabs([168, 162, 150], 4, 3),
    plaza: cobbles([160, 144, 120]),
    grass: grass([86, 150, 70]),
    park: grass([96, 160, 74]),
    forest: forest([56, 104, 52]),
    dirt: dirt([166, 136, 98]),
    sand: dirt([214, 192, 140]),
    farm: dirt([150, 130, 80]),
    water: water([46, 96, 140]),
    rubble,
    walls: [brick([168, 92, 70]), brick([150, 120, 96]), render([214, 204, 186]), render([196, 170, 140]), stone([176, 170, 156]), glass([90, 130, 160])],
    roofsPitched: [slate([86, 92, 106]), pantile([176, 92, 64]), slate([110, 96, 88])],
    roofsFlat: [gravel([140, 136, 128]), tar([70, 70, 76]), metal([150, 156, 162]), greenRoof],
  };
}
export type Textures = ReturnType<typeof makeTextures>;
export { mixc, shade };
