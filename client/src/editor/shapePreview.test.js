import { describe, it, expect } from "vitest";
import { heightColor, shapeGrid as gridOf } from "./shapePreview.js";
import { TILE_FT } from "../world/constants.js";
import { LAND_FT, LandGrid, PER_TILE } from "../world/landGrid.js";

// Land over tiles 0 to 8 each way, `height(x, z)` ft (in tile units), with sea floor around it.
function landOf(height = () => 20) {
  const land = new LandGrid();
  for (let gz = 0; gz <= 8 * PER_TILE; gz++) for (let gx = 0; gx <= 8 * PER_TILE; gx++) land.set(gx, gz, height((gx * LAND_FT) / TILE_FT, (gz * LAND_FT) / TILE_FT));
  return land.data;
}
const shapeGrid = (land, pins, options) => gridOf({ land, pins }, "test", options);

// The sample nearest continent tile position (tx, tz).
const sampleAt = (grid, tx, tz) => Math.round((tz * TILE_FT - grid.z0) / grid.stepFt) * grid.nx + Math.round((tx * TILE_FT - grid.x0) / grid.stepFt);
const pixel = (grid, k) => Array.from(grid.rgba.subarray(k * 4, k * 4 + 4));

describe("the heights map", () => {
  it("is null with no land", () => {
    expect(shapeGrid(new LandGrid().data, [])).toBeNull();
  });

  it("covers the land with sea around it, clear over the sea", () => {
    const grid = shapeGrid(landOf(), []);
    expect(grid.x0).toBeLessThan(0);
    expect(grid.x0 + (grid.nx - 1) * grid.stepFt).toBeGreaterThan(8 * TILE_FT);
    expect(grid.heights[0]).toBeLessThan(0);
    expect(pixel(grid, 0)[3]).toBe(0);
    expect(pixel(grid, sampleAt(grid, 4, 4))[3]).toBe(255);
  });

  it("follows the land grid", () => {
    const grid = shapeGrid(landOf((x) => x * 50), []);
    expect(grid.heights[sampleAt(grid, 3, 3)]).toBeCloseTo(150, -1);
    expect(grid.heights[sampleAt(grid, 6, 5)]).toBeCloseTo(300, -1);
  });

  it("ignores biome pins", () => {
    const a = shapeGrid(landOf(), []);
    const b = shapeGrid(landOf(), [{ id: "b", kind: "biome", at: [4, 4], biome: "rocky" }]);
    expect(b.heights).toEqual(a.heights);
  });

  it("covers just the bounds asked for, at the samples asked for", () => {
    const grid = shapeGrid(landOf(), [], { bounds: [TILE_FT, TILE_FT, 3 * TILE_FT, 2 * TILE_FT], side: 64 });
    expect([grid.x0, grid.z0, grid.stepFt, grid.nx, grid.nz]).toEqual([TILE_FT, TILE_FT, 16, 65, 33]);
  });

  it("runs from cool colors low to warm ones high", () => {
    expect(heightColor(0)[2]).toBeGreaterThan(heightColor(0)[0]);
    expect(heightColor(3000)[0]).toBeGreaterThan(heightColor(3000)[2]);
  });
});

describe("the biomes map", () => {
  const pins = [
    { id: "a", kind: "biome", at: [2, 4], biome: "forest" },
    { id: "b", kind: "biome", at: [6, 4], biome: "rocky" },
  ];

  it("colors each biome's ground by its biome", () => {
    const grid = shapeGrid(landOf(), pins, { biomes: true });
    const [fr, fg] = pixel(grid, sampleAt(grid, 2, 4));
    const [rr, rg, rb] = pixel(grid, sampleAt(grid, 6, 4));
    expect(fg).toBeGreaterThan(fr * 2);
    expect(Math.max(rr, rg, rb) - Math.min(rr, rg, rb)).toBeLessThan(5);
  });

  it("roughens rocky ground", () => {
    const flat = shapeGrid(landOf(), []);
    const rocky = shapeGrid(landOf(), [{ id: "b", kind: "biome", at: [4, 4], biome: "rocky" }], { biomes: true });
    const k = sampleAt(flat, 4, 4);
    expect(Math.abs(rocky.heights[k] - flat.heights[k])).toBeGreaterThan(1);
  });
});
