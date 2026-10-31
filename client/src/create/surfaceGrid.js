import { turnPoint } from "../world/builtObjects.js";
import { unturned } from "../world/slabs.js";

// The build tools' grid. On a run of slabs (a floor or wall made of many, all in one plane) it lies
// across the run's face, centered on it, its lines every `minor` feet both ways from the middle and
// every MAJOR-th line a major one. On the ground it's square to north, its lines on multiples of
// `minor`, the majors on multiples of MAJOR of them.

export const MAJOR = 4;
const NEAR = 0.05; // feet apart that still count as meeting, or in one plane

// The run of slabs `slab` is in: those in its plane, turned and as thick as it, overlapping or
// meeting edge to edge, found from it through near(x, z) (the slabs round a point). Gives
// { slab, slabs, box: [u0, v0, u1, v1] }, the box round them all in slab's frame.
export function planeRun(slab, near) {
  const boxOf = (s) => {
    const points = s.outline.map(([u, v]) => unturned(slab, add(s.at, turnPoint([u, 0, v], s.turn))));
    const us = points.map((p) => p[0]);
    const vs = points.map((p) => p[2]);
    return [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
  };
  const alike = (s) => s.kind === undefined && s.turn.every((d, i) => Math.abs((((d - slab.turn[i]) % 360) + 540) % 360 - 180) < 0.01) && Math.abs(s.thickness - slab.thickness) < 0.01 && Math.abs(unturned(slab, s.at)[1]) < NEAR;
  const meet = (a, b) => a[0] <= b[2] + NEAR && b[0] <= a[2] + NEAR && a[1] <= b[3] + NEAR && b[1] <= a[3] + NEAR;
  const boxes = new Map([[slab, boxOf(slab)]]);
  const queue = [slab];
  while (queue.length) {
    const s = queue.shift();
    for (const other of near(s.at[0], s.at[2])) {
      if (boxes.has(other) || !alike(other)) continue;
      const box = boxOf(other);
      if (!meet(box, boxes.get(s))) continue;
      boxes.set(other, box);
      queue.push(other);
    }
  }
  const all = [...boxes.values()];
  const box = [0, 1].map((i) => Math.min(...all.map((b) => b[i]))).concat([2, 3].map((i) => Math.max(...all.map((b) => b[i]))));
  return { slab, slabs: [...boxes.keys()], box };
}

// Where a run's grid lines are: { us, vs }, each [{ at, major }] in the run's frame.
export function runLines([u0, v0, u1, v1], minor) {
  const lines = (lo, hi) => {
    const middle = (lo + hi) / 2;
    const out = [];
    for (let k = -Math.floor((middle - lo) / minor + 1e-9); middle + k * minor <= hi + 1e-9; k++) out.push({ at: middle + k * minor, major: k % MAJOR === 0 });
    return out;
  };
  return { us: lines(u0, u1), vs: lines(v0, v1) };
}

// [u, v] in a run's frame moved onto its grid's nearest crossing.
export function snapInRun([u0, v0, u1, v1], [u, v], minor) {
  const near = (x, lo, hi) => (lo + hi) / 2 + Math.round((x - (lo + hi) / 2) / minor) * minor;
  return [near(u, u0, u1), near(v, v0, v1)];
}

// A run-frame point [u, h, v] in continent feet.
export function runPoint(run, [u, h, v]) {
  return add(run.slab.at, turnPoint([u, h, v], run.slab.turn));
}

const add = (p, q) => p.map((v, i) => v + q[i]);
