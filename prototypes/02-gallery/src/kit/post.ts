import { clamp, lum, type RGB } from "./color.ts";
import type { Ctx } from "./layers.ts";

const full = (ctx: Ctx) => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
const BAYER8 = (() => {
  const m: number[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let v = 0;
      for (let bit = 0; bit < 3; bit++) {
        const xb = (x >> bit) & 1;
        const yb = (y >> bit) & 1;
        v |= ((xb ^ yb) << (5 - bit * 2)) | (yb << (4 - bit * 2));
      }
      m.push((v + 0.5) / 64 - 0.5);
    }
  return m;
})();

/** Snap every pixel to the nearest palette colour, optionally ordered-dithered (pixel size `px`). */
export function quantize(ctx: Ctx, palette: RGB[], dither: "none" | "bayer4" | "bayer8" = "bayer4", strength = 48, px = 1): void {
  const img = full(ctx);
  const d = img.data;
  const W = img.width;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    const x = Math.floor((p % W) / px);
    const y = Math.floor(Math.floor(p / W) / px);
    const t = dither === "bayer4" ? BAYER4[(y & 3) * 4 + (x & 3)]! : dither === "bayer8" ? BAYER8[(y & 7) * 8 + (x & 7)]! : 0;
    const r = d[i]! + t * strength;
    const g = d[i + 1]! + t * strength;
    const b = d[i + 2]! + t * strength;
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < palette.length; k++) {
      const c = palette[k]!;
      const dist = (r - c[0]) ** 2 * 0.3 + (g - c[1]) ** 2 * 0.59 + (b - c[2]) ** 2 * 0.11;
      if (dist < bd) (bd = dist), (best = k);
    }
    const c = palette[best]!;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  ctx.putImageData(img, 0, 0);
}

/** Map luminance onto a gradient of colours (thermal, sepia, monochrome screens). */
export function gradientMap(ctx: Ctx, stops: RGB[], contrast = 1): void {
  const img = full(ctx);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = lum([d[i]!, d[i + 1]!, d[i + 2]!]) / 255;
    v = clamp((v - 0.5) * contrast + 0.5, 0, 1);
    const f = v * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(f));
    const t = f - k;
    const a = stops[k]!;
    const b = stops[k + 1]!;
    d[i] = a[0] + (b[0] - a[0]) * t;
    d[i + 1] = a[1] + (b[1] - a[1]) * t;
    d[i + 2] = a[2] + (b[2] - a[2]) * t;
  }
  ctx.putImageData(img, 0, 0);
}

/** Chunky pixels: downsample then scale back up without smoothing. */
export function pixelate(ctx: Ctx, n: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(W / n));
  small.height = Math.max(1, Math.round(H / n));
  const s = small.getContext("2d")!;
  s.imageSmoothingEnabled = true;
  s.drawImage(ctx.canvas, 0, 0, small.width, small.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, W, H);
  ctx.restore();
}

export function scanlines(ctx: Ctx, alpha = 0.25, gap = 3): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (let y = 0; y < ctx.canvas.height; y += gap) ctx.fillRect(0, y, ctx.canvas.width, 1);
  ctx.restore();
}

/** Red/blue channels nudged apart, like a cheap lens or a VHS tape. */
export function chromatic(ctx: Ctx, shift = 2): void {
  const img = full(ctx);
  const src = new Uint8ClampedArray(img.data);
  const W = img.width;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % W;
    const l = i - Math.min(x, shift) * 4;
    const r = i + Math.min(W - 1 - x, shift) * 4;
    d[i] = src[l]!;
    d[i + 2] = src[r + 2]!;
  }
  ctx.putImageData(img, 0, 0);
}

export function grain(ctx: Ctx, amount = 18, seed = 1): void {
  const img = full(ctx);
  const d = img.data;
  let s = seed * 9301 + 49297;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 9301 + 49297) % 233280;
    const n = (s / 233280 - 0.5) * amount;
    d[i] = d[i]! + n;
    d[i + 1] = d[i + 1]! + n;
    d[i + 2] = d[i + 2]! + n;
  }
  ctx.putImageData(img, 0, 0);
}

export function vignette(ctx: Ctx, strength = 0.5, color = "0,0,0"): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** A blurred copy via downscale + smooth upscale (works everywhere, unlike ctx.filter). */
export function blurred(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(canvas.width / factor));
  small.height = Math.max(1, Math.round(canvas.height / factor));
  const s = small.getContext("2d")!;
  s.imageSmoothingEnabled = true;
  s.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
}

/** Tilt-shift: sharp band across the middle, blurred top and bottom (makes cities look like toys). */
export function tiltShift(ctx: Ctx, factor = 6): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const blur = blurred(ctx.canvas, factor);
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const m = mask.getContext("2d")!;
  m.imageSmoothingEnabled = true;
  m.drawImage(blur, 0, 0, W, H);
  m.globalCompositeOperation = "destination-in";
  const g = m.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.35, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  m.fillStyle = g;
  m.fillRect(0, 0, W, H);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}

/** Ink lines where brightness changes sharply (comic outlines from any image). */
export function inkEdges(ctx: Ctx, color: RGB = [20, 16, 14], threshold = 40): void {
  const img = full(ctx);
  const W = img.width;
  const H = img.height;
  const d = img.data;
  const L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = lum([d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!]);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = L[i + 1]! - L[i - 1]!;
      const gy = L[i + W]! - L[i - W]!;
      if (Math.abs(gx) + Math.abs(gy) > threshold) {
        d[i * 4] = color[0];
        d[i * 4 + 1] = color[1];
        d[i * 4 + 2] = color[2];
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function posterize(ctx: Ctx, levels = 4): void {
  const img = full(ctx);
  const d = img.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.round(d[i]! / step) * step;
    d[i + 1] = Math.round(d[i + 1]! / step) * step;
    d[i + 2] = Math.round(d[i + 2]! / step) * step;
  }
  ctx.putImageData(img, 0, 0);
}

/** Diagonal rain streaks. */
export function rain(ctx: Ctx, density = 0.0025, color = "rgba(180,200,255,0.35)", seed = 3): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const n = Math.floor(W * H * density);
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = 6 + r() * 10;
    ctx.moveTo(x, y);
    ctx.lineTo(x - len * 0.3, y + len);
  }
  ctx.stroke();
  ctx.restore();
}

export function fog(ctx: Ctx, color: string, alpha = 0.3): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** Classic halftone: dots sized by darkness on a rotated grid, one pass per ink. */
export function halftone(ctx: Ctx, inks: { color: string; angle: number; channel: (c: RGB) => number }[], cell = 5, paper = "#f6f1e4"): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const src = full(ctx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "multiply";
  for (const ink of inks) {
    const ca = Math.cos(ink.angle);
    const sa = Math.sin(ink.angle);
    ctx.fillStyle = ink.color;
    ctx.beginPath();
    const R = Math.hypot(W, H);
    for (let v = -R; v < R; v += cell) {
      for (let u = -R; u < R; u += cell) {
        const x = W / 2 + u * ca - v * sa;
        const y = H / 2 + u * sa + v * ca;
        if (x < -cell || y < -cell || x > W + cell || y > H + cell) continue;
        const px = Math.min(W - 1, Math.max(0, Math.round(x)));
        const py = Math.min(H - 1, Math.max(0, Math.round(y)));
        const o = (py * W + px) * 4;
        const amount = ink.channel([src.data[o]!, src.data[o + 1]!, src.data[o + 2]!]);
        const r = Math.sqrt(Math.max(0, amount)) * cell * 0.62;
        if (r < 0.3) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Two-tone threshold with ordered dithering (1-bit look), pixel size `px`. */
export function oneBit(ctx: Ctx, dark: RGB, light: RGB, px = 1, bias = 0): void {
  const img = full(ctx);
  const d = img.data;
  const W = img.width;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    const x = Math.floor((p % W) / px);
    const y = Math.floor(Math.floor(p / W) / px);
    const v = lum([d[i]!, d[i + 1]!, d[i + 2]!]) / 255 + BAYER8[(y & 7) * 8 + (x & 7)]! + bias;
    const c = v > 0.5 ? light : dark;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
  }
  ctx.putImageData(img, 0, 0);
}

/** Paper/canvas texture multiplied over the image. */
export function paperGrain(ctx: Ctx, amount = 0.08, seed = 7): void {
  const img = full(ctx);
  const d = img.data;
  const W = img.width;
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4;
    const x = p % W;
    const y = Math.floor(p / W);
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const n = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    const k = 1 - amount * n - amount * 0.5 * Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) ** 2;
    d[i] = d[i]! * k;
    d[i + 1] = d[i + 1]! * k;
    d[i + 2] = d[i + 2]! * k;
  }
  ctx.putImageData(img, 0, 0);
}
