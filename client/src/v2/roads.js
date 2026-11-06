import { onTrack } from "./courses.js";

// Roads: footpaths, trails and roads, drawn by hand as lines and kept in each continent's
// roads.json. A road is
//
//   { id, kind: "footpath" | "trail" | "road", points: [[x, z, width], ...], seed, bed: [ft, ...] }
//
// id being "road" and 4 base-36 characters (roadId), for what it puts in the placed files
// (roadEdges.js) to say which road they're for, and the rest in continent feet, each point with how wide the road is there. It doesn't follow that line
// straight: it runs down a track (roadTrack) rounded at each corner, more for wider kinds, and
// wobbling a little either side of it, the way `seed` has it. `bed` is its surface's height
// under its middle every BED_STEP_FT down that track, worked out once from the ground when it's
// drawn (bedOf), so changing the ground later never moves it. The bed follows the ground, evened
// out and held to the kind's grade. Across, a road is level, and trails and footpaths lean with
// the ground no more than the kind allows. Beside it, the ground's cut back in a bank where it's
// higher and built up in a slope where it's lower (shapeRoad), so a road across a hillside sits
// on a bench. A road never runs in a trench, cut into the ground on both sides: where its grade
// would need that, or a bank deeper than the kind's deepest, it's where it can't go (troubleOf).

export const ROAD_KINDS = ["footpath", "trail", "road"];
// width: new roads', ft; grade: how steeply it climbs at most, ft a foot; lean: how far it tilts
// across at most, ft a foot; deepest: how deep its bank's cut at most, ft; corner: how wide a
// circle its corners are rounded to at least, as times its width.
export const KINDS = {
  footpath: { width: 3, grade: 0.4, lean: 0.4, deepest: 3, corner: 6 },
  trail: { width: 6, grade: 0.2, lean: 0.1, deepest: 6, corner: 8 },
  road: { width: 14, grade: 0.1, lean: 0, deepest: 12, corner: 8 },
};
export const BED_STEP_FT = 8;
const TRACK_STEP_FT = 4; // how far apart its track's points are
const EVEN_FT = 48; // how far along the ground's evened out for its bed
const WOBBLE = 0.25; // how far its track wobbles either side of its line, in widths
const WOBBLE_MAX_FT = 3;
const WOBBLE_WAVE_FT = 120; // how far down it it takes to wobble there and back
const CUT_RUN = 1; // a bank rises a foot every this many feet out
const FILL_RUN = 1.5; // and a slope below falls a foot every this many
const SIDE_FT = 24; // how far past its edge a bank or slope reaches at most
const TRENCH_FT = 1; // how far under the ground on both sides it is, at most, before that's a trench
const GRID_FT = 32; // its track's segments are found by squares this wide
const ROAD_CELL_FT = 2.5; // how near a cell's middle a narrow road's track passes for it to be on it

const tracks = new WeakMap(); // points -> their track, by kind and seed

// The track a road runs down, from its `points`, `kind` and `seed`: { x, z, t, width } at each of
// its points, every TRACK_STEP_FT or so, t how far down it, with `length` and a grid of its
// segments, as courses.js's onTrack reads.
export function roadTrack(points, kind, seed = 0) {
  const kept = tracks.get(points);
  if (kept?.kind === kind && kept.seed === seed) return kept;
  const line = rounded(points, KINDS[kind].corner);
  const t = lengths(line);
  const total = t.at(-1);
  const track = { kind, seed, length: total, x: [], z: [], t: [], width: [], depth: [], bend: [] };
  for (let k = 0; k < line.length; k++) {
    const [x, z, w] = line[k];
    const [a, b] = [line[Math.max(0, k - 1)], line[Math.min(line.length - 1, k + 1)]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // Less near its ends, which stay where they're drawn.
    const ends = Math.min(1, Math.min(t[k], total - t[k]) / (3 * w));
    const off = Math.min(WOBBLE_MAX_FT, WOBBLE * w) * wave(t[k] / WOBBLE_WAVE_FT, seed) * ends * ends * (3 - 2 * ends);
    track.x.push(x - ((b[1] - a[1]) / d) * off);
    track.z.push(z + ((b[0] - a[0]) / d) * off);
    track.width.push(w);
    track.depth.push(1);
    track.bend.push(0);
  }
  track.t = lengths(track.x.map((x, k) => [x, track.z[k]]));
  track.length = track.t.at(-1);
  track.grid = new Map();
  const reach = reachOf({ points });
  for (let k = 1; k < track.x.length; k++) {
    const [x0, x1] = [Math.min(track.x[k - 1], track.x[k]) - reach, Math.max(track.x[k - 1], track.x[k]) + reach];
    const [z0, z1] = [Math.min(track.z[k - 1], track.z[k]) - reach, Math.max(track.z[k - 1], track.z[k]) + reach];
    for (let gz = Math.floor(z0 / GRID_FT); gz <= Math.floor(z1 / GRID_FT); gz++) {
      for (let gx = Math.floor(x0 / GRID_FT); gx <= Math.floor(x1 / GRID_FT); gx++) {
        const key = `${gx},${gz}`;
        if (!track.grid.has(key)) track.grid.set(key, []);
        track.grid.get(key).push(k);
      }
    }
  }
  tracks.set(points, track);
  return track;
}

// `points` as a line every TRACK_STEP_FT or so, each corner rounded into an arc of a circle at
// least `corner` widths across, smaller where its sides are too short for that.
function rounded(points, corner) {
  if (points.length < 2) points = [points[0], points[0]];
  // Where each corner's arc starts and ends, and its middle, or the corner itself where it's straight.
  const turns = points.map((p, k) => {
    if (k === 0 || k === points.length - 1) return null;
    const [a, b] = [points[k - 1], points[k + 1]];
    const [ux, uz] = unit(p[0] - a[0], p[1] - a[1]);
    const [vx, vz] = unit(b[0] - p[0], b[1] - p[1]);
    const angle = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz)));
    if (angle < 1e-3) return null;
    const room = Math.min(Math.hypot(p[0] - a[0], p[1] - a[1]), Math.hypot(b[0] - p[0], b[1] - p[1])) / 2;
    const back = Math.min(room, ((corner * p[2]) / 2) * Math.tan(angle / 2));
    return { from: [p[0] - ux * back, p[1] - uz * back], to: [p[0] + vx * back, p[1] + vz * back], at: p };
  });
  const line = [];
  const run = ([ax, az], [bx, bz], wa, wb, first) => {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / TRACK_STEP_FT));
    for (let m = first ? 0 : 1; m <= n; m++) line.push([ax + ((bx - ax) * m) / n, az + ((bz - az) * m) / n, wa + ((wb - wa) * m) / n]);
  };
  let from = points[0];
  for (let k = 1; k < points.length; k++) {
    const p = points[k];
    const turn = turns[k];
    run(from, turn ? turn.from : p, from[2] ?? p[2], p[2], k === 1);
    if (turn) {
      // A quadratic curve from where the arc starts, toward the corner, to where it ends: near
      // enough an arc, and the same either way round.
      const n = Math.max(2, Math.ceil(Math.hypot(turn.to[0] - turn.from[0], turn.to[1] - turn.from[1]) / TRACK_STEP_FT));
      for (let m = 1; m <= n; m++) {
        const u = m / n;
        const at = (c) => (1 - u) * (1 - u) * turn.from[c] + 2 * (1 - u) * u * turn.at[c] + u * u * turn.to[c];
        line.push([at(0), at(1), p[2]]);
      }
      from = [...turn.to, p[2]];
    } else from = p;
  }
  return line;
}

const unit = (x, z) => {
  const d = Math.hypot(x, z) || 1;
  return [x / d, z / d];
};

function lengths(line) {
  const t = [0];
  for (let k = 1; k < line.length; k++) t.push(t[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
  return t;
}

// A wave from -1 to 1 at `phase` (in waves), not quite regular, by `seed`.
function wave(phase, seed) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 12345.6789;
  return 0.65 * Math.sin(2 * Math.PI * phase + a) + 0.35 * Math.sin(2 * Math.PI * 1.73 * phase + b);
}

// How far out from a road's line it changes the ground, at most.
export const reachOf = ({ points }) => Math.max(...points.map((p) => p[2])) / 2 + WOBBLE_MAX_FT + SIDE_FT;

// A road's box, [x0, z0, x1, z1], with what it changes beside it.
export function roadBox(road) {
  const r = reachOf(road);
  const xs = road.points.map((p) => p[0]);
  const zs = road.points.map((p) => p[1]);
  return [Math.min(...xs) - r, Math.min(...zs) - r, Math.max(...xs) + r, Math.max(...zs) + r];
}

// Where a road's track is `t` ft down it: { x, z, width, across: [x, z], square to it, to its left }.
function placeOn(track, t) {
  let k = 1;
  while (k < track.t.length - 1 && track.t[k] < t) k++;
  const span = track.t[k] - track.t[k - 1];
  const u = span ? Math.min(1, Math.max(0, (t - track.t[k - 1]) / span)) : 0;
  const [ux, uz] = unit(track.x[k] - track.x[k - 1], track.z[k] - track.z[k - 1]);
  const mix = (v) => v[k - 1] + (v[k] - v[k - 1]) * u;
  return { x: mix(track.x), z: mix(track.z), width: mix(track.width), across: [uz, -ux] };
}

// A road's bed down its track, from its `points`, `kind` and `seed`, and groundAt(x, z): the
// ground under its middle every BED_STEP_FT, evened out over EVEN_FT, then held to the kind's
// grade, both ways, and never under the lower of the ground at its edges by more than TRENCH_FT,
// to a tenth of a foot.
export function bedOf({ points, kind, seed = 0 }, groundAt) {
  const track = roadTrack(points, kind, seed);
  const middle = [];
  const lower = [];
  for (let t = 0; t <= track.length + BED_STEP_FT / 2; t += BED_STEP_FT) {
    const at = placeOn(track, Math.min(t, track.length));
    const side = at.width / 2;
    middle.push(groundAt(at.x, at.z) ?? 0);
    lower.push(Math.min(groundAt(at.x + at.across[0] * side, at.z + at.across[1] * side) ?? 0, groundAt(at.x - at.across[0] * side, at.z - at.across[1] * side) ?? 0));
  }
  const half = Math.round(EVEN_FT / 2 / BED_STEP_FT);
  const even = middle.map((_, n) => {
    const [a, b] = [Math.max(0, n - half), Math.min(middle.length - 1, n + half)];
    let sum = 0;
    for (let m = a; m <= b; m++) sum += middle[m];
    return sum / (b - a + 1);
  });
  const step = KINDS[kind].grade * BED_STEP_FT;
  // Held to the grade by easing toward the evened ground from each end, a few times over.
  const bed = [...even];
  for (let pass = 0; pass < 4; pass++) {
    for (let n = 1; n < bed.length; n++) bed[n] = Math.max(bed[n - 1] - step, Math.min(bed[n - 1] + step, bed[n]));
    for (let n = bed.length - 2; n >= 0; n--) bed[n] = Math.max(bed[n + 1] - step, Math.min(bed[n + 1] + step, bed[n]));
  }
  return bed.map((v, n) => Math.round(Math.max(v, lower[n] - TRENCH_FT) * 10) / 10);
}

// A road's bed `t` ft down its track.
export function bedAt(bed, t) {
  const at = Math.max(0, Math.min(bed.length - 1, t / BED_STEP_FT));
  const k = Math.min(bed.length - 2, Math.floor(at));
  if (k < 0) return bed[0];
  return bed[k] + (bed[k + 1] - bed[k]) * (at - k);
}

// The stretches of a road it can't go along, from its bed and groundAt(x, z): [{ from, to, why }],
// t ft down its track, why "steep" where its bed climbs more steeply than its kind's grade, as it
// does to stay out of a trench, or "deep" where its bank's cut deeper than its kind's deepest.
export function troubleOf(road, groundAt) {
  if (!road.bed?.length) return [];
  const { grade, deepest } = KINDS[road.kind];
  const track = roadTrack(road.points, road.kind, road.seed ?? 0);
  const found = [];
  const last = {}; // why -> the stretch of it found last
  const add = (why, t) => {
    if (last[why]?.to >= t - BED_STEP_FT) last[why].to = t;
    else found.push((last[why] = { from: Math.max(0, t - BED_STEP_FT), to: t, why }));
  };
  for (let n = 0; n < road.bed.length; n++) {
    const t = n * BED_STEP_FT;
    if (n && Math.abs(road.bed[n] - road.bed[n - 1]) > grade * BED_STEP_FT + 0.15) add("steep", t);
    const at = placeOn(track, Math.min(t, track.length));
    const side = at.width / 2;
    const higher = Math.max(groundAt(at.x + at.across[0] * side, at.z + at.across[1] * side) ?? 0, groundAt(at.x - at.across[0] * side, at.z - at.across[1] * side) ?? 0);
    if (higher - road.bed[n] > deepest) add("deep", t);
  }
  return found;
}

// What a road makes of the ground at (x, z), the ground there being `ground` before roads change
// it: the height it puts the ground at, or null where it doesn't reach. On it, its bed, leaning
// toward the ground no more than its kind lets it; beside it, a bank cut back where the ground's
// higher, and a slope built up where it's lower; past where
// those meet the ground, or SIDE_FT, nothing. With it, `out`: how far past its edge (x, z) is.
export function shapeRoad(road, x, z, ground) {
  if (!road.bed?.length) return null;
  const track = roadTrack(road.points, road.kind, road.seed ?? 0);
  const near = onTrack(track, x, z, reachOf(road));
  if (!near) return null;
  const { lean } = KINDS[road.kind];
  const bed = bedAt(road.bed, near.t);
  const half = near.width / 2;
  const out = near.d - half;
  if (out <= 0) return { height: Math.max(bed - lean * near.d, Math.min(bed + lean * near.d, ground)), out };
  if (out > SIDE_FT) return null;
  const edge = Math.max(bed - lean * half, Math.min(bed + lean * half, ground));
  if (ground > edge) return { height: Math.min(ground, edge + out / CUT_RUN), out };
  return { height: Math.max(ground, edge - out / FILL_RUN), out };
}

// The ground at a cell corner with every road in `roads` there, `ground` before they change it:
// the one whose edge it's nearest past, or furthest inside, has its way.
export function roadsAt(roads, x, z, ground) {
  let best = null;
  for (const road of roads) {
    const made = shapeRoad(road, x, z, ground);
    if (made && (!best || made.out < best.out)) best = made;
  }
  return best ? best.height : ground;
}

// Which kind of road (x, z) is on, a cell's middle: 1 + its index in ROAD_KINDS, or 0 for none.
// A cell's on a road whose track passes within half its width, or ROAD_CELL_FT for one narrower,
// so even a footpath's cells run on unbroken.
export function roadKindAt(roads, x, z) {
  let best = 0;
  for (const road of roads) {
    const near = onTrack(roadTrack(road.points, road.kind, road.seed ?? 0), x, z, reachOf(road));
    if (near && near.d <= Math.max(near.width / 2, ROAD_CELL_FT)) best = Math.max(best, ROAD_KINDS.indexOf(road.kind) + 1);
  }
  return best;
}

// The roads in `before` or `after` that aren't in both, as boxes [x0, z0, x1, z1], where the
// ground they make has to be worked out again.
export function changedRoadBoxes(before, after) {
  const key = (road) => JSON.stringify(road);
  const [had, has] = [new Set((before.roads ?? []).map(key)), new Set((after.roads ?? []).map(key))];
  const changed = [...(before.roads ?? []).filter((road) => !has.has(key(road))), ...(after.roads ?? []).filter((road) => !had.has(key(road)))];
  return changed.filter(({ points }) => points.length).map(roadBox);
}

// The roads crossing the box [x0, z0, x1, z1], as the ground's material draws them
// (render/groundMaterial.js): [{ kind, half, its half width, segments: [[ax, az, bx, bz], ...] }],
// each road's track there simplified till it's no further than SIMPLE_FT off it.
export function roadSegmentsIn(roads, [x0, z0, x1, z1]) {
  const out = [];
  for (const road of roads) {
    const box = roadBox(road);
    if (box[0] > x1 || box[2] < x0 || box[1] > z1 || box[3] < z0) continue;
    const track = roadTrack(road.points, road.kind, road.seed ?? 0);
    const half = Math.max(...road.points.map((p) => p[2])) / 2;
    const near = (k) => track.x[k] >= x0 - half && track.x[k] <= x1 + half && track.z[k] >= z0 - half && track.z[k] <= z1 + half;
    // Each run of the track's points in or near the box, with one more either end.
    const segments = [];
    for (let k = 0; k < track.x.length; k++) {
      if (!near(k)) continue;
      const from = Math.max(0, k - 1);
      while (k + 1 < track.x.length && near(k + 1)) k++;
      const to = Math.min(track.x.length - 1, k + 1);
      const run = simplified(track, from, to);
      for (let n = 1; n < run.length; n++) segments.push([track.x[run[n - 1]], track.z[run[n - 1]], track.x[run[n]], track.z[run[n]]]);
    }
    if (segments.length) out.push({ kind: road.kind, half, segments });
  }
  return out;
}

const SIMPLE_FT = 0.25;

// The indexes of a track's points from `a` to `b` that keep the line within SIMPLE_FT of all of
// them (Douglas–Peucker).
function simplified(track, a, b) {
  const keep = new Set([a, b]);
  const split = (i, j) => {
    const [ax, az, bx, bz] = [track.x[i], track.z[i], track.x[j], track.z[j]];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [far, at] = [0, -1];
    for (let k = i + 1; k < j; k++) {
      const off = Math.abs((bx - ax) * (az - track.z[k]) - (ax - track.x[k]) * (bz - az)) / length;
      if (off > far) [far, at] = [off, k];
    }
    if (far <= SIMPLE_FT) return;
    keep.add(at);
    split(i, at);
    split(at, j);
  };
  split(a, b);
  return [...keep].sort((m, n) => m - n);
}

// A new road's id, none of `taken`'s.
export function roadId(taken, random = Math.random) {
  for (;;) {
    const id = `road${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.some((r) => r.id === id)) return id;
  }
}

export const roadsPath = (continent) => `places/continents/${continent}/roads.json`;
