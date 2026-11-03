import { describe, expect, it } from "vitest";
import { limitedHull } from "./limitedHull.js";

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Each face's outward plane, from its loop (Newell's method).
function planes({ points, faces }) {
  return faces.map((loop) => {
    const n = [0, 0, 0];
    loop.forEach((a, i) => {
      const [p, q] = [points[a], points[loop[(i + 1) % loop.length]]];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]);
      n[1] += (p[2] - q[2]) * (p[0] + q[0]);
      n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    });
    const len = Math.hypot(...n);
    const unit = n.map((v) => v / len);
    return { n: unit, d: dot(unit, points[loop[0]]) };
  });
}

function expectHolds(hull, points, slack = 1e-6) {
  for (const { n, d } of planes(hull)) {
    for (const p of points) expect(dot(n, p) - d).toBeLessThanOrEqual(slack);
  }
}

// A box made of boards: a floor, a lid and four walls, each 0.1 ft thick.
function boards() {
  const slab = ([x0, y0, z0], [x1, y1, z1]) => [x0, x1].flatMap((x) => [y0, y1].flatMap((y) => [z0, z1].map((z) => [x, y, z])));
  return [
    slab([-1, 0, -1], [1, 0.1, 1]),
    slab([-1, 1.9, -1], [1, 2, 1]),
    slab([-1, 0, -1], [-0.9, 2, 1]),
    slab([0.9, 0, -1], [1, 2, 1]),
    slab([-1, 0, -1], [1, 2, -0.9]),
    slab([-1, 0, 0.9], [1, 2, 1]),
  ].flat();
}

function cylinder(sides) {
  return Array.from({ length: sides }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [[Math.cos(a), 0, Math.sin(a)], [Math.cos(a), 3, Math.sin(a)]];
  }).flat();
}

describe("limitedHull", () => {
  it("wraps a box of boards in the box", () => {
    const hull = limitedHull(boards(), 32);
    expect(hull.points).toHaveLength(8);
    expect(hull.faces).toHaveLength(6);
    expect(hull.faces.every((f) => f.length === 4)).toBe(true);
    expectHolds(hull, boards());
  });

  it("keeps the exact hull when it has few enough corners", () => {
    const hull = limitedHull(cylinder(12), 32);
    expect(hull.points).toHaveLength(24);
    expect(hull.faces).toHaveLength(14);
  });

  it("crops a box down to the limit, holding every point", () => {
    const points = cylinder(64);
    const hull = limitedHull(points, 32);
    expect(hull.points.length).toBeLessThanOrEqual(32);
    expect(hull.points.length).toBeGreaterThan(8);
    expectHolds(hull, points, 1e-3);
    // Cropped close: no corner much farther out than the cylinder's radius.
    expect(Math.max(...hull.points.map(([x, , z]) => Math.hypot(x, z)))).toBeLessThan(1.2);
  });

  it("holds a cloud of points", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const points = Array.from({ length: 400 }, () => {
      const p = [random(), random(), random()];
      const r = Math.hypot(...p);
      return [p[0] / r * 3, p[1] / r, p[2] / r * 2];
    });
    const hull = limitedHull(points, 16);
    expect(hull.points.length).toBeLessThanOrEqual(16);
    expectHolds(hull, points, 1e-6);
  });

  it("winds every face counterclockwise seen from outside", () => {
    const hull = limitedHull(cylinder(64), 32);
    const middle = hull.points.reduce((s, p) => s.map((v, i) => v + p[i] / hull.points.length), [0, 0, 0]);
    for (const { n, d } of planes(hull)) expect(dot(n, middle) - d).toBeLessThan(0);
  });

  it("finds nothing to wrap in flat or too few points", () => {
    expect(limitedHull([[0, 0, 0], [1, 0, 0], [0, 1, 0]], 32)).toBeNull();
    expect(limitedHull([[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]], 32)).toBeNull();
  });
});

