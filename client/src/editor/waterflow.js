import { TILE_FT } from "../world/constants.js";

// Where water from a source goes. It steps across a lattice STEP_FT apart, always to the
// neighbour it drops to most steeply. Where nothing's lower it fills the hollow, lowest ground
// first, until the water finds a way out over the rim (and flows on from there) or the pool
// reaches its size limit (and the water stops there). It stops on reaching water that's already
// there: the sea, swamp pools, ponds, and rivers and pools already confirmed.
//
// A source's `width` (ft) is the river's width, and sets how big a pool it can fill: up to
// POOL_ACROSS times as wide.

const STEP_FT = 16;
export const POOL_ACROSS = 40;
const MIN_POOL_DEPTH_FT = 1; // shallower hollows are waded through, not kept as pools
const MAX_STEPS = 50000;
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// source: [x, z] in tile units. heightAt(xFt, zFt): the ground. isWater(xFt, zFt): whether there's
// water there already. Returns { rivers, pools, end }: the river's stretches between pools, each
// as points ([x, z] tile units); the pools it filled ({ region, level }, region as polygons of
// rings in tile units, level in ft); and how it ended: "water" (it reached water), "pool" (a pool
// hit its size limit), "flat" (it spread out over level ground) or "lost" (it ran out of steps).
export function simulateFlow({ source, width, heightAt, isWater }) {
  const maxCells = (Math.PI / 4) * ((width * POOL_ACROSS) / STEP_FT) ** 2;
  const key = (i, j) => `${i},${j}`;
  const heights = new Map();
  const ground = (i, j) => {
    const k = key(i, j);
    if (!heights.has(k)) heights.set(k, heightAt(i * STEP_FT, j * STEP_FT));
    return heights.get(k);
  };
  const filled = new Map(); // cell key -> the water level of a pool over it
  const height = (i, j) => Math.max(ground(i, j), filled.get(key(i, j)) ?? -Infinity);
  const wet = new Map();
  const water = (i, j) => {
    const k = key(i, j);
    if (!wet.has(k)) wet.set(k, isWater(i * STEP_FT, j * STEP_FT));
    return wet.get(k);
  };

  let [i, j] = source.map((v) => Math.round((v * TILE_FT) / STEP_FT));
  const path = [[i, j]];
  const pools = [];
  let end = "lost";
  for (let steps = 0; steps < MAX_STEPS; steps++) {
    if (water(i, j)) {
      end = "water";
      break;
    }
    const here = height(i, j);
    let best = null;
    let bestDrop = 0;
    for (const [di, dj] of NEIGHBOURS) {
      const drop = (here - height(i + di, j + dj)) / Math.hypot(di, dj);
      if (drop > bestDrop) [best, bestDrop] = [[i + di, j + dj], drop];
    }
    if (best) {
      [i, j] = best;
      path.push(best);
      continue;
    }

    const pool = fill(i, j, { height, ground, water, maxCells, key });
    for (const [pi, pj] of pool.cells) filled.set(key(pi, pj), pool.level);
    const deep = pool.depth >= MIN_POOL_DEPTH_FT;
    if (deep) pools.push({ region: outline(pool.cells), level: pool.level });
    if (!pool.out) {
      end = pool.wet ? "water" : deep ? "pool" : "flat";
      break;
    }
    // Water leaves a pool from its outlet, as a new stretch of river, and wades across a hollow
    // too shallow to keep.
    if (deep) path.push(null, pool.out);
    else path.push(...wade(pool.cells, [i, j], pool.out, key).slice(1));
    [i, j] = pool.out;
  }

  const rivers = stretches(path).map((stretch) => smooth(stretch).map(([x, z]) => [round((x * STEP_FT) / TILE_FT), round((z * STEP_FT) / TILE_FT)]));
  return { rivers: rivers.filter((r) => r.length >= 2), pools, end };
}

// Fills the hollow at (i, j), lowest neighbour first, as a priority flood. Stops when the next
// lowest cell around the pool is lower than the water (the outlet), is water already, or the pool
// has maxCells cells. Returns { cells, level, depth, out, wet }.
function fill(i, j, { height, ground, water, maxCells, key }) {
  const inPool = new Set([key(i, j)]);
  const cells = [[i, j]];
  const edge = new Heap();
  const queued = new Set(inPool);
  const queue = (ci, cj) => {
    for (const [di, dj] of NEIGHBOURS) {
      const [ni, nj] = [ci + di, cj + dj];
      const k = key(ni, nj);
      if (queued.has(k)) continue;
      queued.add(k);
      edge.push(height(ni, nj), [ni, nj]);
    }
  };
  let level = height(i, j);
  const bottom = ground(i, j);
  queue(i, j);
  while (edge.size) {
    const [h, [ni, nj]] = edge.pop();
    if (water(ni, nj)) return { cells, level, depth: level - bottom, out: null, wet: true };
    if (h < level) return { cells, level, depth: level - bottom, out: [ni, nj], wet: false };
    if (cells.length >= maxCells) break;
    level = h;
    inPool.add(key(ni, nj));
    cells.push([ni, nj]);
    queue(ni, nj);
  }
  return { cells, level, depth: level - bottom, out: null, wet: false };
}

// A way across a shallow pool's cells, from where the water came in to its outlet.
function wade(cells, from, to, key) {
  const inside = new Set(cells.map(([i, j]) => key(i, j)));
  inside.add(key(...to));
  const back = new Map([[key(...from), null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (key(...at) === key(...to)) break;
    for (const [di, dj] of NEIGHBOURS) {
      const next = [at[0] + di, at[1] + dj];
      if (!inside.has(key(...next)) || back.has(key(...next))) continue;
      back.set(key(...next), at);
      queue.push(next);
    }
  }
  const way = [];
  for (let at = to; at; at = back.get(key(...at))) way.unshift(at);
  return way;
}

// The path split at its breaks (null), where it crossed a pool.
function stretches(path) {
  const out = [[]];
  for (const p of path) {
    if (p) out[out.length - 1].push(p);
    else out.push([]);
  }
  return out;
}

// The lattice's zig-zags rounded off, keeping the ends.
function smooth(points, passes = 2) {
  let pts = points;
  for (let n = 0; n < passes && pts.length > 2; n++) {
    const next = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      if (k > 0) next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      if (k < pts.length - 2) next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

// The outline of a set of lattice cells (each a STEP_FT square round its point), as polygons of
// rings in tile units: an outer ring, then any islands, each rounded off a little.
export function outline(cells) {
  const key = (i, j) => `${i},${j}`;
  const inside = new Set(cells.map(([i, j]) => key(i, j)));
  // Each cell side with open ground beyond it, running clockwise round the cells (x east, z
  // south), from corner to corner. Corner (i, j) is the cell's top-left.
  const edges = new Map();
  const add = (a, b) => {
    const k = key(...a);
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (const [i, j] of cells) {
    if (!inside.has(key(i, j - 1))) add([i, j], [i + 1, j]);
    if (!inside.has(key(i + 1, j))) add([i + 1, j], [i + 1, j + 1]);
    if (!inside.has(key(i, j + 1))) add([i + 1, j + 1], [i, j + 1]);
    if (!inside.has(key(i - 1, j))) add([i, j + 1], [i, j]);
  }
  const rings = [];
  for (const [start, ends] of edges) {
    while (ends.length) {
      const ring = [];
      let at = start.split(",").map(Number);
      do {
        ring.push(at);
        const out = edges.get(key(...at));
        at = out.pop();
      } while (key(...at) !== start);
      rings.push(ring);
    }
  }
  const toTiles = (ring) => smoothRing(dropStraights(ring)).map(([x, z]) => [round(((x - 0.5) * STEP_FT) / TILE_FT), round(((z - 0.5) * STEP_FT) / TILE_FT)]);
  // Clockwise on screen (positive area with z south) goes round the outside of the cells.
  const outers = rings.filter((r) => area(r) > 0);
  const holes = rings.filter((r) => area(r) < 0);
  return outers.map((outer) => [toTiles(outer), ...holes.filter((h) => inRing(h[0], outer)).map(toTiles)]);
}

function dropStraights(ring) {
  return ring.filter((p, k) => {
    const a = ring[(k + ring.length - 1) % ring.length];
    const b = ring[(k + 1) % ring.length];
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
  });
}

function smoothRing(ring) {
  return ring.flatMap((a, k) => {
    const b = ring[(k + 1) % ring.length];
    return [[0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]];
  });
}

function area(ring) {
  let sum = 0;
  ring.forEach(([x0, z0], k) => {
    const [x1, z1] = ring[(k + 1) % ring.length];
    sum += x0 * z1 - x1 * z0;
  });
  return sum / 2;
}

function inRing([x, z], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const round = (v) => Math.round(v * 1000) / 1000;

// A min-heap of [priority, value].
class Heap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(priority, value) {
    const items = this.items;
    items.push([priority, value]);
    let k = items.length - 1;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (items[parent][0] <= items[k][0]) break;
      [items[parent], items[k]] = [items[k], items[parent]];
      k = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length) {
      items[0] = last;
      let k = 0;
      for (;;) {
        const [l, r] = [2 * k + 1, 2 * k + 2];
        let m = k;
        if (l < items.length && items[l][0] < items[m][0]) m = l;
        if (r < items.length && items[r][0] < items[m][0]) m = r;
        if (m === k) break;
        [items[m], items[k]] = [items[k], items[m]];
        k = m;
      }
    }
    return top;
  }
}

// Runs simulateFlow in a worker (waterflowWorker.js), one source at a time. A source asked about
// again before its turn only runs once, with the latest request. onResult(id, key, result) hears
// each answer.
export class FlowSimulator {
  constructor(onResult) {
    this.onResult = onResult;
    this.worker = null;
    this.busy = false;
    this.queue = new Map(); // source id -> message
  }

  // message: { id, key, continent: { zones, pins }, seedKey, source, width, water: { rivers, pools } }
  request(message) {
    this.queue.set(message.id, structuredClone(message));
    if (!this.busy) this.send();
  }

  send() {
    const [first] = this.queue.values();
    if (!first) return;
    this.queue.delete(first.id);
    this.busy = true;
    if (!this.worker) {
      this.worker = new Worker(new URL("./waterflowWorker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        this.onResult(data.id, data.key, data.result);
        this.send();
      };
      this.worker.onerror = (e) => {
        this.busy = false;
        console.warn(`water flow failed: ${e.message}`);
      };
    }
    this.worker.postMessage(first);
  }
}
