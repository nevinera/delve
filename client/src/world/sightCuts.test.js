import { describe, expect, it } from "vitest";
import { cutMesh } from "./sightCuts.js";

// A 4 ft cube on the ground.
const cube = {
  points: [[-2, 0, -2], [2, 0, -2], [2, 0, 2], [-2, 0, 2], [-2, 4, -2], [2, 4, -2], [2, 4, 2], [-2, 4, 2]],
  faces: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
};

// Whether the segment from a to b crosses any of the mesh's faces (fanned into triangles).
function blocks({ points, faces }, a, b) {
  const sub = (p, q) => p.map((v, i) => v - q[i]);
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const dir = sub(b, a);
  for (const loop of faces) {
    for (let i = 1; i + 1 < loop.length; i++) {
      const [p0, p1, p2] = [points[loop[0]], points[loop[i]], points[loop[i + 1]]];
      const [e1, e2] = [sub(p1, p0), sub(p2, p0)];
      const h = cross(dir, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(a, p0);
      const u = dot(s, h) / det;
      const q = cross(s, e1);
      const v = dot(dir, q) / det;
      const t = dot(e2, q) / det;
      if (u >= 0 && v >= 0 && u + v <= 1 && t >= 0 && t <= 1) return true;
    }
  }
  return false;
}

describe("cutMesh", () => {
  it("leaves a mesh with no cuts as it is", () => {
    expect(cutMesh(cube, [])).toBe(cube);
    expect(cutMesh(cube)).toBe(cube);
  });

  it("cuts a hole straight through along the view", () => {
    const window = { along: [0, 0, -1], outline: [[-1, 1, 0], [1, 1, 0], [1, 3, 0], [-1, 3, 0]] };
    const cut = cutMesh(cube, [window]);
    expect(blocks(cube, [0, 2, 10], [0, 2, -10])).toBe(true);
    expect(blocks(cut, [0, 2, 10], [0, 2, -10])).toBe(false);
    expect(blocks(cut, [1.5, 2, 10], [1.5, 2, -10])).toBe(true);
    expect(blocks(cut, [10, 2, 0], [-10, 2, 0])).toBe(true);
  });

  it("cuts along any direction, through a concave outline", () => {
    // An L-shaped notch seen from the east, through the cube's top corner.
    const notch = { along: [-1, 0, 0], outline: [[0, 2, -3], [0, 2, 3], [0, 5, 3], [0, 5, 0], [0, 3, 0], [0, 3, -3]] };
    const cut = cutMesh(cube, [notch]);
    expect(blocks(cut, [10, 2.5, 1], [-10, 2.5, 1])).toBe(false);
    expect(blocks(cut, [10, 3.5, 1], [-10, 3.5, 1])).toBe(false);
    expect(blocks(cut, [10, 3.5, -1], [-10, 3.5, -1])).toBe(true);
    expect(blocks(cut, [10, 1, 1], [-10, 1, 1])).toBe(true);
  });

  it("cuts out from a point of view, as it looked from there", () => {
    // Seen from 10 ft out on z, a 1 ft square traced on the plane through the middle covers more
    // of the far face than of the near one.
    const window = { from: [0, 2, 10], outline: [[-0.5, 1.5, 0], [0.5, 1.5, 0], [0.5, 2.5, 0], [-0.5, 2.5, 0]] };
    const cut = cutMesh(cube, [window]);
    expect(blocks(cut, [0, 2, 10], [0, 2, -10])).toBe(false);
    // Along the cone's edge, through the far face's wider hole.
    expect(blocks(cut, [0, 2, 10], [0.55, 2, -2.1])).toBe(false);
    // Straight along z past the near face's narrower hole.
    expect(blocks(cut, [0.55, 2, 10], [0.55, 2, -10])).toBe(true);
  });

  it("is nothing when a cut takes all of it", () => {
    expect(cutMesh(cube, [{ along: [0, 1, 0], outline: [[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]] }])).toBeNull();
  });
});
