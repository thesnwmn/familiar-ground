import { describe, expect, it } from "vitest";
import { fillPolygon, strokeLine } from "../src/raster.ts";

const pts = (xy: [number, number][]) => xy.map(([x, y]) => ({ x, y }));

function collect(fn: (set: (x: number, y: number) => void) => void): Set<string> {
  const s = new Set<string>();
  fn((x, y) => s.add(`${x},${y}`));
  return s;
}

describe("fillPolygon", () => {
  it("fills cells whose centres are inside", () => {
    const cells = collect((set) => fillPolygon([pts([[2, 2], [6, 2], [6, 5], [2, 5]])], 10, set));
    expect(cells.size).toBe(4 * 3);
    expect(cells.has("2,2")).toBe(true);
    expect(cells.has("5,4")).toBe(true);
    expect(cells.has("6,4")).toBe(false);
  });

  it("leaves holes empty (even-odd)", () => {
    const outer = pts([[0, 0], [10, 0], [10, 10], [0, 10]]);
    const hole = pts([[3, 3], [7, 3], [7, 7], [3, 7]]);
    const cells = collect((set) => fillPolygon([outer, hole], 10, set));
    expect(cells.size).toBe(100 - 16);
    expect(cells.has("5,5")).toBe(false);
  });

  it("clips to the grid", () => {
    const cells = collect((set) => fillPolygon([pts([[-5, -5], [20, -5], [20, 20], [-5, 20]])], 8, set));
    expect(cells.size).toBe(64);
  });
});

describe("strokeLine", () => {
  it("draws a line of the requested width", () => {
    const cells = collect((set) => strokeLine(pts([[0, 5], [10, 5]]), 2, 10, set));
    for (let x = 0; x < 10; x++) {
      expect(cells.has(`${x},4`)).toBe(true);
      expect(cells.has(`${x},5`)).toBe(true);
      expect(cells.has(`${x},3`)).toBe(false);
    }
  });
});
