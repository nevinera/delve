import { describe, expect, it } from "vitest";
import { slabBottom, slabProblems, slabTop } from "../world/slabs.js";
import { conformedCells, faceSlab, floorSlab, rectanglePieces, rectangleSlab, wallPieces, wallSlab } from "./slabTool.js";

const near = (points) => points.map((p) => p.map((v) => Math.round(v * 100) / 100 + 0));

describe("wallSlab", () => {
  it("stands a wall along the line, from its foot to its height over the start", () => {
    const wall = wallSlab([100, 40, 200], [100, 40, 212], { foot: 37, height: 10, thickness: 1, surface: "brick" });
    expect(near(slabTop(wall))).toEqual([[100, 37, 200], [100, 37, 212], [100, 50, 212], [100, 50, 200]]);
    // Its thickness goes off to one side of the line.
    expect(new Set(near(slabBottom(wall)).map((p) => p[0])).size).toBe(1);
    expect(near(slabBottom(wall))[0][0]).not.toBe(100);
  });

  it("runs any way across the ground", () => {
    const wall = wallSlab([0, 0, 0], [-6, 0, -8], { foot: 0, height: 8, thickness: 0.5, surface: "plaster" });
    expect(near(slabTop(wall)).slice(0, 2)).toEqual([[0, 0, 0], [-6, 0, -8]]);
  });
});

describe("floorSlab", () => {
  it("lies on its corners' level, its top a thickness over them", () => {
    const floor = floorSlab([[10, 40, 20], [18, 40, 20], [18, 40, 26]], { thickness: 1, surface: "stone" });
    expect(near(slabTop(floor))).toEqual([[10, 41, 20], [18, 41, 20], [18, 41, 26]]);
    expect(near(slabBottom(floor)).map((p) => p[1])).toEqual([40, 40, 40]);
  });
});

describe("faceSlab", () => {
  it("stands up through its corners, as a gable end", () => {
    const gable = faceSlab([[0, 10, 0], [12, 10, 0], [6, 16, 0]], { thickness: 1, surface: "plaster" });
    expect(near(slabTop(gable))).toEqual([[0, 10, 0], [12, 10, 0], [6, 16, 0]]);
  });
});

describe("rectangleSlab", () => {
  it("runs along the world's axes for a camera looking north", () => {
    const floor = rectangleSlab([0, 5, 0], [10, 5, 6], 0, { thickness: 1, surface: "stone" });
    expect(near(slabTop(floor))).toEqual([[0, 6, 0], [10, 6, 0], [10, 6, 6], [0, 6, 6]]);
  });

  it("squares up to a turned camera, its far corner where it was dragged to", () => {
    const floor = rectangleSlab([0, 0, 0], [3, 0, 9], 30, { thickness: 1, surface: "stone" });
    expect(floor.turn).toEqual([30, 0, 0]);
    expect(near(slabTop(floor))[2]).toEqual([3, 1, 9]);
  });
});

describe("cutting up long rectangles", () => {
  it("cuts a big floor into pieces a whole number of repeats across, meeting edge to edge", () => {
    // Brick repeats every 4 ft, so the pieces are 40 ft, and what's left.
    const pieces = rectanglePieces([0, 0, 0], [100, 0, 30], 0, { thickness: 1, surface: "brick" });
    expect(pieces.map((p) => p.outline[2])).toEqual([[40, 30], [40, 30], [20, 30]]);
    expect(pieces.map((p) => p.at[0])).toEqual([0, 40, 80]);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("cuts a turned floor along its own sides", () => {
    const pieces = rectanglePieces([0, 0, 0], [100, 0, 0], 45, { thickness: 2, surface: "stone" });
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("cuts a long wall along its length", () => {
    const pieces = wallPieces([0, 0, 0], [0, 0, 130], { foot: 0, height: 12, thickness: 1, surface: "stoneBlocks" });
    expect(pieces.map((p) => p.outline[1][0])).toEqual([40, 40, 40, 10]);
    expect(near(pieces.map((p) => slabTop(p)[0]))).toEqual([[0, 0, 0], [0, 0, 40], [0, 0, 80], [0, 0, 120]]);
    for (const piece of pieces) expect(slabProblems(piece)).toEqual([]);
  });

  it("leaves one past the limit whole, to show red", () => {
    expect(rectanglePieces([0, 0, 0], [3000, 0, 10], 0, { thickness: 1, surface: "brick" })).toHaveLength(1);
  });
});

describe("conformedCells", () => {
  it("sets the ground under a floor, and a cell past its edges, to its bottom", () => {
    const floor = floorSlab([[16, 40, 16], [32, 40, 16], [32, 40, 32], [16, 40, 32]], { thickness: 1, surface: "stone" });
    const cells = conformedCells([floor], 8);
    expect(new Set(cells.map((c) => c[2]))).toEqual(new Set([40]));
    const keys = cells.map(([ci, cj]) => `${ci},${cj}`);
    // The 2×2 cells under it, and the ring a cell round them.
    expect(keys).toHaveLength(16);
    expect(keys).toContain("2,2");
    expect(keys).toContain("1,1");
    expect(keys).not.toContain("0,0");
  });
});
