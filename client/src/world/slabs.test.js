import { describe, expect, it } from "vitest";
import { TILE_FT } from "./constants.js";
import { slabBottom, slabHome, slabProblems, slabTile, slabTop } from "./slabs.js";

// A 10 ft square floor, and a wall: the same square stood up on its south edge.
const floor = { at: [100, 40, 200], turn: [0, 0, 0], outline: [[0, 0], [10, 0], [10, 10], [0, 10]], thickness: 1, surface: "floorboards" };
const wall = { ...floor, turn: [0, -90, 0], surface: "brick" };

describe("slabs", () => {
  it("lays an unturned slab level, its thickness below", () => {
    expect(slabTop(floor)).toEqual([[100, 40, 200], [110, 40, 200], [110, 40, 210], [100, 40, 210]]);
    expect(slabBottom(floor).map((p) => p[1])).toEqual([39, 39, 39, 39]);
  });

  it("stands a slab up by pitching it, its thickness to one side", () => {
    // Pitching -90° turns the outline's v (south) to up.
    expect(slabTop(wall)).toEqual([[100, 40, 200], [110, 40, 200], [110, 50, 200], [100, 50, 200]]);
    expect(slabBottom(wall).map((p) => p[2])).toEqual([201, 201, 201, 201]);
  });

  it("belongs to the tile holding its north-most corner, the west-most of those", () => {
    expect(slabHome(floor)).toEqual([100, 40, 200]);
    const across = { ...floor, at: [TILE_FT - 5, 40, 200] };
    expect(slabTile(across)).toEqual([0, 0]);
    expect(slabTile({ ...across, turn: [180, 0, 0] })).toEqual([0, 0]);
    expect(slabTile({ ...floor, at: [TILE_FT + 2, 40, -3] })).toEqual([1, -1]);
  });

  it("finds nothing wrong with a good slab", () => {
    expect(slabProblems(floor)).toEqual([]);
    expect(slabProblems(wall)).toEqual([]);
    const textured = { ...floor, surface: { color: "#a0a0a0", tile: { image: "img00001", every: 4, jitter: 0.2 }, palette: ["#ffffff", "#000000"] } };
    expect(slabProblems(textured, new Set(["img00001"]))).toEqual([]);
  });

  it("says what's wrong with a bad one", () => {
    expect(slabProblems({ ...floor, outline: [[0, 0], [1, 1]] })).toEqual(["needs an outline of 3 to 32 [u, v] points"]);
    expect(slabProblems({ ...floor, outline: [[0, 0], [1, 1], [2, 2]] })).toEqual(["has an outline with no area"]);
    expect(slabProblems({ ...floor, thickness: 0 })).toEqual(["needs a thickness over 0 and at most 16 ft"]);
    expect(slabProblems({ ...floor, surface: { color: "#fff" } })).toEqual(["needs a surface: a preset's name, or { color }"]);
    expect(slabProblems({ ...floor, surface: { color: "#ffffff", pattern: "lava" } })).toEqual(['has pattern "lava", which isn\'t one of grass, dirt, sand, rock, path, shore, mud, moss, litter']);
    expect(slabProblems({ ...floor, thickness: 16, outline: [[0, 0], [60, 0], [60, 20]] })).toEqual(["reaches more than 64 ft from its home corner"]);
  });
});
