import { describe, it, expect } from "vitest";
import { Features, nearestOnStroke, nextId } from "./features.js";

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

  it("takes road pins left with no paths along when a pin or path goes", () => {
    const pin = (id) => ({ id, kind: "road", at: [0, 0] });
    const sketch = () => ({
      pins: [pin("a"), pin("b"), pin("c"), pin("d"), { id: "i", kind: "info", at: [0, 0] }],
      paths: [{ id: "r1", from: "a", to: "b" }, { id: "r2", from: "b", to: "c" }],
    });
    const features = new Features({ saveSketch() {}, renderProps() {} });
    const ids = (s) => [s.pins.map((p) => p.id), s.paths.map((p) => p.id)];

    const lonely = sketch();
    features.selected = { type: "pin", id: "a" };
    features.remove(lonely);
    expect(ids(lonely)).toEqual([["b", "c", "d", "i"], ["r2"]]);

    const middle = sketch();
    features.selected = { type: "pin", id: "b" };
    features.remove(middle);
    expect(ids(middle)).toEqual([["d", "i"], []]);

    const path = sketch();
    features.selected = { type: "path", id: "r1" };
    features.remove(path);
    expect(ids(path)).toEqual([["b", "c", "d", "i"], ["r2"]]);
  });
});
