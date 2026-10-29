import { describe, expect, it } from "vitest";
import { slabBottom, slabTop } from "../world/slabs.js";
import { wallSlab } from "./slabTool.js";

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
