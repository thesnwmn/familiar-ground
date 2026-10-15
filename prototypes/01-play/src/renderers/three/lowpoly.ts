import { CHUNK_CELLS, Ground, Structure, type Chunk, type Point } from "@familiar-ground/world-core";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GROUND_RGB, NAMED_BUILDING_RGB, WALL_RGB, buildingLevels } from "../../palette.ts";
import { cellNoise } from "../sample.ts";
import { QuadBuilder, ThreeRenderer, cellHeights, groundPlane, linearColor, type Zoom3D } from "./base.ts";

type RGB = [number, number, number];
/** Soft pastel palette: low-poly reads best with gentle, flat colours. */
const PASTELS: [roof: RGB, wall: RGB][] = [
  [[230, 132, 112], [246, 232, 214]],
  [[124, 150, 190], [236, 238, 242]],
  [[214, 176, 120], [244, 236, 220]],
  [[160, 180, 150], [238, 240, 230]],
  [[200, 150, 170], [246, 236, 238]],
];
const soften = (g: Ground): RGB => {
  const [r, gg, b] = GROUND_RGB[g];
  return [r * 0.8 + 255 * 0.2, gg * 0.8 + 255 * 0.2, b * 0.8 + 255 * 0.2];
};

/**
 * Low-poly diorama: buildings extruded from their real footprints (not the cell grid), with flat
 * shading, pastel colours, cone trees and a soft ground. A building the player has damaged falls
 * back to per-cell blocks for what's left of it.
 */
export class LowPolyRenderer extends ThreeRenderer {
  readonly zoomLevels: Zoom3D[] = [
    { dist: 26, speed: 1 },
    { dist: 42, speed: 1 },
    { dist: 70, speed: 0.85 },
    { dist: 110, speed: 0.7 },
    { dist: 170, speed: 0.55 },
  ];
  readonly defaultZoom = 2;
  protected readonly pitchDeg = 50;
  protected readonly antialias = true;
  protected readonly sky = 0xcfe3ef;

  protected buildChunk(chunk: Chunk): THREE.Object3D {
    const group = new THREE.Group();
    group.add(groundPlane(chunk, { smooth: true, jitter: 0.04, tint: soften }));
    const n = chunk.size;
    const perFloor = 3 / chunk.cellSizeM;
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    // Which buildings are still whole in this chunk?
    const remaining = new Int32Array(chunk.buildings.length);
    for (let i = 0; i < n * n; i++) {
      const b = chunk.building[i]!;
      if (b >= 0 && chunk.structure[i] === Structure.BUILDING) remaining[b]!++;
    }
    const intact = (b: number) => remaining[b] === chunk.buildings[b]!.cells;

    const extruded: THREE.BufferGeometry[] = [];
    chunk.buildings.forEach((b, index) => {
      if (!intact(index) || !ownsBuilding(b.rings)) return;
      const geo = extrude(b.rings, buildingLevelsFor(chunk, index) * perFloor);
      if (!geo) return;
      let hash = 0;
      for (const c of b.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
      const named = b.kind !== "building";
      const [roof, wall] = named ? [NAMED_BUILDING_RGB, [250, 240, 214] as RGB] : PASTELS[Math.abs(hash) % PASTELS.length]!;
      paint(geo, linearColor(roof), linearColor(wall));
      extruded.push(geo);
    });

    // Damaged buildings and player-built walls: blocks for each remaining cell.
    const heights = cellHeights(chunk, (i) => buildingLevels(chunk, i));
    const hAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 0 : heights[z * n + x]!);
    const quads = new QuadBuilder();
    const trees: { x: number; z: number; h: number }[] = [];
    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const s = chunk.structure[i];
        if (s === Structure.TREE) trees.push({ x, z, h: 1.8 + cellNoise(chunk.cx * n + x, chunk.cy * n + z, 4) * 1.8 });
        else if (s === Structure.WALL) quads.column(x, z, heights[i]!, 0, linearColor(WALL_RGB), linearColor(WALL_RGB), (dx, dz) => hAt(x + dx, z + dz));
        else if (s === Structure.BUILDING && !intact(chunk.building[i]!)) {
          quads.column(x, z, heights[i]!, 0, linearColor([200, 190, 180]), linearColor([226, 218, 206]), (dx, dz) => hAt(x + dx, z + dz));
        }
      }
    }
    if (!quads.empty) extruded.push(quads.build());
    if (extruded.length) {
      const merged = mergeGeometries(extruded.map((g) => g.index ? g.toNonIndexed() : g), false);
      for (const g of extruded) g.dispose();
      if (merged) group.add(new THREE.Mesh(merged, material));
    }
    if (trees.length) group.add(coneTrees(trees));
    return group;
  }

  protected buildPlayer(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 3, 8), new THREE.MeshLambertMaterial({ color: 0xe0533d, flatShading: true }));
    body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshLambertMaterial({ color: 0xf6d0a0, flatShading: true }));
    head.position.y = 1.6;
    g.add(body, head);
    return g;
  }
}

function buildingLevelsFor(chunk: Chunk, index: number): number {
  const i = chunk.building.indexOf(index);
  return i >= 0 ? buildingLevels(chunk, i) : chunk.buildings[index]!.levels ?? 2;
}

/** A footprint crossing chunk edges is in several chunks; only the one holding its centre draws it. */
function ownsBuilding(rings: Point[][]): boolean {
  const outer = rings[0];
  if (!outer?.length) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of outer) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return cx >= 0 && cy >= 0 && cx < CHUNK_CELLS && cy < CHUNK_CELLS;
}

const signedArea = (ring: Point[]) => {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j]!.x * ring[i]!.y - ring[i]!.x * ring[j]!.y;
  return a / 2;
};

/** Extrudes MVT rings (outer rings and their holes, by winding) to the given height. */
function extrude(rings: Point[][], height: number): THREE.BufferGeometry | null {
  const shapes: THREE.Shape[] = [];
  const outerSign = Math.sign(signedArea(rings[0] ?? []));
  for (const ring of rings) {
    if (ring.length < 3) continue;
    // Shape space is x/y with y flipped, so after rotating to stand up, +y maps to +z (south).
    const pts = ring.map((p) => new THREE.Vector2(p.x, -p.y));
    if (Math.sign(signedArea(ring)) === outerSign || !shapes.length) shapes.push(new THREE.Shape(pts));
    else shapes[shapes.length - 1]!.holes.push(new THREE.Path(pts));
  }
  if (!shapes.length) return null;
  try {
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  } catch {
    return null;
  }
}

/** Vertex colours: roof colour on upward faces, wall colour elsewhere. */
function paint(geo: THREE.BufferGeometry, roof: RGB, wall: RGB): void {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) {
    geo.copy(g);
    g.dispose();
  }
  geo.computeVertexNormals();
  const normals = geo.getAttribute("normal");
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const c = normals.getY(i) > 0.5 ? roof : wall;
    colors.set([c[0] / 255, c[1] / 255, c[2] / 255], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.deleteAttribute("uv");
  geo.clearGroups();
}

function coneTrees(trees: { x: number; z: number; h: number }[]): THREE.Object3D {
  const geo = new THREE.ConeGeometry(0.85, 1, 6);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), trees.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  trees.forEach((t, k) => {
    m.makeScale(1, t.h, 1).setPosition(t.x + 0.5, 0.2, t.z + 0.5);
    mesh.setMatrixAt(k, m);
    c.setRGB(0.36 + (t.h % 0.4) * 0.3, 0.62, 0.38, THREE.SRGBColorSpace);
    mesh.setColorAt(k, c);
  });
  return mesh;
}
