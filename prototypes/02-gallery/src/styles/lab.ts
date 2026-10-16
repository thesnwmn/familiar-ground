import { GAME_STYLES } from "./games.ts";
import { PLAN_STYLES } from "./plan.ts";
import { PLAYABLE_STYLES } from "./playable.ts";
import { PRINT_STYLES } from "./print.ts";
import { SENSOR_STYLES } from "./sensors.ts";
import type { StillStyle } from "./types.ts";
import { WORLD_STYLES } from "./worlds.ts";
import { WALL_STYLES } from "./walls.ts";

/** Every style-lab style (not the game's own renderers), so the game can load them without a cycle. */
export const LAB_STYLES: StillStyle[] = [...PLAYABLE_STYLES, ...WALL_STYLES, ...PLAN_STYLES, ...GAME_STYLES, ...WORLD_STYLES, ...PRINT_STYLES, ...SENSOR_STYLES];
