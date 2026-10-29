import { describe, expect, it } from "vitest";
import { slabBottom, slabTop } from "../world/slabs.js";
import { faceSlab, floorSlab, wallSlab } from "./slabTool.js";

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
