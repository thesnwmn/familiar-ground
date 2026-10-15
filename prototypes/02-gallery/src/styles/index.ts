import { EXISTING_STYLES } from "./existing.ts";
import { LAB_STYLES } from "./lab.ts";
import type { StillStyle } from "./types.ts";

export const ALL_STYLES: StillStyle[] = [...LAB_STYLES, ...EXISTING_STYLES];
export const GROUPS = [...new Set(ALL_STYLES.map((s) => s.group))];
