import { describe, it, expect } from "vitest";
import { nearestEdge, overlaps, pointInPolygon, snapToCell, tilesTouched } from "./region.js";

const square = [[0, 0], [2, 0], [2, 2], [0, 2]];

describe("region", () => {
  it("snaps vertices to cell corners", () => {
    expect(snapToCell([1.005, -0.499])).toEqual([1, -0.5]);
  });

  it("tests points against the polygon", () => {
    expect(pointInPolygon([1, 1], square)).toBe(true);
    expect(pointInPolygon([3, 1], square)).toBe(false);
  });

  it("touches only the tiles inside an aligned square", () => {
    expect(tilesTouched(square)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });

  it("touches every tile a thin sliver crosses", () => {
    const sliver = [[0.1, 0.5], [2.9, 0.5], [2.9, 0.6], [0.1, 0.6]];
    expect(tilesTouched(sliver)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it("counts tiles a diagonal edge halves, and skips ones it only touches at a corner", () => {
    const triangle = [[0, 0], [2, 0], [0, 2]];
    expect(tilesTouched(triangle)).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it("needs three vertices", () => {
    expect(tilesTouched([[0, 0], [1, 1]])).toEqual([]);
  });

  it("finds the nearest edge", () => {
    expect(nearestEdge(square, [2.1, 1]).index).toBe(1);
  });
});

describe("overlaps", () => {
  const a = [[0, 0], [2, 0], [2, 2], [0, 2]];

  it("allows regions that are apart or share an edge", () => {
    expect(overlaps(a, [[3, 0], [4, 0], [4, 1], [3, 1]])).toBe(false);
    expect(overlaps(a, [[2, 0], [4, 0], [4, 2], [2, 2]])).toBe(false);
  });

  it("allows a corner partway along the other region's edge", () => {
    expect(overlaps(a, [[2, 1], [4, 0], [4, 2]])).toBe(false);
  });

  it("catches crossing edges", () => {
    expect(overlaps(a, [[1, 1], [3, 1], [3, 3], [1, 3]])).toBe(true);
  });

  it("catches containment and identical regions, either winding", () => {
    expect(overlaps(a, [[0.5, 0.5], [1, 0.5], [1, 1]])).toBe(true);
    expect(overlaps([[0.5, 0.5], [1, 0.5], [1, 1]], a)).toBe(true);
    expect(overlaps(a, [...a].reverse())).toBe(true);
  });

  it("catches a region that shares an edge but sits on the same side", () => {
    expect(overlaps(a, [[0, 0], [2, 0], [1, 1]])).toBe(true);
  });
});
