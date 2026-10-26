import { simplify } from "../world/polyline.js";

// Routes for the sketch's road paths, after Galin et al., "Procedural Generation of Roads"
// (Eurographics 2010): a shortest path across a lattice STEP_FT apart, where each step costs its
// length, more the steeper it climbs, and nothing past the path's grade cap. Steps reach up to two
// lattice points away, so routes can head in 16 directions instead of 8, and switchbacks form on
// their own where a hill's too steep to climb straight. Turning costs too, so routes run straight
// where they can and switchbacks have long legs. (The search tracks the way it came into each
// lattice point, but not as part of the point, so it's a little short of the best route.) Paths
// wider than CART_WIDTH_FT carry carts, so they're held to a gentler grade.
//
// Routes may cross rivers, square to the flow (within CROSSING.squareDeg), for a bridge to carry
// them; each foot over water costs CROSSING.costPerFt, so they cross where it's narrow. They never
// cross lakes or the sea. The ground's sampled every STEP_FT / 2 along each step, and rivers every
// RIVER_SAMPLE_FT, so narrow ones aren't stepped over. The lattice route is then pulled straight
// wherever a straight line costs no more, and its corners are rounded off.
//
// Points are continent feet here; the sketch keeps routes in tile units.

const STEP_FT = 32;
const RIVER_SAMPLE_FT = 8;
export const CART_WIDTH_FT = 8;
export const GRADES = { cart: 0.1, foot: 0.25 }; // rise over run
// Each foot of a step costs 1 + perGrade × (grade / cap)², so a step at the cap costs 1 + perGrade.
const GRADE_COST = { perGrade: 3 };
// A turn costs as much as going `hairpinFt` further for a full about-turn, less for gentler ones.
const TURN = { hairpinFt: 160 };
const CROSSING = { squareDeg: 20, costPerFt: 6, marginFt: 4 };
// How hard the search tries before giving up: lattice points settled, and how much the estimate of
// the distance left counts (over 1 finds routes faster, a little longer than the best).
const SEARCH = { maxVisits: 60000, greed: 1.1 };
// Pulling straight: tried over up to `spanSteps` lattice steps, sampling the ground every `sampleFt`.
const PULL = { spanSteps: 16, sampleFt: STEP_FT / 2 };
// Rounding corners: each is cut back up to a quarter of its sides, and at most `cutFt`, so a
// hairpin's corner doesn't run straight up the hill.
const SMOOTH = { toleranceFt: 1, rounds: 2, cutFt: 12 };

// Every step reaching up to two lattice points away that isn't a repeat of a shorter one.
const MOVES = [];
for (let di = -2; di <= 2; di++) {
  for (let dj = -2; dj <= 2; dj++) {
    if ((di || dj) && gcd(Math.abs(di), Math.abs(dj)) === 1) MOVES.push({ di, dj, len: Math.hypot(di, dj) * STEP_FT });
  }
}
// What turning from one move onto another costs.
const TURNS = MOVES.map((a) =>
  MOVES.map((b) => {
    const cos = ((a.di * b.di + a.dj * b.dj) * STEP_FT ** 2) / (a.len * b.len);
    return (TURN.hairpinFt * (1 - cos)) / 2;
  }),
);

export function gradeCap(widthFt) {
  return widthFt > CART_WIDTH_FT ? GRADES.cart : GRADES.foot;
}

// The route from `from` to `to` ([x, z] ft). ground(x, z) is { h, water } (generator.js
// routeGround); riverAt(x, z) is the unit direction a river flows there, or null. Returns {
// points, lengthFt, grade } with points in ft and grade the steepest step, or null when there's no
// route within the cap.
export function findRoute({ from, to, cap, ground, riverAt }) {
  // Ground at half-lattice points, so each step's middle is sampled too.
  const samples = new Map();
  const sample = (hx, hz) => {
    const k = (hx + 65536) * 131072 + (hz + 65536);
    let s = samples.get(k);
    if (!s) {
      s = groundAt((hx * STEP_FT) / 2, (hz * STEP_FT) / 2);
      samples.set(k, s);
    }
    return s;
  };
  const groundAt = (x, z) => {
    const g = ground(x, z);
    return { x, z, h: g.h, blocked: Boolean(g.water) };
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
    const grade = Math.abs(q.h - p.h) / len;
    if (grade > cap) return { cost: Infinity };
    return { cost: len * (1 + GRADE_COST.perGrade * (grade / cap) ** 2), grade };
  };
  // A step's cost and grade, from the half-lattice point (hx, hz), through its middle.
  const step = (hx, hz, { di, dj, len }) => {
    const dir = [(di * STEP_FT) / len, (dj * STEP_FT) / len];
    const a = leg(sample(hx, hz), sample(hx + di, hz + dj), len / 2, dir);
    if (a.cost === Infinity) return a;
    const b = leg(sample(hx + di, hz + dj), sample(hx + 2 * di, hz + 2 * dj), len / 2, dir);
    return { cost: a.cost + b.cost, grade: Math.max(a.grade, b.grade) };
  };
  // The cost and grade of a straight line between two points in ft, sampled `n` times along the
  // way (as often as PULL says by default).
  const line = (a, b, n = 0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    n ||= Math.max(1, Math.ceil(len / PULL.sampleFt));
    const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const at = (k) => groundAt(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
    let cost = 0;
    let grade = 0;
    let p = at(0);
    for (let k = 1; k <= n; k++) {
      const q = at(k);
      const l = leg(p, q, len / n, dir);
      if (l.cost === Infinity) return l;
      cost += l.cost;
      grade = Math.max(grade, l.grade);
      p = q;
    }
    return { cost, grade };
  };

  const [si, sj] = from.map((v) => Math.round(v / STEP_FT));
  const [ei, ej] = to.map((v) => Math.round(v / STEP_FT));
  const key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  const goal = key(ei, ej);
  const best = new Map([[key(si, sj), 0]]);
  const came = new Map();
  const heading = new Map(); // the move into each lattice point
  const done = new Set();
  const open = new Heap();
  const estimate = (i, j) => Math.hypot(ei - i, ej - j) * STEP_FT * SEARCH.greed;
  open.push(estimate(si, sj), [si, sj]);
  while (open.size && done.size < SEARCH.maxVisits) {
    const [i, j] = open.pop()[1];
    const k = key(i, j);
    if (done.has(k)) continue;
    done.add(k);
    if (k === goal) return finish(trace(came, [si, sj], [ei, ej], key), best, key, line, from, to);
    const turns = heading.has(k) ? TURNS[heading.get(k)] : null;
    for (let m = 0; m < MOVES.length; m++) {
      const move = MOVES[m];
      const { cost } = step(2 * i, 2 * j, move);
      if (cost === Infinity) continue;
      const [ni, nj] = [i + move.di, j + move.dj];
      const nk = key(ni, nj);
      const g = best.get(k) + cost + (turns ? turns[m] : 0);
      if (done.has(nk) || g >= (best.get(nk) ?? Infinity)) continue;
      best.set(nk, g);
      came.set(nk, [i, j]);
      heading.set(nk, m);
      open.push(g + estimate(ni, nj), [ni, nj]);
    }
  }
  return null;
}

// The lattice points from start to end.
function trace(came, start, end, key) {
  const cells = [end];
  for (let c = end; c[0] !== start[0] || c[1] !== start[1]; ) cells.push((c = came.get(key(...c))));
  return cells.reverse();
}

// The route through lattice points `cells`, pulled straight: from each point kept, on to the
// furthest point a straight line reaches for no more than the lattice route costs (`best` holds
// what it cost to reach each point). It starts and ends at `from` and `to`, off the lattice.
function finish(cells, best, key, line, from, to) {
  const pts = cells.map(([i, j]) => [i * STEP_FT, j * STEP_FT]);
  const cost = cells.map((c) => best.get(key(...c)));
  const kept = [0];
  let grade = 0;
  for (let a = 0; a < pts.length - 1; ) {
    let to = a + 1;
    let found = line(pts[a], pts[to], 2); // as the search went, through the step's middle
    for (let b = a + 2; b < pts.length && b - a <= PULL.spanSteps; b++) {
      const tried = line(pts[a], pts[b]);
      if (tried.cost > (cost[b] - cost[a]) * 1.001) continue;
      [to, found] = [b, tried];
    }
    grade = Math.max(grade, found.grade);
    kept.push(to);
    a = to;
  }
  const points = smooth(simplify([from, ...kept.slice(1, -1).map((k) => pts[k]), to], SMOOTH.toleranceFt));
  let lengthFt = 0;
  for (let k = 1; k < points.length; k++) lengthFt += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return { points, lengthFt, grade };
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

// A route cut in two at `point` on its segment `index`.
export function splitRoute(points, index, point) {
  return [[...points.slice(0, index + 1), point], [point, ...points.slice(index + 1)]];
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

  // message: { landKey, continent: { zones, pins, watercourses }, seedKey, jobs: [{ id, key,
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
