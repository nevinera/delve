import { TILE_FT } from "../world/constants.js";
import { fbm, hashString } from "../world/noise.js";
import { simplify } from "../world/polyline.js";

// Where the water from a continent's sources goes. It steps across a lattice STEP_FT apart, always
// to the neighbour it drops to most steeply. Where nothing's lower it fills the hollow, lowest
// ground first, until the water finds a way out over the rim (and flows on from there) or the pool
// reaches its size limit (and the water stops there). It stops on reaching water that's already
// there: the sea, swamp pools, ponds and lakes.
//
// Sources run highest first. Water that reaches another source's river or pool joins it, and
// everything downstream carries both: rivers widen, and a pool that had reached its limit grows,
// and may spill over and flow on. Flow is counted as width squared, so a source's `width` (ft) is
// its river's width, and joined rivers are as wide as the square root of their flows added up. A
// pool can grow up to POOL_ACROSS times as wide as the river feeding it.
//
// River courses are smoothed out of the lattice's zig-zags, and meander where the ground is flat.

const STEP_FT = 16;
export const POOL_ACROSS = 40;
const MIN_POOL_DEPTH_FT = 1; // shallower hollows are waded through, not kept as pools
const MAX_STEPS = 500000; // across every source, so a bad case still ends
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// Meanders: up to `widths` river widths (between minFt and maxFt) to either side, where the ground
// falls less than `flat` ft per ft, fading out by `steep`. Each bend is `wavelength` widths long
// (between minWaveFt and maxWaveFt). Points are `spacingFt` apart, and courses are evened out over
// `bendWidths` river widths (at least minBendFt) either side, so turns are gentle curves.
const MEANDER = { widths: 2, minFt: 24, maxFt: 160, flat: 0.004, steep: 0.03, wavelength: 14, minWaveFt: 320, maxWaveFt: 1600, spacingFt: 16, bendWidths: 3, minBendFt: 64 };
const SLOPE_REACH = 4; // cells either side for a river's local slope

// sources: [{ id, at: [x, z] tile units, width }]. heightAt(xFt, zFt): the ground. isWater(xFt,
// zFt): whether there's water there already. seed: for the meanders. Returns { rivers, pools,
// ends }: rivers as { points ([x, z] tile units), width }, split where their width changes; pools
// as { region, level }, region as polygons of rings in tile units and level in ft; and how each
// source's water ends up, by id, following it through rivers it joins and pools it spills from:
// "water" (it reaches water), "pool" (it stops in a pool at its size limit), "flat" (it spreads
// out over level ground) or "lost" (it ran out of steps).
export function simulateWater({ sources, heightAt, isWater, seed = 0 }) {
  const key = ([i, j]) => `${i},${j}`;
  const heights = new Map();
  const ground = (c) => {
    const k = key(c);
    if (!heights.has(k)) heights.set(k, heightAt(c[0] * STEP_FT, c[1] * STEP_FT));
    return heights.get(k);
  };
  const poolAt = new Map(); // cell key -> the pool over it
  const height = (c) => Math.max(ground(c), poolAt.get(key(c))?.level ?? -Infinity);
  const wet = new Map();
  const water = (c) => {
    const k = key(c);
    if (!wet.has(k)) wet.set(k, isWater(c[0] * STEP_FT, c[1] * STEP_FT));
    return wet.get(k);
  };
  const next = new Map(); // cell key -> the cell its water flows on to
  const flow = new Map(); // cell key -> the flow through it (width squared)
  const add = (c, q) => flow.set(key(c), (flow.get(key(c)) ?? 0) + q);
  const pools = [];
  const starts = []; // where rivers begin: sources, and the outlets of pools deep enough to keep
  let steps = 0;

  // Water with flow q, from cell c down to wherever it ends.
  const run = (c, q, start = true) => {
    if (flow.has(key(c)) || poolAt.has(key(c))) return join(c, q);
    if (start) starts.push(c);
    for (; steps < MAX_STEPS; steps++) {
      if (water(c)) return;
      add(c, q);
      const here = height(c);
      let best = null;
      let bestDrop = 0;
      for (const [di, dj] of NEIGHBOURS) {
        const n = [c[0] + di, c[1] + dj];
        const drop = (here - height(n)) / Math.hypot(di, dj);
        if (drop > bestDrop) [best, bestDrop] = [n, drop];
      }
      if (!best) {
        const pool = { cells: [], level: here, bottom: ground(c), q, edge: new Heap(), queued: new Set(), outlet: null, wet: false };
        pools.push(pool);
        take(pool, c);
        return settle(pool);
      }
      next.set(key(c), best);
      if (flow.has(key(best)) || poolAt.has(key(best))) return join(best, q);
      c = best;
    }
  };

  // Water with flow q joining the river or pool at cell c: everything downstream carries it too.
  const join = (c, q) => {
    const seen = new Set();
    while (!seen.has(key(c)) && steps++ < MAX_STEPS) {
      seen.add(key(c));
      const pool = poolAt.get(key(c));
      if (pool) {
        pool.q += q;
        if (pool.wet) return;
        if (!pool.outlet) return settle(pool);
        for (const w of pool.wade?.slice(0, -1) ?? []) add(w, q);
        c = pool.outlet;
        continue;
      }
      if (!flow.has(key(c))) return;
      add(c, q);
      const n = next.get(key(c));
      if (!n) return;
      c = n;
    }
  };

  const take = (pool, c) => {
    pool.cells.push(c);
    poolAt.set(key(c), pool);
    pool.queued.add(key(c));
    for (const [di, dj] of NEIGHBOURS) {
      const n = [c[0] + di, c[1] + dj];
      if (pool.queued.has(key(n))) continue;
      pool.queued.add(key(n));
      pool.edge.push(height(n), n);
    }
  };

  // Fills the pool, lowest ground round it first, as a priority flood, until the next lowest cell
  // round it is lower than the water (its outlet), is water already, or the pool's as big as its
  // flow lets it get. Then sends the water on from the outlet.
  const settle = (pool) => {
    const maxCells = (Math.PI / 4) * ((Math.sqrt(pool.q) * POOL_ACROSS) / STEP_FT) ** 2;
    while (pool.edge.size && pool.cells.length < maxCells && steps++ < MAX_STEPS) {
      const [h, n] = pool.edge.pop();
      if (water(n)) {
        pool.wet = true;
        return;
      }
      if (h < pool.level) {
        pool.outlet = n;
        break;
      }
      pool.level = h;
      take(pool, n);
    }
    if (!pool.outlet) return;
    if (pool.level - pool.bottom >= MIN_POOL_DEPTH_FT) return run(pool.outlet, pool.q);
    // Too shallow to keep: the river wades across it from its lowest point to the outlet.
    pool.wade = wade(pool.cells, pool.cells[0], pool.outlet, key);
    for (let k = 0; k < pool.wade.length - 1; k++) next.set(key(pool.wade[k]), pool.wade[k + 1]);
    pool.wade.slice(1, -1).forEach((w) => add(w, pool.q));
    return run(pool.outlet, pool.q, false);
  };

  // Where the water at cell c ends up.
  const endOf = (c) => {
    const seen = new Set();
    while (!seen.has(key(c))) {
      seen.add(key(c));
      const pool = poolAt.get(key(c));
      if (pool?.outlet) c = pool.outlet;
      else if (pool) return pool.wet ? "water" : pool.level - pool.bottom >= MIN_POOL_DEPTH_FT ? "pool" : "flat";
      else if (!flow.has(key(c))) return "water";
      else if (next.has(key(c))) c = next.get(key(c));
      else return "lost";
    }
    return "lost";
  };

  const placed = sources.filter((s) => s.width > 0).map((s) => ({ ...s, cell: s.at.map((v) => Math.round((v * TILE_FT) / STEP_FT)) }));
  placed.sort((a, b) => ground(b.cell) - ground(a.cell));
  for (const s of placed) run(s.cell, s.width ** 2);
  const ends = Object.fromEntries(placed.map((s) => [s.id, endOf(s.cell)]));

  const rivers = courses(starts, next, flow, key).map(({ cells, q }) => ({
    points: shape(cells, Math.sqrt(q), ground, seed).map(([x, z]) => [round(x / TILE_FT), round(z / TILE_FT)]),
    width: Math.round(Math.sqrt(q) * 10) / 10,
  }));
  return {
    rivers: rivers.filter((r) => r.points.length >= 2),
    pools: pools.filter((p) => p.level - p.bottom >= MIN_POOL_DEPTH_FT).map((p) => ({ region: outline(p.cells), level: Math.round(p.level * 10) / 10 })),
    ends,
  };
}

// The rivers as runs of cells with the same flow, each { cells, q }. A run ends where the flow
// changes (where another river joins), sharing its last cell with the run after it, or where it
// reaches water, a pool, or a river already followed.
function courses(starts, next, flow, key) {
  const runs = [];
  const done = new Set();
  for (const start of starts) {
    if (done.has(key(start))) continue;
    let cells = [start];
    let c = start;
    for (;;) {
      done.add(key(c));
      const n = next.get(key(c));
      if (!n) break;
      cells.push(n);
      if (done.has(key(n)) || !flow.has(key(n))) break;
      if (flow.get(key(n)) !== flow.get(key(c))) {
        runs.push({ cells, q: flow.get(key(c)) });
        cells = [n];
      }
      c = n;
    }
    runs.push({ cells, q: flow.get(key(cells[0])) });
  }
  return runs;
}

// A run of cells as a river's course in ft: straightened where the lattice zig-zags, given bends
// where the ground's flat, and rounded off. Its ends stay put, so joined rivers still meet.
function shape(cells, width, ground, seed) {
  const pts = simplify(cells.map(([i, j]) => [i * STEP_FT, j * STEP_FT]), STEP_FT * 0.75);
  // The ground's fall at each cell, over a few cells either way.
  const slope = cells.map((_, k) => {
    const [a, b] = [Math.max(0, k - SLOPE_REACH), Math.min(cells.length - 1, k + SLOPE_REACH)];
    return b > a ? Math.abs(ground(cells[a]) - ground(cells[b])) / ((b - a) * STEP_FT) : 0;
  });
  const bend = Math.round(Math.max(MEANDER.minBendFt, width * MEANDER.bendWidths) / MEANDER.spacingFt);
  const line = relax(resample(pts, MEANDER.spacingFt), bend);
  const total = line.length > 1 ? line[line.length - 1].along : 0;
  const wavelength = clamp(width * MEANDER.wavelength, MEANDER.minWaveFt, MEANDER.maxWaveFt);
  const reach = clamp(width * MEANDER.widths, MEANDER.minFt, MEANDER.maxFt);
  const bendSeed = seed ^ hashString(cells[0].join(","));
  const bent = line.map(({ p, along }, k) => {
    if (k === 0 || k === line.length - 1) return p;
    const [ax, az] = line[k - 1].p;
    const [bx, bz] = line[k + 1].p;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const flat = 1 - smoothstep(MEANDER.flat, MEANDER.steep, slope[Math.round((along / total) * (cells.length - 1))]);
    const taper = smoothstep(0, wavelength / 2, along) * smoothstep(0, wavelength / 2, total - along);
    const off = fbm(along, 0, bendSeed, { wavelength, octaves: 1 }) * 2 * reach * flat * taper;
    return [p[0] + (-(bz - az) / len) * off, p[1] + ((bx - ax) / len) * off];
  });
  return smooth(relax(bent.map((p, k) => ({ p, along: line[k].along })), bend).map(({ p }) => p), 2);
}

// Each point moved to the average of those up to `reach` points either side of it, fewer near the
// ends, so the ends stay put.
function relax(line, reach) {
  return line.map(({ along }, k) => {
    const r = Math.min(reach, k, line.length - 1 - k);
    let [x, z] = [0, 0];
    for (let m = k - r; m <= k + r; m++) [x, z] = [x + line[m].p[0], z + line[m].p[1]];
    return { p: [x / (2 * r + 1), z / (2 * r + 1)], along };
  });
}

// Points about `spacing` apart along a polyline, each { p, along }.
function resample(pts, spacing) {
  const out = [{ p: pts[0], along: 0 }];
  let along = 0;
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1], pts[k]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / spacing));
    for (let s = 1; s <= n; s++) out.push({ p: [a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n], along: along + (len * s) / n });
    along += len;
  }
  return out;
}

// A way across a shallow pool's cells, from its lowest point to its outlet.
function wade(cells, from, to, key) {
  const inside = new Set(cells.map(key));
  inside.add(key(to));
  const back = new Map([[key(from), null]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift();
    if (key(at) === key(to)) break;
    for (const [di, dj] of NEIGHBOURS) {
      const n = [at[0] + di, at[1] + dj];
      if (!inside.has(key(n)) || back.has(key(n))) continue;
      back.set(key(n), at);
      queue.push(n);
    }
  }
  const way = [];
  for (let at = to; at; at = back.get(key(at))) way.unshift(at);
  return way;
}

// Corners cut off, `passes` times over, keeping the ends.
function smooth(points, passes) {
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

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

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

// Runs simulateWater in a worker (waterflowWorker.js). Only the latest request matters: one runs
// at a time, and requests made meanwhile collapse into one that runs after it. onResult(key,
// result) hears each answer.
export class WaterSimulator {
  constructor(onResult) {
    this.onResult = onResult;
    this.worker = null;
    this.busy = false;
    this.next = null;
  }

  // message: { key, landKey, continent: { land }, seedKey, sources }
  request(message) {
    this.next = structuredClone(message);
    if (!this.busy) this.send();
  }

  send() {
    const message = this.next;
    this.next = null;
    if (!message) return;
    this.busy = true;
    if (!this.worker) {
      this.worker = new Worker(new URL("./waterflowWorker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        this.busy = false;
        this.onResult(data.key, data.result);
        this.send();
      };
      this.worker.onerror = (e) => {
        this.busy = false;
        console.warn(`water flow failed: ${e.message}`);
      };
    }
    this.worker.postMessage(message);
  }
}
