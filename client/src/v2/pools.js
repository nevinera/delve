// Pools a course fills where it runs through a low spot, rather than cutting through the rise
// below it (courses.js, with ripple on): its water stands in the low spot up to where it would
// spill out, as a pond, kept with the course as { level, from, to, points }, its outline round
// the ground under its level.

const STEP_FT = 4; // how far apart the ground's looked at
const MOST_CELLS = 20000; // how much ground a pool covers at most, in STEP_FT squares
const REACH_FT = 600; // and how far it reaches from where it's filled from
const SPILL_UNDER_FT = 0.5; // how far under where it'd spill a pool stands
const OUTLINE_FT = 2; // how far its outline may stray from the cells round it, to keep it short

// The pool the ground, groundAt(x, z) (null where it's not known), holds from (x, z), filled
// higher than `low`, at most to `most`: { level, points }, its outline, or null where it'd spill
// lower. It's filled till it'd reach where the ground isn't known, or REACH_FT away, or cover
// MOST_CELLS, and stands SPILL_UNDER_FT under where it does: it'd spill out there.
export function poolAt(groundAt, x, z, low, most) {
  const span = Math.ceil(REACH_FT / STEP_FT);
  const size = span * 2 + 1;
  const heights = new Float32Array(size * size).fill(NaN);
  const heightOf = (k) => {
    if (Number.isNaN(heights[k])) heights[k] = groundAt(x + ((k % size) - span) * STEP_FT, z + (Math.floor(k / size) - span) * STEP_FT) ?? -Infinity;
    return heights[k];
  };
  // Filled from the lowest ground next to what's filled, till it spills.
  const seen = new Uint8Array(size * size);
  const heap = new Heap();
  const start = span * size + span;
  seen[start] = 1;
  heap.push(start, heightOf(start));
  let [level, cells] = [-Infinity, 0];
  let spill = most;
  while (heap.size) {
    const [k, h] = heap.pop();
    if (h === -Infinity) {
      spill = Math.min(most, level - SPILL_UNDER_FT);
      break;
    }
    if (h > level) level = h;
    if (level >= most) break;
    if (++cells > MOST_CELLS) {
      spill = Math.min(most, level - SPILL_UNDER_FT);
      break;
    }
    const [i, j] = [k % size, Math.floor(k / size)];
    if (i === 0 || j === 0 || i === size - 1 || j === size - 1) {
      spill = Math.min(most, level - SPILL_UNDER_FT);
      break;
    }
    for (const n of [k - 1, k + 1, k - size, k + size]) {
      if (seen[n]) continue;
      seen[n] = 1;
      heap.push(n, heightOf(n));
    }
  }
  if (!(spill > low) || !(heightOf(start) < spill)) return null;
  // What's under that level, from where it's filled.
  const wet = new Uint8Array(size * size);
  const queue = [start];
  wet[start] = 1;
  while (queue.length) {
    const k = queue.pop();
    for (const n of [k - 1, k + 1, k - size, k + size]) {
      if (wet[n] || n % size === 0 || n % size === size - 1 || n < size || n >= size * (size - 1)) continue;
      if (!(heightOf(n) < spill)) continue;
      wet[n] = 1;
      queue.push(n);
    }
  }
  const outline = outlineOf(wet, size).map(([i, j]) => [Math.round((x + (i - span) * STEP_FT) * 10) / 10, Math.round((z + (j - span) * STEP_FT) * 10) / 10]);
  return { level: Math.round(spill * 10) / 10, points: simplify(outline, OUTLINE_FT) };
}

// The outline round the cells set in `mask` (size × size, row order) reached from the first set,
// through the middles of the cells round them, as [[i, j], ...].
function outlineOf(mask, size) {
  // Round the cells next to it too, so the outline's on ground over its level.
  const around = new Uint8Array(size * size);
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    for (const n of [k, k - 1, k + 1, k - size, k + size, k - size - 1, k - size + 1, k + size - 1, k + size + 1]) around[n] = 1;
  }
  // Round its edge, keeping it on the left: Moore's tracing, from its first cell.
  const first = around.indexOf(1);
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const set = (i, j) => i >= 0 && j >= 0 && i < size && j < size && around[j * size + i] === 1;
  const points = [];
  let [i, j] = [first % size, Math.floor(first / size)];
  let dir = 6; // came in heading up, as nothing's above the first
  for (let steps = 0; steps < size * size * 4; steps++) {
    points.push([i, j]);
    let moved = false;
    for (let turn = 0; turn < 8; turn++) {
      const d = (dir + 6 + turn) % 8;
      const [ni, nj] = [i + DIRS[d][0], j + DIRS[d][1]];
      if (!set(ni, nj)) continue;
      [i, j, dir, moved] = [ni, nj, d, true];
      break;
    }
    if (!moved || (i === first % size && j === Math.floor(first / size))) break;
  }
  return points;
}

// `points`, a closed outline, with points left out where it strays no more than `tolerance` from
// the line without them (Douglas-Peucker).
function simplify(points, tolerance) {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  const away = ([x, z], [ax, az], [bx, bz]) => {
    const [dx, dz] = [bx - ax, bz - az];
    const length = Math.hypot(dx, dz);
    return length ? Math.abs(dx * (z - az) - dz * (x - ax)) / length : Math.hypot(x - ax, z - az);
  };
  const split = (a, b) => {
    let [far, at] = [0, -1];
    for (let k = a + 1; k < b; k++) {
      const d = away(points[k], points[a], points[b]);
      if (d > far) [far, at] = [d, k];
    }
    if (far <= tolerance) return;
    keep[at] = 1;
    split(a, at);
    split(at, b);
  };
  // Split at the point furthest from the first, so the closed outline's two halves are each open.
  let [far, half] = [0, 1];
  for (let k = 1; k < points.length; k++) {
    const d = Math.hypot(points[k][0] - points[0][0], points[k][1] - points[0][1]);
    if (d > far) [far, half] = [d, k];
  }
  keep[0] = keep[half] = 1;
  split(0, half);
  split(half, points.length - 1);
  keep[points.length - 1] = 1;
  return points.filter((_, k) => keep[k]);
}

// A binary heap of indexes by their heights, lowest first.
class Heap {
  constructor() {
    [this.keys, this.values, this.size] = [[], [], 0];
  }

  push(key, value) {
    let n = this.size++;
    while (n > 0) {
      const up = (n - 1) >> 1;
      if (this.values[up] <= value) break;
      [this.keys[n], this.values[n]] = [this.keys[up], this.values[up]];
      n = up;
    }
    [this.keys[n], this.values[n]] = [key, value];
  }

  pop() {
    const top = [this.keys[0], this.values[0]];
    const [key, value] = [this.keys[--this.size], this.values[this.size]];
    let n = 0;
    for (;;) {
      let child = 2 * n + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.values[child + 1] < this.values[child]) child++;
      if (this.values[child] >= value) break;
      [this.keys[n], this.values[n]] = [this.keys[child], this.values[child]];
      n = child;
    }
    [this.keys[n], this.values[n]] = [key, value];
    return top;
  }
}
