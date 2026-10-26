import { describe, it, expect } from "vitest";
import { heightColor, shapeGrid as gridOf } from "./shapePreview.js";
import { TILE_FT } from "../world/constants.js";

// Zones written with their own pins, gathered into a continent's sketch.
const shapeGrid = (zones, seedKey, options) => gridOf({ zones, pins: zones.flatMap((z) => z.pins), strokes: [] }, seedKey, options);
const square = (x0, z0, x1, z1) => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]];
const zone = (pins) => ({ region: [square(0, 0, 8, 8)], pins, strokes: [] });

// The sample nearest continent tile position (tx, tz).
const sampleAt = (grid, tx, tz) => Math.round((tz * TILE_FT - grid.z0) / grid.stepFt) * grid.nx + Math.round((tx * TILE_FT - grid.x0) / grid.stepFt);
const pixel = (grid, k) => Array.from(grid.rgba.subarray(k * 4, k * 4 + 4));

describe("the heights map", () => {
  it("is null with no zoned land", () => {
    expect(shapeGrid([], "test")).toBeNull();
  });

  it("covers the zoned area with sea around it, clear over the sea", () => {
    const grid = shapeGrid([zone([])], "test");
    expect(grid.x0).toBeLessThan(0);
    expect(grid.x0 + (grid.nx - 1) * grid.stepFt).toBeGreaterThan(8 * TILE_FT);
    expect(grid.heights[0]).toBeLessThan(0);
    expect(pixel(grid, 0)[3]).toBe(0);
    expect(pixel(grid, sampleAt(grid, 4, 4))[3]).toBe(255);
  });

  it("passes near each height pin, inland", () => {
    const pins = [
      { id: "a", kind: "height", at: [3, 3], height: 400 },
      { id: "b", kind: "height", at: [5, 5], height: 100 },
    ];
    const grid = shapeGrid([zone(pins)], "test");
    expect(grid.heights[sampleAt(grid, 3, 3)]).toBeCloseTo(400, -1);
    expect(grid.heights[sampleAt(grid, 5, 5)]).toBeCloseTo(100, -1);
  });

  it("ignores biome pins", () => {
    const height = [{ id: "a", kind: "height", at: [4, 4], height: 300 }];
    const a = shapeGrid([zone(height)], "test");
    const b = shapeGrid([zone([...height, { id: "b", kind: "biome", at: [4, 4], biome: "rocky" }])], "test");
    expect(b.heights).toEqual(a.heights);
  });

  it("covers just the bounds asked for, at the samples asked for", () => {
    const grid = shapeGrid([zone([])], "test", { bounds: [TILE_FT, TILE_FT, 3 * TILE_FT, 2 * TILE_FT], side: 64 });
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
    const grid = shapeGrid([zone(pins)], "test", { biomes: true });
    const [fr, fg] = pixel(grid, sampleAt(grid, 2, 4));
    const [rr, rg, rb] = pixel(grid, sampleAt(grid, 6, 4));
    expect(fg).toBeGreaterThan(fr * 2);
    expect(Math.max(rr, rg, rb) - Math.min(rr, rg, rb)).toBeLessThan(5);
  });

  it("roughens rocky ground", () => {
    const flat = shapeGrid([zone([])], "test");
    const rocky = shapeGrid([zone([{ id: "b", kind: "biome", at: [4, 4], biome: "rocky" }])], "test", { biomes: true });
    const k = sampleAt(flat, 4, 4);
    expect(Math.abs(rocky.heights[k] - flat.heights[k])).toBeGreaterThan(1);
  });
});
