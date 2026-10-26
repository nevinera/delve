import { describe, it, expect } from "vitest";
import { nearestOnStroke, nextId } from "./features.js";

describe("features", () => {
  it("picks the next unused id across pins and paths", () => {
    const sketch = { pins: [{ id: "p1" }, { id: "p3" }], paths: [{ id: "r1" }] };
    expect(nextId(sketch, "p")).toBe("p2");
    expect(nextId(sketch, "r")).toBe("r2");
  });

  it("finds the line segment nearest a point", () => {
    const points = [[0, 0], [2, 0], [2, 2]];
    expect(nearestOnStroke(points, [2.1, 1.5])).toEqual({ index: 1, dist: expect.closeTo(0.1) });
  });
});
