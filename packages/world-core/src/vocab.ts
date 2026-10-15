/**
 * The game's small, style-agnostic vocabulary. Renderers and themes only ever see
 * these values, never raw map tags.
 */

export const Ground = {
  GRASS: 0,
  URBAN: 1,
  PAVED: 2,
  PARK: 3,
  FOREST: 4,
  FARMLAND: 5,
  SAND: 6,
  ROCK: 7,
  ICE: 8,
  WETLAND: 9,
  WATER: 10,
  PATH: 11,
  ROAD_MINOR: 12,
  ROAD_MAJOR: 13,
  RAIL: 14,
  RUBBLE: 15,
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];
export const GROUND_NAMES = Object.fromEntries(Object.entries(Ground).map(([k, v]) => [v, k])) as Record<Ground, string>;

export const Structure = {
  NONE: 0,
  BUILDING: 1,
  WALL: 2,
  TREE: 3,
} as const;
export type Structure = (typeof Structure)[keyof typeof Structure];
export const STRUCTURE_NAMES = Object.fromEntries(Object.entries(Structure).map(([k, v]) => [v, k])) as Record<
  Structure,
  string
>;

export function isWalkable(ground: number, structure: number): boolean {
  return structure === Structure.NONE && ground !== Ground.WATER;
}
