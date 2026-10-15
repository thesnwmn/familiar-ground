import { describe, expect, it } from "vitest";
import { lngLatToTile, tileSizeMeters, tileToLngLat } from "../src/geo.ts";

describe("geo", () => {
  it("round-trips lng/lat through tile coords", () => {
    const p = { lng: -0.1276, lat: 51.5072 };
    const t = lngLatToTile(p, 16);
    const back = tileToLngLat(t.x, t.y, 16);
    expect(back.lng).toBeCloseTo(p.lng, 9);
    expect(back.lat).toBeCloseTo(p.lat, 9);
  });

  it("puts London in the expected z14 tile", () => {
    const t = lngLatToTile({ lng: -0.1276, lat: 51.5072 }, 14);
    expect([Math.floor(t.x), Math.floor(t.y)]).toEqual([8186, 5448]);
  });

  it("shrinks tile ground size with latitude", () => {
    expect(tileSizeMeters(14, 0)).toBeCloseTo(2445.98, 1);
    expect(tileSizeMeters(14, 60)).toBeCloseTo(tileSizeMeters(14, 0) / 2, 6);
  });
});
