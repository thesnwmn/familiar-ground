import { PMTiles } from "pmtiles";

/** Where map data tiles (vector, MVT) come from. Tiles are read-only input to chunk building. */
export interface TileSource {
  /** Highest zoom the source has data for; higher zooms are over-zoomed from this. */
  readonly maxZoom: number;
  /** Raw (decompressed) MVT bytes, or null when the tile is empty or missing. */
  getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null>;
}

/** Tiles from a `{z}/{x}/{y}` URL template, e.g. OpenFreeMap. */
export class ZxyUrlSource implements TileSource {
  constructor(
    private readonly template: string,
    readonly maxZoom: number,
  ) {}

  async getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
    const url = this.template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
    const res = await fetch(url, { signal });
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new Error(`Tile ${z}/${x}/${y} failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Tiles from a single PMTiles archive (local file server, R2, any static host), via HTTP range requests. */
export class PMTilesSource implements TileSource {
  private readonly archive: PMTiles;
  private constructor(
    archive: PMTiles,
    readonly maxZoom: number,
  ) {
    this.archive = archive;
  }

  static async open(url: string): Promise<PMTilesSource> {
    const archive = new PMTiles(url);
    const header = await archive.getHeader();
    return new PMTilesSource(archive, header.maxZoom);
  }

  async getTile(z: number, x: number, y: number, signal?: AbortSignal): Promise<Uint8Array | null> {
    const res = await this.archive.getZxy(z, x, y, signal);
    return res ? new Uint8Array(res.data) : null;
  }
}

export const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

/** Opens a source from a TileJSON document (OpenFreeMap publishes one per planet build). */
export async function openTileJson(url: string = OPENFREEMAP_TILEJSON): Promise<ZxyUrlSource> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TileJSON ${url} failed: HTTP ${res.status}`);
  const json = (await res.json()) as { tiles?: string[]; maxzoom?: number };
  const template = json.tiles?.[0];
  if (!template) throw new Error(`TileJSON ${url} has no tiles`);
  return new ZxyUrlSource(template, json.maxzoom ?? 14);
}

/** Opens a source from a URL: `.pmtiles` archives directly, anything else as TileJSON. */
export function openSource(url: string = OPENFREEMAP_TILEJSON): Promise<TileSource> {
  return /\.pmtiles(\?|$)/.test(url) ? PMTilesSource.open(url) : openTileJson(url);
}
