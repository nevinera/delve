import { describe, expect, it } from "vitest";
import { TILE_FT } from "./constants.js";
import { cutSlab, slabHitsTrunk, slabSpanAt, slabBottom, slabHome, slabProblems, slabTile, slabTop } from "./slabs.js";

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

describe("slab holes", () => {
  const wall = { at: [0, 0, 0], turn: [0, -90, 0], outline: [[0, 0], [20, 0], [20, 10], [0, 10]], thickness: 1, surface: "brick" };
  const door = [[2, 0.5], [5, 0.5], [5, 7], [2, 7]];
  const window = [[10, 4], [13, 4], [13, 7], [10, 7]];

  it("takes holes inside the outline", () => {
    expect(slabProblems({ ...wall, holes: [door, window] })).toEqual([]);
  });

  it("won't have a hole reaching outside, or overlapping another", () => {
    expect(slabProblems({ ...wall, holes: [[[2, -1], [5, -1], [5, 7], [2, 7]]] })).toEqual(["has hole 1 reaching outside its outline"]);
    expect(slabProblems({ ...wall, holes: [door, [[4, 1], [8, 1], [8, 3], [4, 3]]] })).toEqual(["has hole 2 overlapping another"]);
    expect(slabProblems({ ...wall, holes: [door, [[2.5, 1], [3, 1], [3, 2]]] })).toEqual(["has hole 2 overlapping another"]);
    expect(slabProblems({ ...wall, holes: [[[1, 1], [2, 1]]] })).toEqual(["needs holes as up to 16 lists of 3 to 32 [u, v] points"]);
  });
});

describe("cutSlab", () => {
  const wall = { at: [0, 0, 0], turn: [0, -90, 0], outline: [[0, 0], [20, 0], [20, 10], [0, 10]], thickness: 1, surface: "brick" };
  const area = (ring) => Math.abs(ring.reduce((sum, [x0, y0], i) => sum + x0 * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * y0, 0)) / 2;

  it("makes a hole inside it", () => {
    const [cut] = cutSlab(wall, [[10, 4], [13, 4], [13, 7], [10, 7]]);
    expect(cut.holes).toHaveLength(1);
    expect(area(cut.outline)).toBe(200);
    expect(slabProblems(cut)).toEqual([]);
  });

  it("cuts a notch for a door reaching its edge", () => {
    const pieces = cutSlab(wall, [[2, -1], [5, -1], [5, 7], [2, 7]]);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].holes).toBeUndefined();
    expect(area(pieces[0].outline)).toBe(200 - 21);
    expect(slabProblems(pieces[0])).toEqual([]);
  });

  it("splits it where a cut goes right across", () => {
    const pieces = cutSlab(wall, [[8, -1], [12, -1], [12, 11], [8, 11]]);
    expect(pieces.map((p) => area(p.outline)).sort()).toEqual([80, 80]);
    expect(pieces.every((p) => p.at === wall.at || p.at.join() === wall.at.join())).toBe(true);
  });
});

describe("slabSpanAt", () => {
  const floor = { at: [100, 41, 200], turn: [0, 0, 0], outline: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [[[4, 4], [6, 4], [6, 6], [4, 6]]], thickness: 1, surface: "stone" };

  it("finds a floor over a point, and not past its edge or in its holes", () => {
    expect(slabSpanAt(floor, 102, 202)).toEqual([40, 41]);
    expect(slabSpanAt(floor, 99, 202)).toBeNull();
    expect(slabSpanAt(floor, 105, 205)).toBeNull();
  });

  it("follows a turned and tilted slab", () => {
    const ramp = { ...floor, holes: undefined, turn: [90, 0, 0] };
    // Yawed a quarter turn, its outline's u runs north.
    expect(slabSpanAt(ramp, 102, 195)).toEqual([40, 41]);
    expect(slabSpanAt(ramp, 102, 205)).toBeNull();
    const tilted = { ...floor, holes: undefined, turn: [0, 0, 30] };
    const [low, high] = slabSpanAt(tilted, 100 + 5 * Math.cos(Math.PI / 6), 205);
    expect(high).toBeCloseTo(41 + 5 * Math.sin(Math.PI / 6));
    expect(high - low).toBeCloseTo(1 / Math.cos(Math.PI / 6));
  });

  it("passes by a wall", () => {
    expect(slabSpanAt({ ...floor, holes: undefined, turn: [0, -90, 0] }, 102, 200)).toBeNull();
  });
});

describe("slabHitsTrunk", () => {
  const trunk = (x, z, ground = 0, top = 60) => ({ x, z, radius: 2.5, ground, top });

  it("finds a trunk through a floor, or brushing its edge", () => {
    expect(slabHitsTrunk(floor, trunk(105, 205))).toBe(true);
    expect(slabHitsTrunk(floor, trunk(111, 205))).toBe(true);
    expect(slabHitsTrunk(floor, trunk(114, 205))).toBe(false);
  });

  it("misses a tree too short to reach a floor, or standing in its hole", () => {
    expect(slabHitsTrunk(floor, trunk(105, 205, 0, 30))).toBe(false);
    const holed = { ...floor, outline: [[-10, -10], [20, -10], [20, 20], [-10, 20]], holes: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
    expect(slabHitsTrunk(holed, trunk(105, 205))).toBe(false);
    expect(slabHitsTrunk(holed, trunk(108, 205))).toBe(true);
  });

  it("finds a trunk against a wall's face", () => {
    // The wall stands on z 200, 1 ft thick to the south.
    expect(slabHitsTrunk(wall, trunk(105, 203))).toBe(true);
    expect(slabHitsTrunk(wall, trunk(105, 197))).toBe(false);
    expect(slabHitsTrunk(wall, trunk(105, 204))).toBe(false);
  });
});
