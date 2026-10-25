import { describe, it, expect } from "vitest";
import { nearestOnStroke, nextId } from "./features.js";

describe("features", () => {
  it("picks the next unused id across pins and strokes", () => {
    const zone = { pins: [{ id: "p1" }, { id: "p3" }], strokes: [{ id: "s1" }] };
    expect(nextId(zone, "p")).toBe("p2");
    expect(nextId(zone, "s")).toBe("s2");
  });

  it("finds the stroke segment nearest a point", () => {
    const points = [[0, 0], [2, 0], [2, 2]];
    expect(nearestOnStroke(points, [2.1, 1.5])).toEqual({ index: 1, dist: expect.closeTo(0.1) });
  });
});
