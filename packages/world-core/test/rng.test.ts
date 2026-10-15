import { describe, expect, it } from "vitest";
import { hash32, rngFor } from "../src/rng.ts";

describe("rng", () => {
  it("is deterministic for the same keys", () => {
    const a = rngFor(42, "trees", 10, 20);
    const b = rngFor(42, "trees", 10, 20);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it("differs for different keys", () => {
    expect(hash32(42, "trees", 10, 20)).not.toBe(hash32(42, "trees", 10, 21));
    expect(hash32(1, 23)).not.toBe(hash32(12, 3));
  });

  it("produces values in [0, 1)", () => {
    const r = rngFor("x");
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
