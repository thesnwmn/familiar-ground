import { CHUNK_CELLS, Ground, Structure, hashInts, type Chunk, type Point, type World } from "@familiar-ground/world-core";

/** A building with its footprint in global cell coordinates. */
export interface SceneBuilding {
  id: string;
  kind: string;
  name?: string;
  /** Floors: from the map when known, otherwise 1–4 by hash. */
  levels: number;
  known: boolean;
  rings: Point[][];
  cx: number;
  cy: number;
  /** Stable [0, 1) per building, for colour picks and damage. */
  r: number;
}

export interface SceneRoad {
  cls: string;
  ground: Ground;
  /** Width in cells. */
  width: number;
  points: Point[];
}

export interface ScenePoi {
  x: number;
  y: number;
  name?: string;
  cls: string;
  inBuilding: boolean;
}

/**
 * One still image's view of the world: what's around a centre point at a given scale, in global
 * cell coordinates, with helpers to map to screen pixels. Every style draws from this.
 */
export class Scene {
  readonly gx0: number;
  readonly gy0: number;
  readonly gx1: number;
  readonly gy1: number;
  readonly buildings: SceneBuilding[] = [];
  readonly roads: SceneRoad[] = [];
  readonly pois: ScenePoi[] = [];
  private lastChunk: Chunk | undefined;
  private lastCx = NaN;
  private lastCy = NaN;

  constructor(
    readonly world: World,
    readonly seed: number,
    /** Centre in global cells. */
    readonly cx: number,
    readonly cy: number,
    /** Screen pixels per cell. */
    readonly scale: number,
    readonly W: number,
    readonly H: number,
  ) {
    const halfW = W / 2 / scale;
    const halfH = H / 2 / scale;
    this.gx0 = Math.floor(cx - halfW) - 1;
    this.gy0 = Math.floor(cy - halfH) - 1;
    this.gx1 = Math.ceil(cx + halfW) + 1;
    this.gy1 = Math.ceil(cy + halfH) + 1;
    this.collect();
  }

  get cols(): number {
    return this.gx1 - this.gx0 + 1;
  }
  get rows(): number {
    return this.gy1 - this.gy0 + 1;
  }

  /** Global cell → screen pixel. */
  sx(gx: number): number {
    return (gx - this.cx) * this.scale + this.W / 2;
  }
  sy(gy: number): number {
    return (gy - this.cy) * this.scale + this.H / 2;
  }

  /** Cell lookup (fast for scans: remembers the last chunk). */
  at(gx: number, gy: number): { chunk: Chunk; i: number } | null {
    const cx = Math.floor(gx / CHUNK_CELLS);
    const cy = Math.floor(gy / CHUNK_CELLS);
    if (cx !== this.lastCx || cy !== this.lastCy) {
      this.lastCx = cx;
      this.lastCy = cy;
      this.lastChunk = this.world.getChunk(cx, cy);
    }
    const c = this.lastChunk;
    if (!c) return null;
    return { chunk: c, i: (gy - cy * CHUNK_CELLS) * CHUNK_CELLS + (gx - cx * CHUNK_CELLS) };
  }

  ground(gx: number, gy: number): number {
    const c = this.at(gx, gy);
    return c ? c.chunk.ground[c.i]! : -1;
  }

  structure(gx: number, gy: number): number {
    const c = this.at(gx, gy);
    return c ? c.chunk.structure[c.i]! : -1;
  }

  /** Floors of the building on a cell (0 if none). */
  levelsAt(gx: number, gy: number): number {
    const c = this.at(gx, gy);
    if (!c || c.chunk.structure[c.i] !== Structure.BUILDING) return 0;
    const b = c.chunk.buildings[c.chunk.building[c.i]!];
    return b?.levels ?? 1 + (hashInts(c.chunk.building[c.i]!, c.chunk.cx, c.chunk.cy) % 3);
  }

  /** Stable per-cell [0, 1). */
  rand(gx: number, gy: number, salt = 0): number {
    return hashInts(gx, gy, salt, this.seed) / 4294967296;
  }

  /** Calls fn for every cell in view (row by row). */
  forCells(fn: (gx: number, gy: number, ground: number, structure: number) => void): void {
    for (let gy = this.gy0; gy <= this.gy1; gy++) {
      for (let gx = this.gx0; gx <= this.gx1; gx++) {
        const c = this.at(gx, gy);
        if (!c) continue;
        fn(gx, gy, c.chunk.ground[c.i]!, c.chunk.structure[c.i]!);
      }
    }
  }

  private collect(): void {
    const margin = 40;
    const seenB = new Set<string>();
    const seenR = new Set<string>();
    for (const chunk of this.world.loaded()) {
      const ox = chunk.cx * CHUNK_CELLS;
      const oy = chunk.cy * CHUNK_CELLS;
      if (ox > this.gx1 + margin || oy > this.gy1 + margin || ox + CHUNK_CELLS < this.gx0 - margin || oy + CHUNK_CELLS < this.gy0 - margin) continue;
      for (const b of chunk.buildings) {
        const outer = b.rings[0];
        if (!outer?.length) continue;
        const key = b.id.startsWith("osm:") ? b.id : `${b.id}`;
        const sig = `${key}:${Math.round(outer[0]!.x + ox)}:${Math.round(outer[0]!.y + oy)}`;
        if (seenB.has(b.id.startsWith("osm:") ? key : sig)) continue;
        seenB.add(b.id.startsWith("osm:") ? key : sig);
        const rings = b.rings.map((r) => r.map((p) => ({ x: p.x + ox, y: p.y + oy })));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of rings[0]!) (minX = Math.min(minX, p.x)), (minY = Math.min(minY, p.y)), (maxX = Math.max(maxX, p.x)), (maxY = Math.max(maxY, p.y));
        if (maxX < this.gx0 - 4 || maxY < this.gy0 - 4 || minX > this.gx1 + 4 || minY > this.gy1 + 4) continue;
        let h = 0;
        for (const ch of sig) h = (h * 31 + ch.charCodeAt(0)) | 0;
        const r = (Math.abs(h) % 10007) / 10007;
        this.buildings.push({
          id: b.id,
          kind: b.kind,
          name: b.name,
          levels: b.levels ?? 1 + Math.floor(r * 3.99),
          known: b.levels !== undefined,
          rings,
          cx: (minX + maxX) / 2,
          cy: (minY + maxY) / 2,
          r,
        });
      }
      for (const road of chunk.roads) {
        const pts = road.points.map((p) => ({ x: p.x + ox, y: p.y + oy }));
        const a = pts[0]!;
        const z = pts[pts.length - 1]!;
        const sig = `${road.cls}:${Math.round(a.x)}:${Math.round(a.y)}:${Math.round(z.x)}:${Math.round(z.y)}:${pts.length}`;
        if (seenR.has(sig)) continue;
        seenR.add(sig);
        this.roads.push({ cls: road.cls, ground: road.ground, width: road.width, points: pts });
      }
      for (const p of chunk.pois) {
        const x = p.x + ox;
        const y = p.y + oy;
        if (x < this.gx0 || y < this.gy0 || x > this.gx1 || y > this.gy1) continue;
        this.pois.push({ x, y, name: p.name, cls: p.subclass ?? p.cls, inBuilding: chunk.building[p.y * CHUNK_CELLS + p.x]! >= 0 });
      }
    }
    // Wider roads drawn last looks best in most styles.
    this.roads.sort((a, b) => a.width - b.width);
  }
}

export const isRoadGround = (g: number) => g === Ground.ROAD_MAJOR || g === Ground.ROAD_MINOR;
export const isGreen = (g: number) => g === Ground.GRASS || g === Ground.PARK || g === Ground.FOREST || g === Ground.WETLAND;
