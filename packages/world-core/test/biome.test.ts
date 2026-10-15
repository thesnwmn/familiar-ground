import { describe, expect, it } from "vitest";
import { Biome, biomeAt, valueNoise } from "../src/biome.ts";

describe("biomes", () => {
  it("are deterministic per seed and position", () => {
    expect(biomeAt(7, 123456, 654321)).toBe(biomeAt(7, 123456, 654321));
  });

  it("form zones: neighbouring cells almost always share a biome", () => {
    let same = 0;
    for (let i = 0; i < 2000; i++) if (biomeAt(1, i * 37, i * 11) === biomeAt(1, i * 37 + 1, i * 11)) same++;
    expect(same / 2000).toBeGreaterThan(0.98);
  });

  it("produces every biome across a wide area, none dominating completely", () => {
    const counts = new Map<number, number>();
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) {
      const b = biomeAt(3, x * 97, y * 97);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    for (const b of Object.values(Biome)) expect(counts.get(b) ?? 0).toBeGreaterThan(120 * 120 * 0.04);
    expect(Math.max(...counts.values())).toBeLessThan(120 * 120 * 0.6);
  });

  it("changes with the seed", () => {
    let differ = 0;
    for (let i = 0; i < 500; i++) if (biomeAt(1, i * 500, i * 300) !== biomeAt(2, i * 500, i * 300)) differ++;
    expect(differ).toBeGreaterThan(100);
  });

  it("value noise stays in [0, 1) and is continuous", () => {
    for (let i = 0; i < 1000; i++) {
      const v = valueNoise(5, 0, i * 0.37, i * 0.21);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(valueNoise(5, 0, i * 0.37 + 0.001, i * 0.21) - v)).toBeLessThan(0.01);
    }
  });
});
