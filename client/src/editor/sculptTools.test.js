import { describe, it, expect } from "vitest";
import { brush, ramp, stamp } from "./sculptTools.js";
import { LAND_FT, LandGrid } from "../world/landGrid.js";

// Flat land at `h` ft over points -20 to 20 each way.
function flat(h = 10) {
  const grid = new LandGrid();
  for (let gz = -20; gz <= 20; gz++) for (let gx = -20; gx <= 20; gx++) grid.set(gx, gz, h);
  return grid;
}
const apply = (grid, changes) => changes.forEach(([gx, gz, h]) => grid.set(gx, gz, h));
const settings = { radius: 8 * LAND_FT, strength: 60, target: 0, terrace: 50 };

describe("sculpting brushes", () => {
  it("raises most at the middle, and nothing past the edge", () => {
    const grid = flat();
    apply(grid, brush(grid, { ...settings, tool: "raise" }, [0, 0], 0.5));
    expect(grid.point(0, 0)).toBeCloseTo(40, 5);
    expect(grid.point(4, 0)).toBeGreaterThan(10);
    expect(grid.point(4, 0)).toBeLessThan(40);
    expect(grid.point(9, 0)).toBe(10);
  });

  it("pulls toward a typed height, the stroke's first height, or the nearest terrace", () => {
    const grid = flat(80);
    for (let k = 0; k < 40; k++) apply(grid, brush(grid, { ...settings, tool: "set", target: 30 }, [0, 0], 0.1));
    expect(grid.point(0, 0)).toBeCloseTo(30, 0);
    const steps = flat(80);
    for (let k = 0; k < 40; k++) apply(steps, brush(steps, { ...settings, tool: "terrace" }, [0, 0], 0.1));
    expect(steps.point(0, 0)).toBeCloseTo(100, 0);
  });
});

describe("stamps and ramps", () => {
  it("raises a mesa flat-topped, never cutting higher ground with max", () => {
    const grid = flat();
    grid.set(0, 0, 500);
    apply(grid, stamp(grid, { shape: "mesa", blend: "max", height: 100, radius: 10 * LAND_FT }, [LAND_FT, 0]));
    expect(grid.point(0, 0)).toBe(500);
    expect(grid.point(2, 0)).toBeGreaterThan(grid.point(9, 0));
    expect(grid.point(3, 1)).toBeCloseTo(grid.point(2, 1), -1);
  });

  it("lays a ramp evenly from one end's height to the other's", () => {
    const grid = flat();
    apply(grid, ramp(grid, [-10 * LAND_FT, 0, 0], [10 * LAND_FT, 100, 0], 3 * LAND_FT));
    expect(grid.point(-10, 0)).toBeCloseTo(0, 5);
    expect(grid.point(0, 0)).toBeCloseTo(50, 5);
    expect(grid.point(10, 0)).toBeCloseTo(100, 5);
    expect(grid.point(0, 5)).toBe(10);
  });
});
