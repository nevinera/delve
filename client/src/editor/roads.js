import { simplify } from "../world/polyline.js";
import { CART_WIDTH_FT, gradeCap } from "../world/constants.js";

export { CART_WIDTH_FT, gradeCap };

// Routes for the sketch's road paths, after Galin et al., "Procedural Generation of Roads"
// (Eurographics 2010): a shortest path where each foot costs more the steeper it climbs, and
// nothing passes the path's grade cap. Paths wider than CART_WIDTH_FT carry carts, so they're held
// to a gentler grade. Turning costs too, so routes run straight where they can and switchbacks
// have long legs.
//
// The search is Lazy Theta* (Nash, Koenig and Tovey, 2010) on a lattice STEP_FT apart: each
// lattice point links straight back to an earlier point on its route where it can, so routes head
// any way, not just along the lattice. That matters on steep ground, where only a narrow range of
// headings climbs gently enough. A link is judged by its ends' heights when it's made, and in full
// when its far end is settled, falling back to a lattice step from a settled neighbour if it
// fails. (The search tracks the way it came into each point, but not as part of the point, so it's
// a little short of the best route.)
//
// Routes may cross rivers, square to the flow (within CROSSING.squareDeg), for a bridge to carry
// them; each foot over water costs CROSSING.costPerFt, so they cross where it's narrow. They never
// cross lakes or the sea. The ground's sampled on a grid SAMPLE_FT apart, and rivers every
// RIVER_SAMPLE_FT, so narrow ones aren't stepped over. The route's corners are rounded off after,
// and it reports how steep the ground beside it is, since a road across a steep slope needs a
// ledge dug for it.
//
// Points are continent feet here; the sketch keeps routes in tile units.

// Bumped when routes would come out differently, so they're worked out again.
export const ROUTE_VERSION = 2;
const STEP_FT = 32;
const SAMPLE_FT = STEP_FT;
const RIVER_SAMPLE_FT = 8;
// Each foot costs 1 + perGrade × (grade / cap)², so a foot at the cap costs 1 + perGrade.
const GRADE_COST = { perGrade: 3 };
// Where the ground's too steep, the road can be dug in or built up by as much as `maxFt` over
// each sample, each foot costing as much as going `costPerFt` further: enough for a hairpin's
// landing, or to cut through a bump.
const CARVE = { maxFt: 2, costPerFt: 200 };
// A turn costs as much as going `hairpinFt` further for a full about-turn, less for gentler ones.
const TURN = { hairpinFt: 160 };
const CROSSING = { squareDeg: 20, costPerFt: 6, marginFt: 4 };
// How hard the search tries before giving up: lattice points settled; how much the estimate of the
// distance left counts (over 1 finds routes faster, a little longer than the best); and how many
// lattice steps a straight link may span.
const SEARCH = { maxVisits: 60000, greed: 1.1, linkSteps: 256 };
// Rounding corners: each is cut back up to a quarter of its sides, and at most `cutFt`, so a
// hairpin's corner doesn't run straight up the hill.
const SMOOTH = { toleranceFt: 1, rounds: 2, cutFt: 12 };
// The ground's steepness beside the route is measured `probeFt` either side of points no more
// than `spacingFt` apart.
const SIDES = { probeFt: 16, spacingFt: 32 };

// Every step reaching up to two lattice points away that isn't a repeat of a shorter one.
const MOVES = [];
for (let di = -2; di <= 2; di++) {
  for (let dj = -2; dj <= 2; dj++) {
    if ((di || dj) && gcd(Math.abs(di), Math.abs(dj)) === 1) MOVES.push({ di, dj });
  }
}

// The route from `from` to `to` ([x, z] ft). ground(x, z) is { h, water } (generator.js
// routeGround); riverAt(x, z) is the unit direction a river flows there, or null. Returns {
// points, slopes, lengthFt, grade } with points in ft, slopes how steep the ground is at each (rise
// over run, any way), and grade the steepest the route climbs; or null when there's no route
// within the cap.
export function findRoute({ from, to, cap, ground, riverAt }) {
  // The ground on a grid SAMPLE_FT apart, kept in chunks CHUNK samples across: heights, and 1 for
  // dry ground or 2 for water (0 not sampled yet).
  const CHUNK = 64;
  const chunks = new Map();
  let last = { key: NaN };
  const chunkOf = (cx, cz) => {
    const key = (cx + 16384) * 32768 + (cz + 16384);
    if (last.key === key) return last;
    let chunk = chunks.get(key);
    if (!chunk) chunks.set(key, (chunk = { key, h: new Float32Array(CHUNK * CHUNK), state: new Uint8Array(CHUNK * CHUNK) }));
    return (last = chunk);
  };
  // Sets `got` to the sample at grid point (gx, gz), as { h, blocked }.
  const got = { h: 0, blocked: false };
  const sample = (gx, gz) => {
    const [cx, cz] = [Math.floor(gx / CHUNK), Math.floor(gz / CHUNK)];
    const chunk = chunkOf(cx, cz);
    const k = (gz - cz * CHUNK) * CHUNK + (gx - cx * CHUNK);
    if (!chunk.state[k]) {
      const g = ground(gx * SAMPLE_FT, gz * SAMPLE_FT);
      chunk.h[k] = g.h;
      chunk.state[k] = g.water ? 2 : 1;
    }
    got.h = chunk.h[k];
    got.blocked = chunk.state[k] === 2;
    return got;
  };
  // Between grid points, from the four around: blocked when water's at any of those that count.
  const groundAt = (x, z) => {
    const [u, v] = [x / SAMPLE_FT, z / SAMPLE_FT];
    const [gx, gz] = [Math.floor(u), Math.floor(v)];
    const [fx, fz] = [u - gx, v - gz];
    let { h: a, blocked } = sample(gx, gz);
    blocked &&= fx < 1 && fz < 1;
    const b = sample(gx + 1, gz).h;
    blocked ||= got.blocked && fx > 0 && fz < 1;
    const c = sample(gx, gz + 1).h;
    blocked ||= got.blocked && fx < 1 && fz > 0;
    const d = sample(gx + 1, gz + 1).h;
    blocked ||= got.blocked && fx > 0 && fz > 0;
    return { x, z, h: (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz, blocked };
  };
  const square = Math.sin((CROSSING.squareDeg * Math.PI) / 180);
  // The cost and grade of going `len` ft in unit direction `dir` between two samples: Infinity
  // where it can't. Over a river, it only counts how far it is.
  const leg = (p, q, len, dir) => {
    if (p.blocked || q.blocked) return { cost: Infinity };
    let wet = false;
    const n = Math.ceil(len / RIVER_SAMPLE_FT);
    for (let k = 0; k <= n; k++) {
      const river = riverAt(p.x + ((q.x - p.x) * k) / n, p.z + ((q.z - p.z) * k) / n);
      if (!river) continue;
      if (Math.abs(dir[0] * river[0] + dir[1] * river[1]) > square) return { cost: Infinity };
      wet = true;
    }
    if (wet) return { cost: len * CROSSING.costPerFt, grade: 0 };
    const rise = Math.abs(q.h - p.h);
    const carved = rise - cap * len;
    if (carved > CARVE.maxFt) return { cost: Infinity };
    const grade = Math.min(rise / len, cap);
    return { cost: len * (1 + GRADE_COST.perGrade * (grade / cap) ** 2) + Math.max(0, carved) * CARVE.costPerFt, grade };
  };
  // The cost and grade of a straight line between two points in ft, sampled along the way.
  const line = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) return { cost: 0, grade: 0 };
    const n = Math.ceil(len / SAMPLE_FT);
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let cost = 0;
    let grade = 0;
    let p = groundAt(...a);
    for (let k = 1; k <= n; k++) {
      const q = groundAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
      const l = leg(p, q, len / n, dir);
      if (l.cost === Infinity) return l;
      cost += l.cost;
      grade = Math.max(grade, l.grade);
      p = q;
    }
    return { cost, grade };
  };

  // Lattice points by small whole numbers, which maps and sets handle fastest.
  const key = (i, j) => (i + 16384) * 32768 + (j + 16384);
  const at = (k) => [(Math.floor(k / 32768) - 16384) * STEP_FT, ((k % 32768) - 16384) * STEP_FT];
  // What turning from heading `d` (a unit vector, or none at the start) onto the line a → b costs.
  const turn = (d, a, b) => {
    if (!d) return 0;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return (TURN.hairpinFt * (1 - (d[0] * (b[0] - a[0]) + d[1] * (b[1] - a[1])) / len)) / 2;
  };
  const heading = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };

  const [si, sj] = from.map((v) => Math.round(v / STEP_FT));
  const [ei, ej] = to.map((v) => Math.round(v / STEP_FT));
  const start = key(si, sj);
  const goal = key(ei, ej);
  // Per lattice point: the cost of the route there, the point it links straight back to, the
  // heading it arrives on, and whether its link has been judged in full.
  const best = new Map([[start, 0]]);
  const parent = new Map();
  const dirs = new Map();
  const checked = new Set([start]);
  const done = new Set();
  const open = new Heap();
  const estimate = (k) => {
    const [x, z] = at(k);
    return Math.hypot(ei * STEP_FT - x, ej * STEP_FT - z) * SEARCH.greed;
  };
  const link = (k, p, g) => {
    best.set(k, g);
    parent.set(k, p);
    dirs.set(k, heading(at(p), at(k)));
  };
  // The cheapest link from a settled neighbour, or straight on from its parent, or false.
  const fallBack = (k) => {
    const [x, z] = at(k);
    let found = null;
    for (const { di, dj } of MOVES) {
      const n = key(x / STEP_FT - di, z / STEP_FT - dj);
      if (!done.has(n)) continue;
      for (const from of [n, parent.get(n)]) {
        if (from === undefined || Math.hypot(at(from)[0] - x, at(from)[1] - z) > SEARCH.linkSteps * STEP_FT) continue;
        const g = best.get(from) + turn(dirs.get(from), at(from), at(k)) + line(at(from), at(k)).cost;
        if (g < (found?.g ?? Infinity)) found = { n: from, g };
      }
    }
    if (found) link(k, found.n, found.g);
    return Boolean(found);
  };

  open.push(estimate(start), start);
  while (open.size && done.size < SEARCH.maxVisits) {
    const k = open.pop()[1];
    if (done.has(k) || !best.has(k)) continue;
    if (!checked.has(k)) {
      const p = parent.get(k);
      const l = line(at(p), at(k));
      if (l.cost < Infinity) link(k, p, best.get(p) + turn(dirs.get(p), at(p), at(k)) + l.cost);
      else if (!fallBack(k)) {
        // Unreachable as yet; another point may reach it later.
        best.delete(k);
        continue;
      }
      checked.add(k);
    }
    done.add(k);
    if (k === goal) return finish(trace(parent, start, goal).map(at), from, to, line, ground);
    const here = at(k);
    const p = parent.get(k);
    for (const { di, dj } of MOVES) {
      const n = key(here[0] / STEP_FT + di, here[1] / STEP_FT + dj);
      if (done.has(n)) continue;
      const there = at(n);
      let found = null;
      // Straight on from this point's parent, judged by the heights at its ends for now.
      if (p !== undefined && Math.hypot(there[0] - at(p)[0], there[1] - at(p)[1]) <= SEARCH.linkSteps * STEP_FT) {
        const [a, b] = [groundAt(...at(p)), groundAt(...there)];
        const len = Math.hypot(there[0] - a.x, there[1] - a.z);
        const grade = Math.abs(b.h - a.h) / len;
        if (!b.blocked && grade <= cap) found = { p, g: best.get(p) + turn(dirs.get(p), at(p), there) + len * (1 + GRADE_COST.perGrade * (grade / cap) ** 2), checked: false };
      }
      // A lattice step from this point, judged in full.
      const l = line(here, there);
      const g = best.get(k) + turn(dirs.get(k), here, there) + l.cost;
      if (g < (found?.g ?? Infinity)) found = { p: k, g, checked: true };
      if (!found || found.g >= (best.get(n) ?? Infinity)) continue;
      link(n, found.p, found.g);
      if (found.checked) checked.add(n);
      else checked.delete(n);
      open.push(found.g + estimate(n), n);
    }
  }
  return null;
}

// The lattice points from start to end, by their parents.
function trace(parent, start, end) {
  const keys = [end];
  for (let k = end; k !== start; ) keys.push((k = parent.get(k)));
  return keys.reverse();
}

// The route through lattice points `pts`, starting and ending at `from` and `to`, off the lattice,
// with its corners rounded, and how steep the ground beside it is.
function finish(pts, from, to, line, ground) {
  let grade = 0;
  for (let k = 1; k < pts.length; k++) grade = Math.max(grade, line(pts[k - 1], pts[k]).grade);
  const points = densify(smooth(simplify([from, ...pts.slice(1, -1), to], SMOOTH.toleranceFt)));
  const d = SIDES.probeFt;
  const slopes = points.map(([x, z]) => Math.hypot(ground(x + d, z).h - ground(x - d, z).h, ground(x, z + d).h - ground(x, z - d).h) / (2 * d));
  let lengthFt = 0;
  for (let k = 1; k < points.length; k++) lengthFt += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return { points, slopes, lengthFt, grade };
}

// Points added along long segments, so none is longer than SIDES.spacingFt.
function densify(points) {
  const out = [points[0]];
  for (let k = 1; k < points.length; k++) {
    const [a, b] = [points[k - 1], points[k]];
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SIDES.spacingFt);
    for (let m = 1; m <= n; m++) out.push([a[0] + ((b[0] - a[0]) * m) / n, a[1] + ((b[1] - a[1]) * m) / n]);
  }
  return out;
}

// Chaikin's corner cutting: each corner is cut back along both its sides.
function smooth(points) {
  let pts = points;
  for (let n = 0; n < SMOOTH.rounds && pts.length > 2; n++) {
    const out = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]];
      const t = Math.min(0.25, SMOOTH.cutFt / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1));
      if (k > 0) out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      if (k < pts.length - 2) out.push([b[0] - t * (b[0] - a[0]), b[1] - t * (b[1] - a[1])]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Which way the rivers flow at a point: rivers as { points ([x, z] ft, downstream), width }.
// Returns riverAt(x, z), the unit direction of the river over that point, or null.
export function riverLookup(rivers) {
  const CELL_FT = 128;
  const cells = new Map();
  for (const { points, width } of rivers) {
    const reach = width / 2 + CROSSING.marginFt;
    for (let k = 1; k < points.length; k++) {
      const [a, b] = [points[k - 1], points[k]];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (!len) continue;
      const seg = { a, dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len, reach };
      const [i0, i1] = [Math.floor((Math.min(a[0], b[0]) - reach) / CELL_FT), Math.floor((Math.max(a[0], b[0]) + reach) / CELL_FT)];
      const [j0, j1] = [Math.floor((Math.min(a[1], b[1]) - reach) / CELL_FT), Math.floor((Math.max(a[1], b[1]) + reach) / CELL_FT)];
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const c = `${i},${j}`;
          if (!cells.has(c)) cells.set(c, []);
          cells.get(c).push(seg);
        }
      }
    }
  }
  return (x, z) => {
    let found = null;
    let nearest = Infinity;
    for (const { a, dir, len, reach } of cells.get(`${Math.floor(x / CELL_FT)},${Math.floor(z / CELL_FT)}`) ?? []) {
      const t = Math.max(0, Math.min(len, (x - a[0]) * dir[0] + (z - a[1]) * dir[1]));
      const d = Math.hypot(x - a[0] - t * dir[0], z - a[1] - t * dir[1]);
      if (d < reach && d < nearest) [found, nearest] = [dir, d];
    }
    return found;
  };
}

// Where two paths' routes cross, other than near their ends: the first crossing found, as { a, b,
// ia, ib, point }, the paths' ids, the segments of each that cross, and where. Paths that share a
// pin are left alone. paths: [{ id, from, to, points }], points in any one unit; `gap` is how near
// a route's end a crossing may be and still be ignored, in that unit.
export function findCrossing(paths, gap) {
  const routed = paths.filter((p) => p.points?.length >= 2).map((p) => ({ ...p, box: box(p.points) }));
  for (let m = 0; m < routed.length; m++) {
    for (let n = m + 1; n < routed.length; n++) {
      const [a, b] = [routed[m], routed[n]];
      if ([a.from, a.to].some((pin) => pin === b.from || pin === b.to)) continue;
      if (a.box[0] > b.box[2] || b.box[0] > a.box[2] || a.box[1] > b.box[3] || b.box[1] > a.box[3]) continue;
      for (let ia = 1; ia < a.points.length; ia++) {
        for (let ib = 1; ib < b.points.length; ib++) {
          const point = intersect(a.points[ia - 1], a.points[ia], b.points[ib - 1], b.points[ib]);
          if (!point) continue;
          const ends = [a.points[0], a.points.at(-1), b.points[0], b.points.at(-1)];
          if (ends.some((e) => Math.hypot(e[0] - point[0], e[1] - point[1]) < gap)) continue;
          return { a: a.id, b: b.id, ia: ia - 1, ib: ib - 1, point };
        }
      }
    }
  }
  return null;
}

// A route ({ points, slopes }) cut in two at `point` on its segment `index`.
export function splitRoute({ points, slopes }, index, point) {
  const halves = [
    { points: [...points.slice(0, index + 1), point], slopes: slopes && [...slopes.slice(0, index + 1), slopes[index]] },
    { points: [point, ...points.slice(index + 1)], slopes: slopes && [slopes[index], ...slopes.slice(index + 1)] },
  ];
  for (const half of halves) if (!slopes) delete half.slopes;
  return halves;
}

function intersect(p, p2, q, q2) {
  const [rx, rz] = [p2[0] - p[0], p2[1] - p[1]];
  const [sx, sz] = [q2[0] - q[0], q2[1] - q[1]];
  const denom = rx * sz - rz * sx;
  if (!denom) return null;
  const t = ((q[0] - p[0]) * sz - (q[1] - p[1]) * sx) / denom;
  const u = ((q[0] - p[0]) * rz - (q[1] - p[1]) * rx) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [p[0] + t * rx, p[1] + t * rz];
}

function box(points) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

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

// Works out routes in a worker (roadsWorker.js). Only the latest request matters: one runs at a
// time, and requests made meanwhile collapse into one that runs after it. onRoute(id, key, route)
// hears each route as it's found, route as { points (tile units), lengthFt, grade } or { points:
// null } when there's none.
export class RoadRouter {
  constructor(onRoute) {
    this.onRoute = onRoute;
    this.worker = null;
    this.busy = false;
    this.next = null;
  }

  // message: { landKey, continent: { land, pins, water }, seedKey, jobs: [{ id, key,
  // from, to, width }] }, from and to in tile units.
  request(message) {
    this.next = structuredClone(message);
    if (!this.busy) this.send();
  }

  send() {
    const message = this.next;
    this.next = null;
    if (!message?.jobs.length) return;
    this.busy = true;
    if (!this.worker) {
      this.worker = new Worker(new URL("./roadsWorker.js", import.meta.url), { type: "module" });
      this.worker.onmessage = ({ data }) => {
        if (data.done) {
          this.busy = false;
          this.send();
        } else {
          this.onRoute(data.id, data.key, data.route);
        }
      };
      this.worker.onerror = (e) => {
        this.busy = false;
        console.warn(`road routing failed: ${e.message}`);
      };
    }
    this.worker.postMessage(message);
  }
}
