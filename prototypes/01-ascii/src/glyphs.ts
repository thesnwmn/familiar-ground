import { Ground, Structure } from "@familiar-ground/world-core";

export type Glyph = [ch: string, fg: string, bg: string];

export const GROUND_GLYPHS: Record<Ground, Glyph> = {
  [Ground.GRASS]: [".", "#4f7a3a", "#16220f"],
  [Ground.URBAN]: [".", "#5c5c5c", "#1a1a1a"],
  [Ground.PAVED]: ["·", "#777", "#262626"],
  [Ground.PARK]: [",", "#6fae4f", "#1a2e14"],
  [Ground.FOREST]: [".", "#3f6b32", "#11200d"],
  [Ground.FARMLAND]: ['"', "#a59b4a", "#26240f"],
  [Ground.SAND]: [".", "#d8c27a", "#3a321a"],
  [Ground.ROCK]: [":", "#9a9a9a", "#2a2a2a"],
  [Ground.ICE]: [".", "#e0f0ff", "#4a5a6a"],
  [Ground.WETLAND]: ['"', "#5a8a6a", "#14261d"],
  [Ground.WATER]: ["~", "#5fa8ff", "#0c2744"],
  [Ground.PATH]: ["·", "#c2a678", "#2e2618"],
  [Ground.ROAD_MINOR]: [" ", "#888", "#363636"],
  [Ground.ROAD_MAJOR]: [" ", "#aaa", "#474747"],
  [Ground.RAIL]: ["≡", "#9a7a5a", "#241f1b"],
  [Ground.RUBBLE]: ["%", "#8a7a6a", "#2a2420"],
};

export const STRUCTURE_FG: Partial<Record<Structure, [ch: string, fg: string, bg?: string]>> = {
  [Structure.BUILDING]: ["#", "#a8957a", "#33291f"],
  [Structure.WALL]: ["#", "#e0e0e0", "#555"],
  [Structure.TREE]: ["♣", "#4caf50"],
};

/** Buildings that have a known kind (shop, school…) stand out. */
export const NAMED_BUILDING: Glyph = ["#", "#ffd27a", "#4a3a20"];
export const POI_GLYPH: [string, string] = ["*", "#ffd54f"];
export const PLAYER_GLYPH: [string, string] = ["@", "#ffffff"];
export const UNLOADED: Glyph = [" ", "#000", "#000"];
