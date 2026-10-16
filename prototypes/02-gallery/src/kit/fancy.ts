import { valueNoise } from "@familiar-ground/world-core";
import type { Scene, SceneBuilding } from "../scene.ts";
import { clamp, css, mix, mul, type Cls, type RGB } from "./color.ts";
import { buildingPath, clsAt, type Ctx } from "./layers.ts";

/** Class at a screen position. */
export function clsAtScreen(sc: Scene, x: number, y: number): Cls {
  return clsAt(sc, Math.floor((x - sc.W / 2) / sc.scale + sc.cx), Math.floor((y - sc.H / 2) / sc.scale + sc.cy));
}

/** Majority class among a few samples around a screen point. */
function majority(sc: Scene, x: number, y: number, r: number, weigh?: (c: Cls) => number): Cls {
  const votes = new Map<Cls, number>();
  for (const [dx, dy] of [[0, 0], [-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3], [0, -0.6], [0, 0.6]]) {
    const c = clsAtScreen(sc, x + dx! * r, y + dy! * r);
    votes.set(c, (votes.get(c) ?? 0) + (weigh?.(c) ?? 1));
  }
  let best: Cls = "void";
  let n = -1;
  for (const [c, v] of votes) if (v > n) (n = v), (best = c);
  return best;
}

/** Civilization-style hex map: each hex takes its dominant terrain and an icon. */
export function hexMap(sc: Scene, ctx: Ctx, size: number, color: (c: Cls) => RGB, icon?: (c: Cls, x: number, y: number, s: number, r: number) => void, border = "rgba(0,0,0,0.25)"): void {
  const w = Math.sqrt(3) * size;
  const h = 1.5 * size;
  for (let row = -1; row * h < sc.H + size; row++) {
    for (let col = -1; col * w < sc.W + w; col++) {
      const x = col * w + (row & 1 ? w / 2 : 0);
      const y = row * h;
      const c = majority(sc, x, y, size, (k) => (k === "building" || k === "named" ? 1.6 : k === "major" || k === "minor" ? 1.3 : 1));
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = x + Math.cos(a) * size;
        const py = y + Math.sin(a) * size;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      const r = sc.rand(Math.round(x), Math.round(y), 41);
      ctx.fillStyle = css(mul(color(c), 0.94 + r * 0.12));
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.stroke();
      icon?.(c, x, y, size, r);
    }
  }
}

/** Stained glass / mosaic: Voronoi tiles coloured by what's under their centre, with lead lines. */
export function mosaic(sc: Scene, ctx: Ctx, cell: number, color: (c: Cls, r: number) => RGB, lead: RGB = [24, 22, 20], leadW = 1.2): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const sites: { x: number; y: number; c: RGB }[] = [];
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const x = (i - 1 + 0.15 + sc.rand(i, j, 51) * 0.7) * cell;
      const y = (j - 1 + 0.15 + sc.rand(i, j, 52) * 0.7) * cell;
      sites.push({ x, y, c: color(clsAtScreen(sc, x, y), sc.rand(i, j, 53)) });
    }
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gi = Math.floor(x / cell) + 1;
      const gj = Math.floor(y / cell) + 1;
      let b1 = Infinity;
      let b2 = Infinity;
      let best = sites[0]!;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const s = sites[(gj + dj) * gw + gi + di];
          if (!s) continue;
          const dd = (s.x - x) ** 2 + (s.y - y) ** 2;
          if (dd < b1) (b2 = b1), (b1 = dd), (best = s);
          else if (dd < b2) b2 = dd;
        }
      const edge = Math.sqrt(b2) - Math.sqrt(b1) < leadW;
      const c = edge ? lead : best.c;
      const o = (y * W + x) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Lego baseplate: one stud per grid square in the colour beneath. */
export function lego(sc: Scene, ctx: Ctx, stud: number, color: (c: Cls) => RGB, raise?: (c: Cls) => boolean): void {
  for (let y = 0; y < sc.H; y += stud) {
    for (let x = 0; x < sc.W; x += stud) {
      const c = clsAtScreen(sc, x + stud / 2, y + stud / 2);
      const col = color(c);
      const up = raise?.(c) ?? false;
      ctx.fillStyle = css(mul(col, up ? 0.82 : 0.9));
      ctx.fillRect(x, y, stud, stud);
      ctx.fillStyle = css(col);
      ctx.fillRect(x + 0.5, y + 0.5, stud - 1.5, stud - 1.5);
      const r = stud * 0.3;
      ctx.beginPath();
      ctx.arc(x + stud / 2 + (up ? 0.6 : 0.3), y + stud / 2 + (up ? 0.8 : 0.4), r, 0, Math.PI * 2);
      ctx.fillStyle = css(mul(col, 0.7));
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + stud / 2, y + stud / 2, r, 0, Math.PI * 2);
      ctx.fillStyle = css(mix(col, [255, 255, 255], 0.18));
      ctx.fill();
    }
  }
}

/** Cross-stitch on linen: an X per square, skipping "background" classes. */
export function crossStitch(sc: Scene, ctx: Ctx, size: number, color: (c: Cls) => RGB | null, fabric: RGB = [238, 230, 212]): void {
  ctx.fillStyle = css(fabric);
  ctx.fillRect(0, 0, sc.W, sc.H);
  ctx.strokeStyle = "rgba(0,0,0,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < sc.W; x += size) (ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, sc.H));
  for (let y = 0; y < sc.H; y += size) (ctx.moveTo(0, y + 0.5), ctx.lineTo(sc.W, y + 0.5));
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1, size * 0.22);
  for (let y = 0; y < sc.H; y += size) {
    for (let x = 0; x < sc.W; x += size) {
      const col = color(clsAtScreen(sc, x + size / 2, y + size / 2));
      if (!col) continue;
      const k = 0.92 + sc.rand(x, y, 61) * 0.16;
      const p = size * 0.18;
      ctx.strokeStyle = css(mul(col, k * 0.85));
      ctx.beginPath();
      ctx.moveTo(x + p, y + p);
      ctx.lineTo(x + size - p, y + size - p);
      ctx.stroke();
      ctx.strokeStyle = css(mul(col, k));
      ctx.beginPath();
      ctx.moveTo(x + size - p, y + p);
      ctx.lineTo(x + p, y + size - p);
      ctx.stroke();
    }
  }
}

/** Text-mode map: a glyph and colour per character cell. */
export function glyphs(sc: Scene, ctx: Ctx, charPx: number, map: (c: Cls, r: number, x: number, y: number) => [string, string, string?] | null, font = "ui-monospace, Menlo, Consolas, monospace"): void {
  ctx.save();
  ctx.font = `${charPx}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cw = charPx * 0.62;
  for (let y = 0; y < sc.H; y += charPx) {
    for (let x = 0; x < sc.W; x += cw) {
      const c = clsAtScreen(sc, x + cw / 2, y + charPx / 2);
      const g = map(c, sc.rand(Math.round(x * 7), Math.round(y * 7), 63), x, y);
      if (!g) continue;
      if (g[2]) {
        ctx.fillStyle = g[2];
        ctx.fillRect(x, y, cw + 0.5, charPx + 0.5);
      }
      ctx.fillStyle = g[1];
      ctx.fillText(g[0], x + cw / 2, y + charPx / 2 + 1);
    }
  }
  ctx.restore();
}

/** Braille art: each character is a 2×4 grid of dots, lit where `ink` is true. */
export function braille(sc: Scene, ctx: Ctx, charPx: number, ink: (c: Cls) => boolean, color: string): void {
  ctx.save();
  ctx.font = `${charPx}px "Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols 2", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  const cw = charPx * 0.55;
  const bits = [[0, 0, 0x1], [0, 1, 0x2], [0, 2, 0x4], [1, 0, 0x8], [1, 1, 0x10], [1, 2, 0x20], [0, 3, 0x40], [1, 3, 0x80]] as const;
  for (let y = 0; y < sc.H; y += charPx) {
    for (let x = 0; x < sc.W; x += cw) {
      let code = 0;
      for (const [dx, dy, bit] of bits) if (ink(clsAtScreen(sc, x + (dx + 0.5) * (cw / 2), y + (dy + 0.5) * (charPx / 4)))) code |= bit;
      if (code) ctx.fillText(String.fromCharCode(0x2800 + code), x, y);
    }
  }
  ctx.restore();
}

/** Pointillism: jittered dots in the colour of what's underneath. */
export function pointillism(sc: Scene, ctx: Ctx, spacing: number, color: (c: Cls) => RGB, bgColor: RGB): void {
  ctx.fillStyle = css(bgColor);
  ctx.fillRect(0, 0, sc.W, sc.H);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < sc.H; y += spacing) {
      for (let x = 0; x < sc.W; x += spacing) {
        const jx = x + (sc.rand(x, y, 71 + pass) - 0.5) * spacing * 1.4;
        const jy = y + (sc.rand(x, y, 73 + pass) - 0.5) * spacing * 1.4;
        const base = color(clsAtScreen(sc, jx, jy));
        const v = sc.rand(x, y, 75 + pass);
        const c: RGB = [base[0] + (v - 0.5) * 70, base[1] + (sc.rand(x, y, 76) - 0.5) * 70, base[2] + (sc.rand(x, y, 77) - 0.5) * 70];
        ctx.fillStyle = css(c);
        ctx.beginPath();
        ctx.arc(jx, jy, spacing * (0.42 + v * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Fog of war: everything outside a sight radius is dark, with a remembered (dim) band. */
export function fogOfWar(ctx: Ctx, r: number, color = "0,0,0"): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.75, W / 2, H / 2, r * 1.6);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(0.35, `rgba(${color},0.55)`);
  g.addColorStop(1, `rgba(${color},0.96)`);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Radar sweep with fading trail, range rings and blips. */
export function radar(ctx: Ctx, blips: { x: number; y: number }[], color: RGB = [80, 255, 120]): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.hypot(W, H) / 2;
  ctx.save();
  ctx.strokeStyle = css(color, 0.35);
  ctx.lineWidth = 1;
  for (let r = R / 5; r < R; r += R / 5) (ctx.beginPath(), ctx.arc(cx, cy, r, 0, Math.PI * 2), ctx.stroke());
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(W, cy);
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, H);
  ctx.stroke();
  const a0 = -Math.PI * 0.15;
  for (let k = 0; k < 40; k++) {
    const a = a0 - (k / 40) * 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a - 0.035, a);
    ctx.closePath();
    ctx.fillStyle = css(color, 0.28 * (1 - k / 40));
    ctx.fill();
  }
  for (const b of blips) {
    const ang = Math.atan2(b.y - cy, b.x - cx);
    const behind = ((a0 - ang + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2);
    const glow = Math.max(0.25, 1 - behind * 2.5);
    ctx.fillStyle = css(color, glow);
    ctx.beginPath();
    ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function compassRose(ctx: Ctx, x: number, y: number, r: number, ink: string, accent: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 1;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -(long ? r : r * 0.6));
    ctx.lineTo(r * 0.12, 0);
    ctx.lineTo(-r * 0.12, 0);
    ctx.closePath();
    ctx.fillStyle = k === 7 ? accent : long ? ink : "rgba(0,0,0,0.25)";
    ctx.fill();
  }
  ctx.fillStyle = ink;
  ctx.font = `bold ${Math.round(r * 0.45)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -r - 3);
  ctx.restore();
}

/** Smooth noise patches (overgrowth, moss, snow drifts, puddles) over the whole view. */
export function noisePatches(sc: Scene, ctx: Ctx, color: RGB, threshold: number, scaleCells: number, opts: { mask?: (c: Cls) => boolean; salt?: number; maxAlpha?: number } = {}): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const salt = opts.salt ?? 81;
  const step = 2;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const gx = (x - sc.W / 2) / sc.scale + sc.cx;
      const gy = (y - sc.H / 2) / sc.scale + sc.cy;
      if (opts.mask && !opts.mask(clsAt(sc, Math.floor(gx), Math.floor(gy)))) continue;
      const v = valueNoise(sc.seed, salt, gx / scaleCells, gy / scaleCells) * 0.7 + valueNoise(sc.seed, salt + 1, gx / (scaleCells / 4), gy / (scaleCells / 4)) * 0.3;
      if (v < threshold) continue;
      const a = Math.min(opts.maxAlpha ?? 0.85, (v - threshold) * 6);
      for (let yy = y; yy < Math.min(H, y + step); yy++)
        for (let xx = x; xx < Math.min(W, x + step); xx++) {
          const o = (yy * W + xx) * 4;
          d[o] = d[o]! + (color[0] - d[o]!) * a;
          d[o + 1] = d[o + 1]! + (color[1] - d[o + 1]!) * a;
          d[o + 2] = d[o + 2]! + (color[2] - d[o + 2]!) * a;
        }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Bites taken out of a building (for ruins): returns how damaged it is (0..1). */
export function ruin(sc: Scene, ctx: Ctx, b: SceneBuilding, fill: string, rubble: string, floor = "#6e665c"): number {
  const dmg = b.r;
  buildingPath(sc, ctx, b);
  ctx.fillStyle = fill;
  ctx.fill("evenodd");
  if (dmg < 0.35) return dmg;
  ctx.save();
  buildingPath(sc, ctx, b);
  ctx.clip("evenodd");
  ctx.fillStyle = floor; // caved-in roof: you see the floor and debris inside
  const holes = Math.floor(dmg * 6);
  for (let k = 0; k < holes; k++) {
    const x = sc.sx(b.cx + (sc.rand(k, Math.round(b.r * 1e4), 91) - 0.5) * 12);
    const y = sc.sy(b.cy + (sc.rand(k, Math.round(b.r * 1e4), 92) - 0.5) * 12);
    ctx.beginPath();
    ctx.arc(x, y, sc.scale * (1.5 + dmg * 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = rubble;
  for (let k = 0; k < holes * 8; k++) {
    const x = sc.sx(b.cx + (sc.rand(k, Math.round(b.r * 1e4), 93) - 0.5) * 16);
    const y = sc.sy(b.cy + (sc.rand(k, Math.round(b.r * 1e4), 94) - 0.5) * 16);
    const s = Math.max(1, sc.scale * 0.35);
    ctx.fillRect(x, y, s, s);
  }
  return dmg;
}

/**
 * "City as mountains": building heights spread into a smooth elevation field, drawn as
 * hypsometric tints with contour lines.
 */
export function topoCity(sc: Scene, ctx: Ctx, tints: RGB[], line: RGB, interval = 2): void {
  const { cols, rows } = sc;
  let f = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) f[y * cols + x] = sc.levelsAt(sc.gx0 + x, sc.gy0 + y) * 1.2 - (clsAt(sc, sc.gx0 + x, sc.gy0 + y) === "water" ? 3 : 0);
  const R = Math.max(2, Math.round(6 * Math.min(1, sc.scale / 4)));
  for (let pass = 0; pass < 3; pass++) {
    const g = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      let acc = 0;
      for (let x = -R; x < cols + R; x++) {
        acc += f[y * cols + Math.min(cols - 1, Math.max(0, x + R))]! - f[y * cols + Math.min(cols - 1, Math.max(0, x - R - 1))]!;
        if (x >= 0 && x < cols) g[y * cols + x] = acc / (2 * R + 1);
      }
    }
    const h = new Float32Array(cols * rows);
    for (let x = 0; x < cols; x++) {
      let acc = 0;
      for (let y = -R; y < rows + R; y++) {
        acc += g[Math.min(rows - 1, Math.max(0, y + R)) * cols + x]! - g[Math.min(rows - 1, Math.max(0, y - R - 1)) * cols + x]!;
        if (y >= 0 && y < rows) h[y * cols + x] = acc / (2 * R + 1);
      }
    }
    f = h;
  }
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const sample = (fx: number, fy: number) => {
    const x0 = Math.max(0, Math.min(cols - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(rows - 2, Math.floor(fy)));
    const tx = clamp(fx - x0, 0, 1);
    const ty = clamp(fy - y0, 0, 1);
    const i = y0 * cols + x0;
    return (f[i]! * (1 - tx) + f[i + 1]! * tx) * (1 - ty) + (f[i + cols]! * (1 - tx) + f[i + cols + 1]! * tx) * ty;
  };
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const fx = px / sc.scale - sc.W / 2 / sc.scale + sc.cx - sc.gx0 - 0.5;
      const fy = py / sc.scale - sc.H / 2 / sc.scale + sc.cy - sc.gy0 - 0.5;
      const v = sample(fx, fy);
      const vx = sample(fx + 1 / sc.scale, fy);
      const vy = sample(fx, fy + 1 / sc.scale);
      const t = clamp(v / 14, -0.2, 1);
      const k = Math.max(0, Math.min(tints.length - 1.001, (t + 0.2) * (tints.length - 1) / 1.2));
      const a = tints[Math.floor(k)]!;
      const b = tints[Math.ceil(k)]!;
      let c = mix(a, b, k - Math.floor(k));
      // Contour where the value crosses a multiple of the interval between neighbouring pixels.
      const band = Math.floor(v / interval);
      if (band !== Math.floor(vx / interval) || band !== Math.floor(vy / interval)) c = band % 5 === 0 ? mul(line, 0.7) : line;
      const shade = clamp(1 + (vx - v) * -2 * sc.scale + (vy - v) * -2 * sc.scale, 0.75, 1.2);
      const o = (py * W + px) * 4;
      d[o] = c[0] * shade;
      d[o + 1] = c[1] * shade;
      d[o + 2] = c[2] * shade;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
