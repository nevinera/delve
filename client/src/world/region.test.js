import { describe, it, expect } from "vitest";
import {
  cornerCount,
  labelPoint,
  nearestEdge,
  pointInRegion,
  resubtract,
  snapToCell,
  subtractZones,
  tilesTouched,
} from "./region.js";

const ring = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const square = [[ring(0, 0, 2, 2)]];
const area = (region) =>
  region.reduce((sum, [outline, ...holes]) => sum + ringArea(outline) - holes.reduce((s, h) => s + ringArea(h), 0), 0);
function ringArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    sum += ax * bz - bx * az;
  }
  return Math.abs(sum / 2);
}

describe("region", () => {
  it("snaps corners to cell corners", () => {
    expect(snapToCell([1.005, -0.499])).toEqual([1, -0.5]);
  });

  it("tests points against outlines and holes", () => {
    const withHole = [[ring(0, 0, 4, 4), ring(1, 1, 3, 3)]];
    expect(pointInRegion([0.5, 0.5], withHole)).toBe(true);
    expect(pointInRegion([2, 2], withHole)).toBe(false);
    expect(pointInRegion([5, 2], withHole)).toBe(false);
  });

  it("touches only the tiles inside an aligned square", () => {
    expect(tilesTouched(square)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });

  it("touches every tile a thin sliver crosses", () => {
    const sliver = [[[[0.1, 0.5], [2.9, 0.5], [2.9, 0.6], [0.1, 0.6]]]];
    expect(tilesTouched(sliver)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it("counts tiles a diagonal edge halves, and skips ones it only touches at a corner", () => {
    expect(tilesTouched([[[[0, 0], [2, 0], [0, 2]]]])).toEqual([[0, 0], [0, 1], [1, 0]]);
  });

  it("skips tiles that sit entirely in a hole", () => {
    const withHole = [[ring(0, 0, 3, 3), ring(1, 1, 2, 2)]];
    expect(tilesTouched(withHole)).not.toContainEqual([1, 1]);
    expect(tilesTouched(withHole)).toHaveLength(8);
  });

  it("puts the label inside the region, clear of holes", () => {
    const withHole = [[ring(0, 0, 6, 6), ring(2, 2, 4, 4)]];
    const point = labelPoint(withHole);
    expect(pointInRegion(point, withHole)).toBe(true);
  });

  it("finds the nearest edge across rings", () => {
    const withHole = [[ring(0, 0, 4, 4), ring(1, 1, 3, 3)]];
    const edge = nearestEdge(withHole, [2, 1.1]);
    expect(edge).toMatchObject({ poly: 0, ring: 1, index: 0 });
    expect(edge.point).toEqual([2, 1]);
  });
});

describe("subtractZones", () => {
  it("keeps the outline when nothing is in the way", () => {
    expect(area(subtractZones(ring(0, 0, 2, 2), []))).toBeCloseTo(4);
  });

  it("cuts out the part another zone covers", () => {
    expect(area(subtractZones(ring(0, 0, 4, 2), [[[ring(2, 0, 6, 2)]]]))).toBeCloseTo(4);
  });

  it("leaves a hole where the outline surrounds another zone", () => {
    const result = subtractZones(ring(0, 0, 6, 6), [[[ring(2, 2, 4, 4)]]]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
    expect(area(result)).toBeCloseTo(32);
    expect(cornerCount(result)).toBe(8);
  });

  it("splits into pieces when another zone cuts across", () => {
    expect(subtractZones(ring(0, 0, 6, 2), [[[ring(2, -1, 4, 3)]]])).toHaveLength(2);
  });

  it("comes out empty when another zone covers it all", () => {
    expect(subtractZones(ring(1, 1, 2, 2), [[[ring(0, 0, 4, 4)]]])).toEqual([]);
  });

  it("re-subtracts an edited region", () => {
    expect(area(resubtract([[ring(0, 0, 5, 2)]], [[[ring(4, 0, 6, 2)]]]))).toBeCloseTo(8);
  });
});
