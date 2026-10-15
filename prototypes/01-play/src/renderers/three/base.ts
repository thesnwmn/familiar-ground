import { CHUNK_CELLS, Ground, Structure, type Chunk } from "@familiar-ground/world-core";
import * as THREE from "three";
import { GROUND_RGB } from "../../palette.ts";
import { cellNoise } from "../sample.ts";
import type { Renderer, View } from "../types.ts";

export interface Zoom3D {
  /** Camera distance from the player, in cells. */
  dist: number;
  speed: number;
}

/** Chunk meshes built per frame at most, so streaming in a new area doesn't freeze the page. */
const BUILDS_PER_FRAME = 2;
/** Re-centre the scene when the player wanders this far, keeping GPU float coordinates small. */
const REANCHOR = 8 * CHUNK_CELLS;

/**
 * Shared Three.js plumbing for the 3D styles: scene, lights, follow camera, per-chunk meshes
 * built lazily and rebuilt on edits. One cell is one unit; +x is east, +z is south, y is up.
 */
export abstract class ThreeRenderer implements Renderer {
  abstract readonly zoomLevels: readonly Zoom3D[];
  abstract readonly defaultZoom: number;
  protected abstract readonly pitchDeg: number;
  protected abstract readonly antialias: boolean;
  protected abstract readonly sky: number;
  protected scene = new THREE.Scene();
  protected camera = new THREE.PerspectiveCamera(45, 1, 0.5, 4000);
  protected gl!: THREE.WebGLRenderer;
  private readonly meshes = new Map<Chunk, THREE.Object3D>();
  private origin: { x: number; y: number } | null = null;
  private player!: THREE.Object3D;

  /** Builds a chunk's meshes in chunk-local coordinates (0..CHUNK_CELLS on x and z). */
  protected abstract buildChunk(chunk: Chunk): THREE.Object3D;
  protected abstract buildPlayer(): THREE.Object3D;

  mount(container: HTMLElement): void {
    this.gl = new THREE.WebGLRenderer({ antialias: this.antialias, powerPreference: "high-performance" });
    this.gl.domElement.className = "fill";
    container.append(this.gl.domElement);
    this.scene.background = new THREE.Color(this.sky);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.position.set(-0.6, 1, 0.35);
    this.scene.add(sun);
    this.player = this.buildPlayer();
    this.scene.add(this.player);
  }

  resize(width: number, height: number): void {
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setSize(Math.max(1, width), Math.max(1, height), false);
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  viewRadius(view: View): number {
    return Math.ceil(this.zoomLevels[view.zoomLevel]!.dist * 2.2) + 16;
  }

  chunkChanged(chunk: Chunk): void {
    this.drop(chunk);
  }

  chunkEvicted(chunk: Chunk): void {
    this.drop(chunk);
  }

  render(view: View): boolean {
    const { x: px, y: py } = view.player;
    if (!this.origin || Math.abs(px - this.origin.x) > REANCHOR || Math.abs(py - this.origin.y) > REANCHOR) {
      this.origin = { x: Math.floor(px / CHUNK_CELLS) * CHUNK_CELLS, y: Math.floor(py / CHUNK_CELLS) * CHUNK_CELLS };
      for (const [chunk, obj] of this.meshes) this.place(chunk, obj);
    }
    // Build missing chunk meshes nearest-first, a few per frame.
    let built = 0;
    let pending = false;
    const missing = [...view.world.loaded()].filter((c) => !this.meshes.has(c));
    missing.sort((a, b) => dist2(a, px, py) - dist2(b, px, py));
    for (const chunk of missing) {
      if (built >= BUILDS_PER_FRAME) {
        pending = true;
        break;
      }
      const obj = this.buildChunk(chunk);
      this.place(chunk, obj);
      this.scene.add(obj);
      this.meshes.set(chunk, obj);
      built++;
    }

    const { dist } = this.zoomLevels[view.zoomLevel]!;
    const tx = px + 0.5 - this.origin.x;
    const tz = py + 0.5 - this.origin.y;
    const pitch = (this.pitchDeg * Math.PI) / 180;
    this.camera.position.set(tx, Math.sin(pitch) * dist, tz + Math.cos(pitch) * dist);
    this.camera.lookAt(tx, 0, tz);
    this.scene.fog = new THREE.Fog(this.sky, dist * 1.3, dist * 2.6);
    this.player.position.set(tx, 0, tz);
    this.player.rotation.y = Math.atan2(view.player.fx, view.player.fy);
    this.gl.render(this.scene, this.camera);
    return pending;
  }

  destroy(): void {
    for (const chunk of [...this.meshes.keys()]) this.drop(chunk);
    disposeObject(this.player);
    this.gl.dispose();
    this.gl.domElement.remove();
  }

  private place(chunk: Chunk, obj: THREE.Object3D): void {
    obj.position.set(chunk.cx * CHUNK_CELLS - this.origin!.x, 0, chunk.cy * CHUNK_CELLS - this.origin!.y);
  }

  private drop(chunk: Chunk): void {
    const obj = this.meshes.get(chunk);
    if (!obj) return;
    this.scene.remove(obj);
    disposeObject(obj);
    this.meshes.delete(chunk);
  }
}

const dist2 = (c: Chunk, px: number, py: number) => {
  const dx = (c.cx + 0.5) * CHUNK_CELLS - px;
  const dy = (c.cy + 0.5) * CHUNK_CELLS - py;
  return dx * dx + dy * dy;
};

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      (m as THREE.MeshLambertMaterial).map?.dispose();
      m.dispose();
    }
  });
}

/** The chunk's ground as a texture on one flat quad (cheap: one draw per chunk however detailed). */
export function groundPlane(chunk: Chunk, opts: { smooth: boolean; jitter: number; tint?: (g: Ground) => [number, number, number] }): THREE.Mesh {
  const n = chunk.size;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const g = chunk.ground[i] as Ground;
      const [r, gg, b] = opts.tint ? opts.tint(g) : GROUND_RGB[g];
      const k = 1 - opts.jitter / 2 + cellNoise(chunk.cx * n + x, chunk.cy * n + y) * opts.jitter;
      // DataTexture rows start at the bottom (v = 0), which is the chunk's south edge.
      data.set([Math.min(255, r * k), Math.min(255, gg * k), Math.min(255, b * k), 255], ((n - 1 - y) * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = opts.smooth ? THREE.LinearFilter : THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(n, n);
  geo.rotateX(-Math.PI / 2);
  geo.translate(n / 2, 0, n / 2);
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
}

/** Heights of standing things per cell, in cells (buildings from floors at ~3 m each). */
export function cellHeights(chunk: Chunk, levelsAt: (i: number) => number): Float32Array {
  const h = new Float32Array(chunk.size * chunk.size);
  const perFloor = 3 / chunk.cellSizeM;
  for (let i = 0; i < h.length; i++) {
    const s = chunk.structure[i];
    if (s === Structure.BUILDING) h[i] = levelsAt(i) * perFloor;
    else if (s === Structure.WALL) h[i] = 1.6 / chunk.cellSizeM + 0.5;
  }
  return h;
}

/** Accumulates coloured quads into one BufferGeometry. */
export class QuadBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  /** Quad from four corners (counter-clockwise seen from outside) with a flat normal and colour. */
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], rgb: [number, number, number]): void {
    for (const v of [a, b, c, a, c, d]) {
      this.pos.push(v[0]!, v[1]!, v[2]!);
      this.nor.push(n[0]!, n[1]!, n[2]!);
      this.col.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    }
  }

  /** An axis-aligned column standing on the cell (x, z), height h, with faces only where `exposed` says so. */
  column(x: number, z: number, h: number, base: number, top: [number, number, number], side: [number, number, number], exposed: (dx: number, dz: number) => number, bands = 0): void {
    const y0 = base;
    const y1 = base + h;
    this.quad([x, y1, z + 1], [x + 1, y1, z + 1], [x + 1, y1, z], [x, y1, z], [0, 1, 0], top);
    const sides: [number, number, number[], number[], number[]][] = [
      [0, 1, [x, 0, z + 1], [x + 1, 0, z + 1], [0, 0, 1]],
      [0, -1, [x + 1, 0, z], [x, 0, z], [0, 0, -1]],
      [1, 0, [x + 1, 0, z + 1], [x + 1, 0, z], [1, 0, 0]],
      [-1, 0, [x, 0, z], [x, 0, z + 1], [-1, 0, 0]],
    ];
    for (const [dx, dz, p, q, n] of sides) {
      const from = Math.max(y0, exposed(dx, dz));
      if (from >= y1) continue;
      // Optional horizontal bands (one per floor) give voxel buildings visible storeys.
      const step = bands > 0 ? bands : y1 - from;
      for (let ya = from, k = 0; ya < y1 - 1e-6; ya += step, k++) {
        const yb = Math.min(y1, ya + step);
        const shade = bands > 0 && k % 2 === 1 ? 0.9 : 1;
        const c: [number, number, number] = [side[0] * shade, side[1] * shade, side[2] * shade];
        this.quad([p[0]!, ya, p[2]!], [q[0]!, ya, q[2]!], [q[0]!, yb, q[2]!], [p[0]!, yb, p[2]!], n, c);
      }
    }
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    return geo;
  }
}

export const linearColor = (rgb: [number, number, number]): [number, number, number] => {
  const c = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
  return [c.r * 255, c.g * 255, c.b * 255];
};
