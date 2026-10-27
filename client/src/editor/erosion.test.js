import { describe, expect, it } from "vitest";
import { LAND_FT, LandGrid } from "../world/landGrid.js";
import { rain, slump } from "./erosion.js";

const apply = (grid, changes) => changes.forEach(([gx, gz, h]) => grid.set(gx, gz, h));
const total = (grid, r) => {
  let sum = 0;
  for (let gz = -r; gz <= r; gz++) for (let gx = -r; gx <= r; gx++) sum += grid.point(gx, gz);
  return sum;
};
// A seeded stream of numbers from 0 to 1.
const seeded = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

describe("erosion", () => {
  it("slumps a cliff toward resting, keeping the ground it moves", () => {
    const grid = new LandGrid();
    for (let gz = -30; gz <= 30; gz++) for (let gx = -30; gx <= 30; gx++) grid.set(gx, gz, gx < 0 ? 300 : 20);
    const before = total(grid, 30);
    apply(grid, slump(grid, { x: 0, z: 0, radius: 20 * LAND_FT }, { talus: 35, passes: 200 }));
    expect(total(grid, 30)).toBeCloseTo(before, 0);
    // Near the middle the step is gone, and the ground's no steeper than about 35°.
    const steepest = Math.max(...[-8, -4, -1, 0, 3, 7].map((gx) => Math.abs(grid.point(gx, 0) - grid.point(gx + 1, 0))));
    expect(steepest).toBeLessThan(Math.tan((40 * Math.PI) / 180) * LAND_FT);
  });

  it("cuts into a slope with rain and drops the ground lower down, keeping it", () => {
    const grid = new LandGrid();
    for (let gz = -40; gz <= 40; gz++) for (let gx = -40; gx <= 40; gx++) grid.set(gx, gz, 400 - gx * 6 + 10 * Math.sin(gz / 3));
    const before = total(grid, 40);
    apply(grid, rain(grid, { x: 0, z: 0, radius: 30 * LAND_FT }, { drops: 4000, random: seeded(7) }));
    expect(total(grid, 40)).toBeCloseTo(before, -1);
    let [worn, built] = [0, 0];
    for (let gz = -40; gz <= 40; gz++) {
      for (let gx = -40; gx <= 40; gx++) {
        const d = grid.point(gx, gz) - (400 - gx * 6 + 10 * Math.sin(gz / 3));
        if (d < -0.5) worn++;
        if (d > 0.5) built++;
      }
    }
    expect(worn).toBeGreaterThan(50);
    expect(built).toBeGreaterThan(10);
  });

  it("leaves the sea floor alone where it's flat", () => {
    const grid = new LandGrid();
    expect(rain(grid, { x: 0, z: 0, radius: 300 }, { drops: 500, random: seeded(1) })).toEqual([]);
    expect(slump(grid, { x: 0, z: 0, radius: 300 })).toEqual([]);
  });
});
