import type { MapFeature } from "./features.ts";
import { Ground } from "./vocab.ts";

/**
 * How a map feature becomes part of the game world. Drawn in ascending `order`
 * (painter's algorithm), so later passes overwrite earlier ones.
 */
export type Paint =
  | { kind: "area"; ground: Ground; order: number }
  | { kind: "line"; ground: Ground; widthM: number; order: number }
  | { kind: "building"; order: number }
  | { kind: "poi" };

const ORDER = { landuse: 10, landcover: 20, park: 25, water: 30, waterway: 35, aeroway: 40, roadArea: 45, road: 50, building: 90 };

const LANDUSE: Record<string, Ground> = {
  residential: Ground.URBAN, commercial: Ground.URBAN, industrial: Ground.URBAN, retail: Ground.URBAN,
  garages: Ground.PAVED, railway: Ground.URBAN, military: Ground.URBAN, school: Ground.URBAN,
  university: Ground.URBAN, college: Ground.URBAN, kindergarten: Ground.URBAN, hospital: Ground.URBAN,
  library: Ground.URBAN, bus_station: Ground.PAVED, stadium: Ground.PAVED, quarter: Ground.URBAN,
  neighbourhood: Ground.URBAN, suburb: Ground.URBAN,
  pitch: Ground.PARK, playground: Ground.PARK, track: Ground.SAND, cemetery: Ground.PARK,
  theme_park: Ground.PARK, zoo: Ground.PARK, dam: Ground.ROCK,
};

const LANDCOVER: Record<string, Ground> = {
  wood: Ground.FOREST, forest: Ground.FOREST, farmland: Ground.FARMLAND, grass: Ground.GRASS,
  sand: Ground.SAND, rock: Ground.ROCK, ice: Ground.ICE, wetland: Ground.WETLAND,
};
const PARKISH = new Set(["park", "garden", "recreation_ground", "village_green", "golf_course", "playground", "pitch"]);

/** Road class → [ground, width in metres, draw order offset]. Wider roads draw last. */
const ROADS: Record<string, [Ground, number, number]> = {
  motorway: [Ground.ROAD_MAJOR, 16, 9], trunk: [Ground.ROAD_MAJOR, 14, 8], primary: [Ground.ROAD_MAJOR, 12, 7],
  secondary: [Ground.ROAD_MAJOR, 10, 6], tertiary: [Ground.ROAD_MINOR, 9, 5], minor: [Ground.ROAD_MINOR, 7, 4],
  busway: [Ground.ROAD_MINOR, 7, 4], raceway: [Ground.ROAD_MINOR, 10, 4], service: [Ground.ROAD_MINOR, 4, 3],
  track: [Ground.PATH, 3, 2], path: [Ground.PATH, 2, 1], pier: [Ground.PAVED, 4, 1],
  rail: [Ground.RAIL, 3, 0], transit: [Ground.RAIL, 3, 0],
};

const WATERWAYS: Record<string, number> = { river: 12, canal: 8, stream: 2, drain: 1.5, ditch: 1.5 };

/**
 * Classifier for the OpenMapTiles schema (used by OpenFreeMap). Another schema
 * (e.g. Protomaps, or our own Planetiler profile) gets its own classifier with the same output.
 */
export function classifyOpenMapTiles(f: MapFeature): Paint | null {
  const cls = String(f.props.class ?? "");
  switch (f.layer) {
    case "landuse": {
      const g = LANDUSE[cls];
      return f.type === 3 && g !== undefined ? { kind: "area", ground: g, order: ORDER.landuse } : null;
    }
    case "landcover": {
      if (f.type !== 3) return null;
      if (PARKISH.has(String(f.props.subclass ?? ""))) return { kind: "area", ground: Ground.PARK, order: ORDER.landcover };
      const g = LANDCOVER[cls];
      return g !== undefined ? { kind: "area", ground: g, order: ORDER.landcover } : null;
    }
    case "park":
      // national parks and nature reserves are huge; only small parks change the ground.
      return null;
    case "water":
      return f.type === 3 ? { kind: "area", ground: Ground.WATER, order: ORDER.water } : null;
    case "waterway": {
      if (f.type !== 2 || f.props.brunnel === "tunnel") return null;
      return { kind: "line", ground: Ground.WATER, widthM: WATERWAYS[cls] ?? 1.5, order: ORDER.waterway };
    }
    case "aeroway":
      if (f.type === 3) return { kind: "area", ground: Ground.PAVED, order: ORDER.aeroway };
      if (f.type === 2) return { kind: "line", ground: Ground.PAVED, widthM: cls === "runway" ? 45 : 20, order: ORDER.aeroway };
      return null;
    case "transportation": {
      if (f.props.brunnel === "tunnel" || cls === "ferry") return null;
      const road = ROADS[cls];
      if (!road) return null;
      const [ground, widthM, rank] = road;
      if (f.type === 3) return { kind: "area", ground: ground === Ground.PATH ? Ground.PAVED : ground, order: ORDER.roadArea };
      return f.type === 2 ? { kind: "line", ground, widthM, order: ORDER.road + rank } : null;
    }
    case "building":
      return f.type === 3 && f.props.hide_3d !== true ? { kind: "building", order: ORDER.building } : null;
    case "poi":
      return f.type === 1 ? { kind: "poi" } : null;
    default:
      return null;
  }
}

export type Classifier = (f: MapFeature) => Paint | null;
