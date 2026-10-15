import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

export type Props = Record<string, string | number | boolean>;

export interface Point {
  x: number;
  y: number;
}

/** A decoded map feature in tile-local coordinates (0..extent). */
export interface MapFeature {
  layer: string;
  /** 1 = point, 2 = line, 3 = polygon (MVT geometry types). */
  type: 1 | 2 | 3;
  id?: number;
  props: Props;
  /** Points, line parts, or polygon rings (outer and holes mixed; fill with even-odd). */
  geometry: Point[][];
  extent: number;
}

export function decodeTile(data: Uint8Array): MapFeature[] {
  const tile = new VectorTile(new PbfReader(data));
  const out: MapFeature[] = [];
  for (const [name, layer] of Object.entries(tile.layers)) {
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (f.type === 0) continue;
      out.push({
        layer: name,
        type: f.type,
        id: f.id,
        props: f.properties,
        geometry: f.loadGeometry().map((ring) => ring.map((p) => ({ x: p.x, y: p.y }))),
        extent: f.extent,
      });
    }
  }
  return out;
}
