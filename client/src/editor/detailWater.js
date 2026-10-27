import { CELL_FT } from "../world/constants.js";
import { makePolyline, nearest, pointAt } from "../world/polyline.js";

// Water placed by hand in the detail step: sources, and channels dug for it to run in.
//
// A source's water runs downhill cell by cell, to the lowest of the eight around it. Where it's
// nowhere lower to go it fills the hollow, rising to the lowest point of its rim, and runs on from
// there. It stops when it meets the sea or other water, or when it's used up: it loses `streamLoss`
// of its flow for each cell it runs through and `poolLoss` for each cell a pool spreads over, so a
// small source makes a puddle or a short trickle and a big one a river. Streams get wider and
// deeper with more flow.
//
// Channels are dug along a drawn line, `depth` ft below the ground and never rising along the way,
// so water runs along them from the end drawn first; their sides slope back up to the ground.

export const WATER = { streamLoss: 0.05, poolLoss: 0.1, maxCells: 200000, depthFt: 0.6, depthPerRoot: 0.12, cellsWidePerRoot: 0.2 };

const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Where a source at cell (ci, cj) with `flow` sends its water. `cells` gives height(ci, cj),
// water(ci, cj) (truthy where there's water already), and inside(ci, cj), whether the water may go
// there. Returns { wet, end }: wet maps "ci,cj" to { surface, dir, slope }, dir being the way it
// runs ([dx, dz], or null where it's still) and slope how steeply; end is "sea or water" where it
// joins other water, "dry" where it's used up, "outside" where it would go where it may not, or
// "limit".
export function traceSource(cells, [ci, cj], flow) {
  const wet = new Map();
  // Cells the water's run through or pooled in, which it won't go back to. Cells a stream only
  // spreads over don't count, so they don't block its way.
  const taken = new Set();
  let left = flow;
  let [x, z] = [ci, cj];
  if (!cells.inside(x, z)) return { wet, end: "outside" };
  if (cells.water(x, z)) return { wet, end: "water" };
  while (wet.size < WATER.maxCells) {
    const here = cells.height(x, z);
    let next = null;
    for (const [dx, dz] of AROUND) {
      const [nx, nz] = [x + dx, z + dz];
      if (taken.has(`${nx},${nz}`)) continue;
      const drop = (here - cells.height(nx, nz)) / Math.hypot(dx, dz);
      if (drop > 0 && (!next || drop > next.drop)) next = { x: nx, z: nz, dx, dz, drop };
    }
    if (next) {
      taken.add(`${x},${z}`);
      stream(cells, wet, [x, z], next, left);
      left -= WATER.streamLoss * Math.hypot(next.dx, next.dz);
      if (left <= 0) return { wet, end: "dry" };
      if (!cells.inside(next.x, next.z)) return { wet, end: "outside" };
      if (cells.water(next.x, next.z)) return { wet, end: "water" };
      [x, z] = [next.x, next.z];
      continue;
    }
    const pool = fill(cells, wet, taken, [x, z], left);
    left = pool.left;
    if (pool.end) return { wet, end: pool.end };
    [x, z] = pool.spill;
  }
  return { wet, end: "limit" };
}

// Marks a stream cell, and the cells beside it as it widens, at the water's surface there.
function stream(cells, wet, [x, z], next, flow) {
  const surface = cells.height(x, z) + WATER.depthFt + WATER.depthPerRoot * Math.sqrt(flow);
  const dir = [next.dx / Math.hypot(next.dx, next.dz), next.dz / Math.hypot(next.dx, next.dz)];
  const reach = Math.floor(WATER.cellsWidePerRoot * Math.sqrt(flow));
  for (let dz = -reach; dz <= reach; dz++) {
    for (let dx = -reach; dx <= reach; dx++) {
      if (Math.hypot(dx, dz) > reach + 0.5) continue;
      const [sx, sz] = [x + dx, z + dz];
      const key = `${sx},${sz}`;
      if (wet.has(key) || cells.height(sx, sz) >= surface || !cells.inside(sx, sz) || cells.water(sx, sz)) continue;
      wet.set(key, { surface, dir, slope: next.drop });
    }
  }
}

// Fills the hollow at (x, z) from the lowest cell up, until it spills over its rim (returning the
// cell it spills to), meets other water or where it may not go, or uses up the flow.
function fill(cells, wet, taken, [x, z], flow) {
  const pool = new Set([`${x},${z}`]);
  let level = cells.height(x, z);
  let left = flow;
  const rim = new Heap();
  const seen = new Set(pool);
  const edge = (px, pz) => {
    for (const [dx, dz] of AROUND) {
      const key = `${px + dx},${pz + dz}`;
      if (seen.has(key) || taken.has(key)) continue;
      seen.add(key);
      rim.push(cells.height(px + dx, pz + dz), [px + dx, pz + dz]);
    }
  };
  edge(x, z);
  let end = null;
  let spill = null;
  while (rim.size) {
    const [h, [rx, rz]] = rim.pop();
    if (!cells.inside(rx, rz)) {
      end = "outside";
      break;
    }
    if (cells.water(rx, rz)) {
      end = "water";
      break;
    }
    if (h < level) {
      spill = [rx, rz];
      break;
    }
    level = h;
    pool.add(`${rx},${rz}`);
    left -= WATER.poolLoss;
    if (left <= 0) {
      end = "dry";
      break;
    }
    edge(rx, rz);
  }
  if (!end && !spill) end = "limit";
  for (const key of pool) {
    taken.add(key);
    const [px, pz] = key.split(",").map(Number);
    if (cells.height(px, pz) < level) wet.set(key, { surface: level, dir: null, slope: 0 });
  }
  return { end, spill, left };
}

// The ground dug for a channel along `points` ([x, z] continent feet), `width` ft across and
// `depth` ft deep, as changes [[ci, cj, h], ...] to editable cells. `cells` gives height(ci, cj)
// and editable(ci, cj).
export function carveChannel(cells, points, { width, depth }) {
  if (points.length < 2) return [];
  const line = makePolyline(points);
  const heightAt = (x, z) => cells.height(Math.floor(x / CELL_FT), Math.floor(z / CELL_FT));
  // The bed along the line, a sample each cell, never rising.
  const count = Math.max(2, Math.ceil(line.length / CELL_FT) + 1);
  const bed = [];
  let deepest = depth;
  for (let n = 0; n < count; n++) {
    const ground = heightAt(...pointAt(line, Math.min(line.length, n * CELL_FT)));
    bed.push(n ? Math.min(ground - depth, bed[n - 1]) : ground - depth);
    deepest = Math.max(deepest, ground - bed[n]);
  }
  const bedAt = (along) => {
    const f = Math.max(0, Math.min(count - 1, along / CELL_FT));
    const i = Math.floor(f);
    return i >= count - 1 ? bed[count - 1] : bed[i] + (bed[i + 1] - bed[i]) * (f - i);
  };
  const half = width / 2;
  // Sides slope back up at 1:1, as far out as the channel's deepest.
  const reach = half + deepest + CELL_FT;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  const changes = [];
  for (let cj = Math.floor((Math.min(...zs) - reach) / CELL_FT); cj <= Math.floor((Math.max(...zs) + reach) / CELL_FT); cj++) {
    for (let ci = Math.floor((Math.min(...xs) - reach) / CELL_FT); ci <= Math.floor((Math.max(...xs) + reach) / CELL_FT); ci++) {
      if (!cells.editable(ci, cj)) continue;
      const n = nearest(line, (ci + 0.5) * CELL_FT, (cj + 0.5) * CELL_FT);
      if (n.dist > reach) continue;
      const target = bedAt(n.along) + Math.max(0, n.dist - half);
      const h = cells.height(ci, cj);
      if (target < h) changes.push([ci, cj, target]);
    }
  }
  return changes;
}

// A min-heap of [key, value] pairs.
class Heap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(key, value) {
    const items = this.items;
    items.push([key, value]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const [l, r] = [2 * i + 1, 2 * i + 2];
        let least = i;
        if (l < items.length && items[l][0] < items[least][0]) least = l;
        if (r < items.length && items[r][0] < items[least][0]) least = r;
        if (least === i) break;
        [items[least], items[i]] = [items[i], items[least]];
        i = least;
      }
    }
    return top;
  }
}
