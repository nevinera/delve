import { NAV_FT, WADE } from "./navGrid.js";

const WADE_COST = 1.8;
const MAX_EXPANSIONS = 250_000;
const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

let scratch = null;

// A* over the nav grid for a unit of the given radius: a square is usable
// if its clearance fits the radius. Wading costs extra. Returns a smoothed
// list of {x, z} waypoints (excluding the start), or null.
export function findPath(nav, from, to, radius) {
  const start = nav.squareAt(from.x, from.z);
  let goal = nearestStandable(nav, to.x, to.z, radius);
  if (start < 0 || goal < 0) return null;
  const {w, h, clearance, walk} = nav;
  const n = w * h;
  if (!scratch || scratch.n !== n) {
    scratch = {n, g: new Float32Array(n), came: new Int32Array(n), seen: new Uint32Array(n), closed: new Uint32Array(n), stamp: 0};
  }
  const s = scratch;
  s.stamp++;
  const gx = goal % w, gz = (goal / w) | 0;
  const heuristic = (i) => {
    const dx = Math.abs((i % w) - gx), dz = Math.abs(((i / w) | 0) - gz);
    return dx + dz + (SQRT2 - 2) * Math.min(dx, dz);
  };
  const heap = new MinHeap();
  s.g[start] = 0;
  s.came[start] = -1;
  s.seen[start] = s.stamp;
  heap.push(start, heuristic(start));
  let expansions = 0;
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (s.closed[cur] === s.stamp) continue;
    s.closed[cur] = s.stamp;
    if (cur === goal) {
      found = true;
      break;
    }
    if (++expansions > MAX_EXPANSIONS) break;
    const cx = cur % w, cz = (cur / w) | 0;
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const ni = nz * w + nx;
      if (clearance[ni] < radius || s.closed[ni] === s.stamp) continue;
      // no cutting corners past something solid
      if (dx && dz && (clearance[cz * w + nx] < radius || clearance[nz * w + cx] < radius)) continue;
      const step = (dx && dz ? SQRT2 : 1) * (walk[ni] === WADE ? WADE_COST : 1);
      const g = s.g[cur] + step;
      if (s.seen[ni] === s.stamp && g >= s.g[ni]) continue;
      s.seen[ni] = s.stamp;
      s.g[ni] = g;
      s.came[ni] = cur;
      heap.push(ni, g + heuristic(ni));
    }
  }
  if (!found) return null;
  const squares = [];
  for (let i = goal; i !== -1; i = s.came[i]) squares.push(i);
  squares.reverse();
  const points = squares.map((i) => ({x: ((i % w) + 0.5) * NAV_FT, z: (((i / w) | 0) + 0.5) * NAV_FT}));
  points[0] = {x: from.x, z: from.z};
  return smoothPath(nav, points, radius).slice(1);
}

// Greedy string-pulling: skip ahead to the farthest waypoint reachable in a
// straight line that stays on usable squares and doesn't add wading.
export function smoothPath(nav, points, radius) {
  if (points.length <= 2) return points;
  const out = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !straightWalkable(nav, points[i], points[j], radius)) j--;
    out.push(points[j]);
    i = j;
  }
  return out;
}

export function straightWalkable(nav, a, b, radius) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(len / (NAV_FT / 2)));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const i = nav.squareAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
    if (i < 0 || nav.clearance[i] < radius || nav.walk[i] === WADE) return false;
  }
  return true;
}

export function nearestStandable(nav, x, z, radius, maxRing = 12) {
  const sx = Math.floor(x / NAV_FT), sz = Math.floor(z / NAV_FT);
  for (let ring = 0; ring <= maxRing; ring++) {
    let best = -1, bestD = Infinity;
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const nx = sx + dx, nz = sz + dz;
        if (nx < 0 || nz < 0 || nx >= nav.w || nz >= nav.h) continue;
        const i = nz * nav.w + nx;
        if (nav.clearance[i] >= radius && dx * dx + dz * dz < bestD) {
          best = i;
          bestD = dx * dx + dz * dz;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, key) {
    const {items, keys} = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop() {
    const {items, keys} = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      let i = 0;
      const n = items.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
