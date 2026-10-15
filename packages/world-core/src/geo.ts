/** Web Mercator helpers. Tile coords follow the XYZ (slippy map) convention. */

export const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const MAX_LAT = 85.0511287798066;

export interface LngLat {
  lng: number;
  lat: number;
}

/** Fractional tile coordinates of a lng/lat at zoom z. */
export function lngLatToTile(p: LngLat, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  const latRad = (lat * Math.PI) / 180;
  const x = ((p.lng + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** lng/lat of fractional tile coordinates at zoom z. */
export function tileToLngLat(x: number, y: number, z: number): LngLat {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lng, lat: (latRad * 180) / Math.PI };
}

/** Ground metres covered by one tile side at zoom z and latitude lat. */
export function tileSizeMeters(z: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}
