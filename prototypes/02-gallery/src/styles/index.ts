import { EXISTING_STYLES } from "./existing.ts";
import { GAME_STYLES } from "./games.ts";
import { PLAN_STYLES } from "./plan.ts";
import { PRINT_STYLES } from "./print.ts";
import { SENSOR_STYLES } from "./sensors.ts";
import type { StillStyle } from "./types.ts";
import { WORLD_STYLES } from "./worlds.ts";

export const ALL_STYLES: StillStyle[] = [...PLAN_STYLES, ...GAME_STYLES, ...WORLD_STYLES, ...PRINT_STYLES, ...SENSOR_STYLES, ...EXISTING_STYLES];
export const GROUPS = [...new Set(ALL_STYLES.map((s) => s.group))];
