import { describe, it, expect } from "vitest";
import { findCrossing, findRoute, gradeCap, riverLookup, splitRoute } from "./roads.js";

// Land in a 1200ft square round the origin, with the sea beyond, shaped by `height`.
const land = (height, water = () => null) => (x, z) => ({ h: height(x, z), water: Math.abs(x) > 600 || Math.abs(z) > 600 ? "sea" : water(x, z) });
const noRivers = () => null;
// The steepest the ground climbs along a route, over each `overFt` of it.
const steepest = (route, height, overFt) => {
  const along = [0];
  for (let k = 1; k < route.points.length; k++) along.push(along[k - 1] + Math.hypot(route.points[k][0] - route.points[k - 1][0], route.points[k][1] - route.points[k - 1][1]));
  let worst = 0;
  for (let a = 0, b = 0; a < route.points.length; a++) {
    while (b < route.points.length && along[b] - along[a] < overFt) b++;
    if (b === route.points.length) break;
    worst = Math.max(worst, Math.abs(height(...route.points[b]) - height(...route.points[a])) / (along[b] - along[a]));
  }
  return worst;
};

describe("findRoute", () => {
  it("runs straight over flat ground", () => {
    const route = findRoute({ from: [-400, 0], to: [400, 0], cap: 0.1, ground: land(() => 5), riverAt: noRivers });
    expect(route.lengthFt).toBeCloseTo(800, 0);
    expect(route.grade).toBe(0);
  });

  it("zig-zags up a slope too steep to climb straight", () => {
    const height = (x, z) => Math.max(0, Math.min(200, (z + 200) / 2)); // 50% from z -200 to 200
    const route = findRoute({ from: [0, -300], to: [0, 300], cap: 0.25, ground: land(height), riverAt: noRivers });
    expect(route.grade).toBeLessThanOrEqual(0.25);
    expect(route.lengthFt).toBeGreaterThan(200 / 0.25);
    expect(steepest(route, height, 64)).toBeLessThan(0.3);
  });

  it("holds cart roads to a gentler grade", () => {
    expect(gradeCap(8)).toBe(0.25);
    expect(gradeCap(10)).toBe(0.1);
  });

  it("finds nothing past a cliff", () => {
    const route = findRoute({ from: [0, -300], to: [0, 300], cap: 0.25, ground: land((x, z) => (z > 0 ? 60 : 0)), riverAt: noRivers });
    expect(route).toBeNull();
  });

  it("goes round a lake", () => {
    const lake = (x, z) => (Math.hypot(x, z) < 150 ? "lake" : null);
    const route = findRoute({ from: [-400, 0], to: [400, 0], cap: 0.1, ground: land(() => 5, lake), riverAt: noRivers });
    expect(route.points.every(([x, z]) => Math.hypot(x, z) >= 140)).toBe(true);
  });

  it("crosses a river square to its flow", () => {
    const riverAt = riverLookup([{ points: [[0, -700], [0, 700]], width: 40 }]);
    const route = findRoute({ from: [-300, -250], to: [300, 250], cap: 0.1, ground: land(() => 5), riverAt });
    const wet = [];
    for (let k = 1; k < route.points.length; k++) {
      const [a, b] = [route.points[k - 1], route.points[k]];
      if (Math.abs((a[0] + b[0]) / 2) < 20) wet.push(Math.abs(b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    expect(wet.length).toBeGreaterThan(0);
    for (const sine of wet) expect(sine).toBeLessThan(Math.sin((25 * Math.PI) / 180));
  });
});

describe("findCrossing", () => {
  const paths = [
    { id: "a", from: "p1", to: "p2", points: [[0, 0], [10, 10]] },
    { id: "b", from: "p3", to: "p4", points: [[0, 10], [4, 6], [10, 0]] },
  ];

  it("finds where two routes cross", () => {
    expect(findCrossing(paths, 1)).toEqual({ a: "a", b: "b", ia: 0, ib: 1, point: [5, 5] });
  });

  it("leaves paths that share a pin, and crossings near an end", () => {
    expect(findCrossing([paths[0], { ...paths[1], to: "p1" }], 1)).toBeNull();
    expect(findCrossing(paths, 8)).toBeNull();
  });

  it("splits a route at a point", () => {
    expect(splitRoute([[0, 0], [10, 10], [20, 10]], 0, [5, 5])).toEqual([[[0, 0], [5, 5]], [[5, 5], [10, 10], [20, 10]]]);
  });
});
