import { Structure, type Chunk } from "@familiar-ground/world-core";
import * as THREE from "three";
import { NAMED_BUILDING_RGB, WALL_RGB, buildingLevels } from "../../palette.ts";
import { cellNoise } from "../sample.ts";
import { QuadBuilder, ThreeRenderer, cellHeights, groundPlane, linearColor, type Zoom3D } from "./base.ts";

type RGB = [number, number, number];
const WALLS: RGB[] = [
  [214, 196, 170],
  [190, 120, 96],
  [200, 200, 206],
  [168, 150, 130],
  [226, 214, 190],
];
const ROOFS: RGB[] = [
  [150, 74, 58],
  [96, 100, 118],
  [120, 92, 70],
  [140, 140, 146],
];

/**
 * Blocky 3D: every cell is a voxel column. Buildings rise in visible storeys, trees are cubes,
 * and breaking a building removes its columns. The ground is a crisp, unfiltered pixel texture.
 */
export class VoxelRenderer extends ThreeRenderer {
  readonly zoomLevels: Zoom3D[] = [
    { dist: 9, speed: 0.45 },
    { dist: 14, speed: 0.6 },
    { dist: 22, speed: 1 },
    { dist: 36, speed: 1 },
    { dist: 60, speed: 0.85 },
    { dist: 100, speed: 0.7 },
    { dist: 160, speed: 0.55 },
  ];
  readonly defaultZoom = 2;
  protected readonly pitchDeg = 58;
  protected readonly antialias = false;
  protected readonly sky = 0x9fc6e6;

  protected buildChunk(chunk: Chunk): THREE.Object3D {
    const group = new THREE.Group();
    group.add(groundPlane(chunk, { smooth: false, jitter: 0.14 }));

    const n = chunk.size;
    const heights = cellHeights(chunk, (i) => buildingLevels(chunk, i));
    const perFloor = 3 / chunk.cellSizeM;
    const hAt = (x: number, z: number) => (x < 0 || z < 0 || x >= n || z >= n ? 0 : heights[z * n + x]!);
    const quads = new QuadBuilder();
    const trees: { x: number; z: number; h: number }[] = [];

    for (let z = 0; z < n; z++) {
      for (let x = 0; x < n; x++) {
        const i = z * n + x;
        const s = chunk.structure[i];
        if (s === Structure.TREE) {
          trees.push({ x, z, h: 1.6 + cellNoise(chunk.cx * n + x, chunk.cy * n + z, 4) * 1.6 });
          continue;
        }
        const h = heights[i]!;
        if (h <= 0) continue;
        const jitter = 0.94 + cellNoise(chunk.cx * n + x, chunk.cy * n + z, 2) * 0.12;
        let top: RGB;
        let side: RGB;
        if (s === Structure.WALL) {
          top = WALL_RGB;
          side = [WALL_RGB[0] * 0.85, WALL_RGB[1] * 0.85, WALL_RGB[2] * 0.85];
        } else {
          const b = chunk.buildings[chunk.building[i]!];
          let hash = 0;
          for (const c of b?.id ?? "") hash = (hash * 31 + c.charCodeAt(0)) | 0;
          const named = !!b && b.kind !== "building";
          top = named ? NAMED_BUILDING_RGB : ROOFS[Math.abs(hash) % ROOFS.length]!;
          side = named ? [236, 220, 180] : WALLS[Math.abs(hash >> 3) % WALLS.length]!;
        }
        top = linearColor([top[0] * jitter, top[1] * jitter, top[2] * jitter]);
        side = linearColor(side);
        quads.column(x, z, h, 0, top, side, (dx, dz) => hAt(x + dx, z + dz), s === Structure.BUILDING ? perFloor : 0);
      }
    }
    if (!quads.empty) {
      group.add(new THREE.Mesh(quads.build(), new THREE.MeshLambertMaterial({ vertexColors: true })));
    }
    if (trees.length) group.add(...treeMeshes(trees));
    return group;
  }

  protected buildPlayer(): THREE.Object3D {
    const g = new THREE.Group();
    const box = (w: number, h: number, d: number, y: number, color: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      m.position.y = y;
      g.add(m);
    };
    box(0.5, 0.7, 0.35, 0.35, 0x2b3a67);
    box(0.7, 0.8, 0.45, 1.1, 0xd63a3a);
    box(0.5, 0.5, 0.5, 1.75, 0xf1c27d);
    box(0.52, 0.18, 0.52, 2.05, 0x4a2c1a);
    return g;
  }
}

function treeMeshes(trees: { x: number; z: number; h: number }[]): THREE.Object3D[] {
  const trunk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 1, 0.35), new THREE.MeshLambertMaterial({ color: 0x5c4028 }), trees.length);
  const leaves = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), trees.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  trees.forEach((t, k) => {
    m.makeScale(1, 1.2, 1).setPosition(t.x + 0.5, 0.6, t.z + 0.5);
    trunk.setMatrixAt(k, m);
    m.makeScale(1.3, t.h, 1.3).setPosition(t.x + 0.5, 1.1 + t.h / 2, t.z + 0.5);
    leaves.setMatrixAt(k, m);
    c.setRGB(0.12 + t.h * 0.02, 0.38 + (t.h % 0.5) * 0.3, 0.12, THREE.SRGBColorSpace);
    leaves.setColorAt(k, c);
  });
  return [trunk, leaves];
}
