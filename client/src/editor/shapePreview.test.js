import { describe, it, expect } from "vitest";
import { gridHeight, previewMesh, shapeGrid } from "./shapePreview.js";
import { TILE_FT } from "../world/constants.js";

const square = (x0, z0, x1, z1) => [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]];
const zone = (pins) => ({ region: [square(0, 0, 8, 8)], pins, strokes: [] });

describe("shapeGrid", () => {
  it("is null with no zoned land", () => {
    expect(shapeGrid([], "test")).toBeNull();
  });

  it("covers the zoned area with sea around it", () => {
    const grid = shapeGrid([zone([])], "test");
    expect(grid.x0).toBeLessThan(0);
    expect(grid.x0 + (grid.nx - 1) * grid.stepFt).toBeGreaterThan(8 * TILE_FT);
    expect(grid.heights.length).toBe(grid.nx * grid.nz);
    expect(gridHeight(grid, grid.x0, grid.z0)).toBeLessThan(0);
  });

  it("passes near each height pin, inland", () => {
    const pins = [
      { id: "a", kind: "height", at: [3, 3], height: 400 },
      { id: "b", kind: "height", at: [5, 5], height: 100 },
    ];
    const grid = shapeGrid([zone(pins)], "test");
    expect(gridHeight(grid, 3 * TILE_FT, 3 * TILE_FT)).toBeCloseTo(400, -1);
    expect(gridHeight(grid, 5 * TILE_FT, 5 * TILE_FT)).toBeCloseTo(100, -1);
  });

  it("ignores biome pins", () => {
    const height = [{ id: "a", kind: "height", at: [4, 4], height: 300 }];
    const a = shapeGrid([zone(height)], "test");
    const b = shapeGrid([zone([...height, { id: "b", kind: "biome", at: [4, 4], biome: "rocky" }])], "test");
    expect(b.heights).toEqual(a.heights);
  });

  it("is NaN off the grid", () => {
    const grid = shapeGrid([zone([])], "test");
    expect(gridHeight(grid, grid.x0 - 1, 0)).toBeNaN();
  });
});

describe("previewMesh", () => {
  it("has a vertex per sample, relative to the origin", () => {
    const grid = { x0: 100, z0: 200, stepFt: 64, nx: 3, nz: 2, heights: Float32Array.from([1, 2, 3, 4, 5, 6]) };
    const mesh = previewMesh(grid, [100, 200]);
    expect(Array.from(mesh.positions.slice(0, 6))).toEqual([0, 1, 0, 64, 2, 0]);
    expect(mesh.indices.length).toBe(2 * 1 * 6);
  });
});
