import { Ground, Structure, type Chunk } from "@familiar-ground/world-core";

/** Base colours shared by the 2D and 3D styles; each style shades them its own way. */
export const GROUND_RGB: Record<Ground, [number, number, number]> = {
  [Ground.GRASS]: [104, 158, 74],
  [Ground.URBAN]: [150, 146, 138],
  [Ground.PAVED]: [168, 164, 156],
  [Ground.PARK]: [92, 170, 82],
  [Ground.FOREST]: [58, 112, 52],
  [Ground.FARMLAND]: [196, 182, 104],
  [Ground.SAND]: [222, 204, 140],
  [Ground.ROCK]: [140, 140, 140],
  [Ground.ICE]: [226, 238, 248],
  [Ground.WETLAND]: [96, 140, 110],
  [Ground.WATER]: [64, 128, 200],
  [Ground.PATH]: [196, 170, 120],
  [Ground.ROAD_MINOR]: [84, 84, 88],
  [Ground.ROAD_MAJOR]: [70, 70, 76],
  [Ground.RAIL]: [110, 96, 86],
  [Ground.RUBBLE]: [128, 112, 98],
};

export const BUILDING_RGB: [number, number, number] = [176, 120, 96];
export const NAMED_BUILDING_RGB: [number, number, number] = [222, 168, 72];
export const WALL_RGB: [number, number, number] = [200, 200, 204];
export const TREE_RGB: [number, number, number] = [44, 110, 50];

export const rgb = ([r, g, b]: [number, number, number], k = 1) =>
  `rgb(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))})`;

/** Whether the building under a cell has a known kind (shop, school…) and so should stand out. */
export function isNamedBuilding(chunk: Chunk, i: number): boolean {
  if (chunk.structure[i] !== Structure.BUILDING) return false;
  const b = chunk.buildings[chunk.building[i]!];
  return !!b && b.kind !== "building";
}

/** Building height in floors: from the map when known, otherwise 1–3, stable per building. */
export function buildingLevels(chunk: Chunk, i: number): number {
  const index = chunk.building[i]!;
  const b = chunk.buildings[index];
  if (b?.levels) return Math.min(b.levels, 40);
  let h = 0;
  for (const c of b?.id ?? String(i)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return 1 + (Math.abs(h) % 3);
}
