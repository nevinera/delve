import { describe, it, expect } from "vitest";
import { computeMapFill } from "../mapFill";

const wall = (...pts) => ({ type: "wall", locations: pts.map(([x, y]) => ({ x, y })) });
const circle = (x, y, radius) => ({ type: "circle", location: { x, y }, radius });
const line = ([x1, y1], [x2, y2]) => ({ identifier: "door", type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y2 } });
const map = (barriers, connections = [], width = 100, height = 100) => ({ feetDimensions: { width, height }, barriers, connections });

const area = (ring) => ring.reduce((sum, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return sum + (x1 * y2 - x2 * y1) / 2;
}, 0);
const filledArea = (fill) => fill.filled.reduce((sum, f) => sum + Math.abs(area(f.outer)) - f.holes.reduce((h, ring) => h + Math.abs(area(ring)), 0), 0);
const room = [[20, 20], [80, 20], [80, 80], [20, 80], [20, 20]];

describe("computeMapFill", () => {
  it("fills everything outside a closed room", () => {
    expect(filledArea(computeMapFill(map([wall(...room)])))).toBeCloseTo(10000 - 3600);
  });

  it("fills nothing when the walls run along the map's edge", () => {
    expect(computeMapFill(map([wall([0, 0], [100, 0], [100, 100], [0, 100], [0, 0])])).filled).toEqual([]);
  });

  it("knows a door's far side is off the map even when walls cover the rest of its edge", () => {
    const fill = computeMapFill(map(
      [wall([40, 0], [0, 0], [0, 100], [100, 100], [100, 0], [60, 0])],
      [line([40, 0], [60, 0])],
    ));
    const door = fill.edges.find((e) => e.kind === "connection");
    expect([door.left, door.right].sort()).toEqual(["open", "outside"]);
  });

  it("closes a gap of up to half a foot between wall ends", () => {
    const fill = computeMapFill(map([wall([20, 20], [80, 20], [80, 80], [20, 80], [20, 20.4])]));
    expect(filledArea(fill)).toBeCloseTo(10000 - 3600, 0);
  });

  it("leaks through a wider gap, filling the whole map", () => {
    const fill = computeMapFill(map([wall([20, 20], [80, 20], [80, 80], [20, 80], [20, 21])]));
    expect(filledArea(fill)).toBeCloseTo(10000, 0);
  });

  it("closes a gap between a wall end and the middle of another wall", () => {
    const fill = computeMapFill(map([
      wall([20, 20], [80, 20], [80, 80], [20, 80]),
      wall([20.3, 80], [20.3, 50]),
      wall([20, 20], [20, 50]),
    ]));
    expect(filledArea(fill)).toBeLessThan(10000 - 3500);
  });

  it("closes a gap between a wall end and the map's edge", () => {
    // A wall across the map, stopping just short of its east edge.
    const fill = computeMapFill(map([wall([0, 50], [99.7, 50])]));
    // Both halves touch the edge, so both fill; the wall itself splits them.
    expect(fill.edges.some((e) => e.kind === "connector")).toBe(true);
  });

  it("seals a boundary through a circle its walls end near", () => {
    const fill = computeMapFill(map([
      wall([50, 20], [20, 20], [20, 80], [80, 80], [80, 20], [54, 20]),
      circle(52, 20, 1.5),
    ]));
    expect(filledArea(fill)).toBeCloseTo(10000 - 3600, 0);
  });

  it("treats a line connection as part of the boundary", () => {
    const fill = computeMapFill(map(
      [wall([45, 20], [20, 20], [20, 80], [80, 80], [80, 20], [55, 20])],
      [line([45, 20], [55, 20])],
    ));
    expect(filledArea(fill)).toBeCloseTo(10000 - 3600);
    const door = fill.edges.find((e) => e.kind === "connection");
    expect([door.left, door.right].sort()).toEqual(["filled", "open"]);
  });

  it("leaves a dangling wall open on both sides", () => {
    const fill = computeMapFill(map([wall(...room), wall([40, 50], [60, 50])]));
    const stub = fill.edges.find((e) => e.kind === "wall" && e.a[1] === 50 && e.b[1] === 50);
    expect([stub.left, stub.right]).toEqual(["open", "open"]);
    expect(filledArea(fill)).toBeCloseTo(10000 - 3600);
  });

  it("marks the room's walls as filled outside and open inside", () => {
    const fill = computeMapFill(map([wall(...room)]));
    for (const e of fill.edges.filter((e) => e.kind === "wall")) {
      expect([e.left, e.right].sort()).toEqual(["filled", "open"]);
    }
    const border = fill.edges.filter((e) => e.kind === "border");
    expect(border.every((e) => [e.left, e.right].sort().join() === "filled,outside")).toBe(true);
  });

  it("cuts a room out of the fill as a hole, open ground inside", () => {
    const fill = computeMapFill(map([wall(...room)]));
    expect(fill.filled).toHaveLength(1);
    expect(fill.filled[0].holes).toHaveLength(1);
  });

  it("clips walls that run off the map", () => {
    const fill = computeMapFill(map([wall([-10, 50], [110, 50])]));
    expect(filledArea(fill)).toBeCloseTo(10000);
    expect(fill.edges.every((e) => e.a.every((c) => c >= 0 && c <= 100))).toBe(true);
  });

  it("fills the region around each fill point", () => {
    const rock = wall([40, 40], [60, 40], [60, 60], [40, 60], [40, 40]);
    const open = computeMapFill(map([wall(...room), rock]));
    expect(filledArea(open)).toBeCloseTo(10000 - 3600);
    const filled = computeMapFill({ ...map([wall(...room), rock]), fillPoints: [{ x: 50, y: 50 }] });
    expect(filledArea(filled)).toBeCloseTo(10000 - 3600 + 400);
    const side = filled.edges.find((e) => e.kind === "wall" && e.a[0] === 40 && e.b[0] === 40);
    expect([side.left, side.right].sort()).toEqual(["filled", "open"]);
  });

  it("ignores a fill point already in the fill", () => {
    const fill = computeMapFill({ ...map([wall(...room)]), fillPoints: [{ x: 5, y: 5 }] });
    expect(filledArea(fill)).toBeCloseTo(10000 - 3600);
  });

  it("handles an empty map", () => {
    expect(filledArea(computeMapFill(map([])))).toBeCloseTo(10000);
  });
});
