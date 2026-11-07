import { fbm } from "../world/noise.js";
import { inside } from "./biomes.js";

// Courses: streams and rivers, drawn by hand as lines running downstream and kept with the bodies
// in each continent's water.json (water.js). A course is
//
//   { type: "stream" | "river", points: [[x, z, width], ...], surface: [ft, ...], seed, joins: [[t, width], ...], pools: [...] }
//
// continent feet, its points from its source down, each with how wide its water is there, and
// joins, where other courses run into it, if any: t ft down its line, `width` wide. Below each,
// it's wider, by the root of the sum of its width and theirs squared, over WIDEN_WIDTHS. Pools,
// if any, are low spots it fills as ponds (profile), each { level, from, to, points }. Its
// water doesn't follow that line straight: it runs down a track (trackOf) curved through its
// points, meandering either side of them by its width, the way `seed` has it, wider and deeper in
// its bends and pools than in its riffles. `surface` is its water's height every SURFACE_STEP_FT
// down that track from its source, worked out once from the ground when it's drawn (profile), so
// it never rises, and changing the ground later never moves it. Its channel is carved under it
// (shape): a bed curving down under its middle, deepest toward the outside of its bends, and banks
// sloping up from its edges where the ground's higher, steep outside its bends and gentle inside.

export const COURSE_TYPES = ["stream", "river"];
export const WIDTHS = { stream: 6, river: 40 }; // new courses' widths, ft
export const SURFACE_STEP_FT = 8;
export const BELOW_FT = 1; // how far under the ground beside it a course's surface starts
const BANK_RUN = 1.5; // banks rise a foot every this many feet out
const BANK_FT = 18; // and reach this far out from the water's edge
export const MARGIN_FT = 2; // the water reaches this far past its edge, where the ground's lower
const EDGE_BELOW_FT = 0.25; // how far under the ground at its edges a course's surface starts
export const LEVEE_FT = 2; // how far a course's banks are built up, at most, where they're lower than its water
const LEVEE_OVER_FT = 0.5; // to this far over its water
const LEVEE_TOP_FT = 6; // out to this far past its edge, wider than a cell, before falling away
const FALL_STEEP = 0.5; // how steeply, ft a foot, a course's surface falls where it's falling
const FALL_FT = [4, 8]; // how far it falls, at least, to be a fall, for streams and courses this many times as wide
const FALL_WIDTHS = 5; // how wide courses are, as times FALL_FT[1], whose falls are the tallest least
const LEDGE_FT = 4; // how far past where it starts to fall a fall's lip is built out, a cell
export const LEDGE_RAISE_FT = 12; // and how far up it's built, at most
const POOL_WIDTHS = 2.5; // how far below a fall, in widths, its plunge pool reaches
const POOL_DEEP = 0.3; // how much deeper its pool is than the course, as a share of how far it falls
const POOL_DEEP_FT = 12; // at most
const POOL_WIDE = 0.5; // how much wider, as a share of the course's width
const POOL_WALL = 0.25; // how steep its walls are, as a share of a bank's run, at its foot
const POOL_JAG_FT = [2.5, 1]; // how far its walls and its bed are broken up, either way, at its foot
const POOL_JAG_WAVE_FT = 7;
const SEED = 0x636f7572;
export const CASCADE_STEEP = 1 / 8; // how steeply, ft a foot, a course falls at least down its cascades
const CASCADE_FT = 1.5; // and how far they fall, at least
const POOL_STEP = 2.2; // how far apart, in widths, their steps are
const STEP_BOULDERS = [2, 6]; // how many boulders lie across each step, at least and at most
const STEP_BOULDER_FT = 6; // one more for every this many ft wide
const STEP_BOULDER_MAX_FT = 7; // how big they are at most
const SCOUR = { widths: 0.8, deep: 0.5, ft: 3 }; // how far below each step, in widths, it's scoured, how much deeper, as a share of the step, and at most
const POOL_MIN_FT = 2; // how far a course would cut into a rise, at least, for the low spot above it to be filled as a pool, and how much higher that has it
const MOUTH_GRADE = 0.25; // how steeply, ft a foot, a course at most falls to the water it runs into
const TRACK_STEP_FT = 4; // how far apart its track's points are
const MEANDER = 1.2; // how far its track wanders either side of its line, in widths
const MEANDER_MAX_FT = 60;
const MEANDER_WAVE = 11; // how far down it, in widths, it takes to wander there and back
const POOL_WAVE = 6; // and to go from one pool to the next
const BEND_WIDTHS = 1.5; // how sharply it turns, as the widths round a turn of a radian, for its bend to count fully
const GRID_FT = 32; // its track's segments are found by squares this wide
const WIDEN_WIDTHS = 2; // how far below where another joins it, in widths, a course is as wide as that makes it

// How deep a course of `type` is under its middle, `width` ft wide.
export function depthOf(type, width) {
  return type === "river" ? Math.min(12, Math.max(2, width / 10)) : Math.min(2, Math.max(1, width / 4));
}

// How wide a course `width` wide is, with others' `widths` run into it.
export const widened = (width, widths) => Math.sqrt(widths.reduce((sum, w) => sum + w * w, width * width));

// How far out from a course's line its channel reaches, at its widest.
export const reachOf = ({ points, joins = [] }) => {
  const widest = widened(Math.max(...points.map((p) => p[2])), joins.map((j) => j[1]));
  return Math.min(MEANDER_MAX_FT, widest * MEANDER) + widest * 0.7 + BANK_FT;
};

// A course's box, [x0, z0, x1, z1], with its channel and pools.
export function courseBox(course) {
  const r = reachOf(course);
  const xs = course.points.map((p) => p[0]);
  const zs = course.points.map((p) => p[1]);
  const box = [Math.min(...xs) - r, Math.min(...zs) - r, Math.max(...xs) + r, Math.max(...zs) + r];
  for (const pool of course.pools ?? []) {
    for (const [x, z] of pool.points) [box[0], box[1], box[2], box[3]] = [Math.min(box[0], x), Math.min(box[1], z), Math.max(box[2], x), Math.max(box[3], z)];
  }
  return box;
}

// A wave from -1 to 1 at `phase` (in waves), not quite regular, by `seed`.
function wave(phase, seed) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 12345.6789;
  return 0.65 * Math.sin(2 * Math.PI * phase + a) + 0.35 * Math.sin(2 * Math.PI * 1.73 * phase + b);
}

const tracks = new WeakMap(); // points -> their track, by seed and joins

// The track a course's water runs down, from its `points`, `seed` and `joins`: { x, z, t, width, depth,
// bend } at each of its points, every TRACK_STEP_FT or so, t how far down it, width how wide its
// water is there, depth how much deeper than depthOf has it, as a share, and bend how sharply it
// turns, -1 (right) to 1 (left); with `length` and a grid of its segments.
export function trackOf(points, seed = 0, joins = []) {
  const kept = tracks.get(points);
  const key = JSON.stringify(joins);
  if (kept?.seed === seed && kept.joins === key) return kept;
  const given = points;
  if (points.length < 2) points = [points[0], points[0]];
  // A curve through the points (Catmull-Rom), each with its width, wider below joins.
  const curve = [];
  let lineAt = 0;
  for (let k = 1; k < points.length; k++) {
    const chord = Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
    const [p0, p1, p2, p3] = [points[Math.max(0, k - 2)], points[k - 1], points[k], points[Math.min(points.length - 1, k + 1)]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / TRACK_STEP_FT));
    for (let m = k === 1 ? 0 : 1; m <= n; m++) {
      const u = m / n;
      const at = (c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * u * u * u);
      const w = p1[2] + (p2[2] - p1[2]) * u;
      const ramp = (t) => {
        const v = Math.min(1, Math.max(0, (lineAt + chord * u - t) / (WIDEN_WIDTHS * w)));
        return v * v * (3 - 2 * v);
      };
      curve.push([at(0), at(1), Math.sqrt(joins.reduce((sum, [t, width]) => sum + ramp(t) * width * width, w * w))]);
    }
    lineAt += chord;
  }
  const lengths = (line) => {
    const t = [0];
    for (let k = 1; k < line.length; k++) t.push(t[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
    return t;
  };
  const along = lengths(curve);
  const total = along.at(-1);
  // Wandering off the curve, square to it, by less near its ends, which stay where they're drawn.
  let phase = 0;
  const line = curve.map(([x, z, w], k) => {
    if (k) phase += (along[k] - along[k - 1]) / (MEANDER_WAVE * w);
    const [a, b] = [curve[Math.max(0, k - 1)], curve[Math.min(curve.length - 1, k + 1)]];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ends = Math.min(1, Math.min(along[k], total - along[k]) / (3 * w));
    const off = Math.min(MEANDER_MAX_FT, MEANDER * w) * wave(phase, seed) * ends * ends * (3 - 2 * ends);
    return [x - ((b[1] - a[1]) / d) * off, z + ((b[0] - a[0]) / d) * off, w];
  });
  const t = lengths(line);
  // How sharply it turns at each point, over about a width either way.
  const heading = line.map((p, k) => {
    const [a, b] = [line[Math.max(0, k - 1)], line[Math.min(line.length - 1, k + 1)]];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  });
  let pools = 0;
  const track = { seed, joins: key, length: t.at(-1), x: [], z: [], t, width: [], depth: [], bend: [] };
  for (let k = 0; k < line.length; k++) {
    const w = line[k][2];
    let [a, b] = [k, k];
    while (a > 0 && t[k] - t[a] < w) a--;
    while (b < line.length - 1 && t[b] - t[k] < w) b++;
    let turn = heading[b] - heading[a];
    turn -= 2 * Math.PI * Math.round(turn / (2 * Math.PI));
    // Turning by `turn` over t[b] - t[a] ft; +z is to the left of +x here, so a turn toward it's left.
    const bend = t[b] > t[a] ? Math.max(-1, Math.min(1, (turn / (t[b] - t[a])) * w * BEND_WIDTHS)) : 0;
    if (k) pools += (t[k] - t[k - 1]) / (POOL_WAVE * w);
    const pool = wave(pools, seed + 1);
    track.x.push(line[k][0]);
    track.z.push(line[k][1]);
    track.width.push(w * (1 - 0.15 * pool + 0.25 * Math.abs(bend)));
    track.depth.push(1 + 0.35 * pool + 0.4 * Math.abs(bend));
    track.bend.push(bend);
  }
  // Each segment in the squares it reaches, with its channel.
  const reach = reachOf({ points, joins });
  track.grid = new Map();
  for (let k = 1; k < line.length; k++) {
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
  tracks.set(given, track);
  return track;
}

// Where (x, z) is from a course's track: { t, how far down it the nearest point is, side, how far
// to its left (+) or right (-), its width, depth and bend there, and along, which way it runs }, or null where it's further
// than `reach`.
export function onTrack(track, x, z, reach = Infinity) {
  let best = null;
  for (const k of track.grid.get(`${Math.floor(x / GRID_FT)},${Math.floor(z / GRID_FT)}`) ?? []) {
    const [ax, az, bx, bz] = [track.x[k - 1], track.z[k - 1], track.x[k], track.z[k]];
    const [dx, dz] = [bx - ax, bz - az];
    const length = Math.hypot(dx, dz);
    const u = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (length * length))) : 0;
    const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
    if (d > reach || (best && d >= best.d)) continue;
    const mix = (v) => v[k - 1] + (v[k] - v[k - 1]) * u;
    const left = length ? (dx * (z - az) - dz * (x - ax)) / length : 0;
    best = { d, t: mix(track.t), side: Math.sign(left) * d, width: mix(track.width), depth: mix(track.depth), bend: mix(track.bend), along: length ? [dx / length, dz / length] : [0, 0] };
  }
  return best;
}

// How long a course's line is, in feet.
export function lengthOf(points) {
  let length = 0;
  for (let k = 1; k < points.length; k++) length += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
  return length;
}

// Where (x, z) is from a course's line: { t, how far along it from its source the nearest point
// is, d, how far from it, and width, the course's there }, or null where it's further than `reach`.
export function along(points, x, z, reach = Infinity) {
  let best = null;
  let start = 0;
  for (let k = 1; k < points.length; k++) {
    const [[ax, az, aw], [bx, bz, bw]] = [points[k - 1], points[k]];
    const [dx, dz] = [bx - ax, bz - az];
    const length = Math.hypot(dx, dz);
    if (Math.min(ax, bx) - reach <= x && x <= Math.max(ax, bx) + reach && Math.min(az, bz) - reach <= z && z <= Math.max(az, bz) + reach) {
      const u = length ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (length * length))) : 0;
      const d = Math.hypot(ax + dx * u - x, az + dz * u - z);
      if (d <= reach && (!best || d < best.d)) best = { t: start + u * length, d, width: aw + (bw - aw) * u };
    }
    start += length;
  }
  return best;
}

// A course's surface `t` ft along it.
export function surfaceAt(surface, t) {
  const at = Math.max(0, Math.min(surface.length - 1, t / SURFACE_STEP_FT));
  const k = Math.min(surface.length - 2, Math.floor(at));
  if (k < 0) return surface[0];
  return surface[k] + (surface[k + 1] - surface[k]) * (at - k);
}

// A course's surface down its track, from its `points`, `seed` and `joins`, and groundAt(x, z):
// BELOW_FT under the ground in its middle and EDGE_BELOW_FT under it just past its edges, but
// never over the surface upstream of it, nor under the water it runs into, stillAt(x, z) (a body's
// or the sea's level, or null), to a tenth of a foot. Where it runs into that water, it falls to
// it no more steeply than MOUTH_GRADE, over as far as that takes from where it was just before it.
// joinAt(x, z) gives the level of another course's water at (x, z), or null: where it runs into
// that, it's at that level, falling straight to it where it's higher, and backed up to it where
// it's lower, as far up as it's lower, as it is to still water it arrives lower than. With poolAt(x, z, low, most), as pools.js has it, where
// it'd cut POOL_MIN_FT or more into a rise, the low spot above it's filled as a pool instead,
// as far as that goes. { surface, pools: [{ level, from, to, how far down its track it's in it,
// and points, its outline }] }.
export function profile({ points, seed = 0, joins = [] }, groundAt, stillAt = () => null, joinAt = () => null, poolAt = null) {
  const track = trackOf(points, seed, joins);
  const [raw, into, xs, zs] = [[], [], [], []]; // and the level of the water it's in there, or null
  let mouth = -1; // where it first runs into still water
  let k = 1;
  for (let t = 0; t <= track.length + SURFACE_STEP_FT; t += SURFACE_STEP_FT) {
    const at = Math.min(t, track.length);
    while (k < track.t.length - 1 && track.t[k] < at) k++;
    const span = track.t[k] - track.t[k - 1];
    const u = span ? (at - track.t[k - 1]) / span : 0;
    const [x, z] = [track.x[k - 1] + (track.x[k] - track.x[k - 1]) * u, track.z[k - 1] + (track.z[k] - track.z[k - 1]) * u];
    const [ground, still] = [groundAt(x, z), stillAt(x, z)];
    if (still != null && ground < still && mouth < 0) mouth = raw.length;
    // Square to it, out past each edge.
    const [dx, dz] = [track.x[k] - track.x[k - 1], track.z[k] - track.z[k - 1]];
    const d = Math.hypot(dx, dz) || 1;
    const out = (track.width[k - 1] + (track.width[k] - track.width[k - 1]) * u) / 2 + MARGIN_FT;
    const edges = Math.min(groundAt(x - (dz / d) * out, z + (dx / d) * out), groundAt(x + (dz / d) * out, z - (dx / d) * out));
    const join = joinAt(x, z);
    raw.push(Math.min(Math.max(Math.min(ground - BELOW_FT, edges - EDGE_BELOW_FT), still ?? -Infinity), join ?? Infinity));
    into.push(join ?? still);
    xs.push(x);
    zs.push(z);
  }
  const surface = [];
  const pools = [];
  let [low, lowest] = [Infinity, 0]; // and where it got that low
  let past = 0; // where the last rise tried ends
  let held = -1; // and where a pool's held to, its crest
  for (let n = 0; n < raw.length; n++) {
    if (poolAt && n >= past && n > 0 && raw[n] > low + POOL_MIN_FT) {
      // A rise: filled to as high as its crest, at most, else cut through.
      let [crest, top] = [raw[n], n];
      for (past = n; past < raw.length && raw[past] > low; past++) if (raw[past] > crest) [crest, top] = [raw[past], past];
      const pool = poolAt(xs[lowest], zs[lowest], low, crest);
      if (pool && pool.level >= low + POOL_MIN_FT) {
        let from = n;
        while (from > 0 && surface[from - 1] < pool.level) surface[--from] = pool.level;
        pools.push({ level: pool.level, from: from * SURFACE_STEP_FT, at: n, points: pool.points });
        [low, held] = [pool.level, top];
      }
    }
    if (raw[n] <= low && n > held) [low, lowest] = [raw[n], n];
    surface.push(low);
  }
  for (const pool of pools) {
    let n = pool.at;
    while (n < surface.length && surface[n] >= pool.level) n++;
    pool.to = n * SURFACE_STEP_FT;
    delete pool.at;
  }
  for (let n = surface.length - 1, backed = -Infinity; n >= 0; n--) {
    if (into[n] != null) backed = Math.max(backed, into[n]);
    if (surface[n] < backed) surface[n] = backed;
    else if (into[n] == null) backed = -Infinity;
  }
  const before = surface[mouth - 1];
  for (let n = mouth - 1; n >= 0 && surface[n + 1] + MOUTH_GRADE * SURFACE_STEP_FT < before; n--) surface[n] = Math.min(surface[n], surface[n + 1] + MOUTH_GRADE * SURFACE_STEP_FT);
  return { surface: surface.map((v) => Math.round(v * 10) / 10), pools: pools.map(({ level, from, to, points }) => ({ level, from, to, points })) };
}

// What a course makes of the ground at (x, z): { top, the highest the ground's left there, levee,
// the lowest it's built up to on its banks, ledge, whether that's over a fall's ledge, level, the water's surface, and wet, whether that's
// within its water }, or null where its channel doesn't reach. Its bed's deepest toward the
// outside of a bend, and its bank's steeper there, and under a fall, steep and broken up. Its levee's a little over its water out to
// LEVEE_TOP_FT past its edge, falling away from there as steeply as its bank rises.
export function shape(course, x, z) {
  if (!course.surface?.length) return null;
  const track = trackOf(course.points, course.seed ?? 0, course.joins);
  const near = onTrack(track, x, z, reachOf(course));
  if (!near) return null;
  const level = levelAt(course, near.t);
  // Below a fall, its plunge pool, deepest and widest at its foot.
  const pool = poolAt(course, near.t, near.width);
  const jag = pool.share ? fbm(x, z, SEED, { wavelength: POOL_JAG_WAVE_FT, octaves: 2 }) * pool.share : 0;
  const half = (near.width / 2) * (1 + POOL_WIDE * pool.share * (1 + jag));
  const out = near.d - half;
  if (out > BANK_FT) return null;
  // Its deepest line, toward the outside: right of its middle when it turns left.
  const deepest = -near.bend * 0.4 * half;
  const across = near.side >= deepest ? (near.side - deepest) / (half - deepest) : (deepest - near.side) / (half + deepest);
  const bed = Math.max(0, 1 - across * across) * (depthOf(course.type, near.width) * near.depth + pool.deeper);
  const outside = near.side * near.bend < 0;
  // Rocky and steep round a plunge pool.
  const run = BANK_RUN * (outside ? 1 - 0.6 * Math.abs(near.bend) : 1 + 2 * Math.abs(near.bend)) * (1 - (1 - POOL_WALL) * pool.share);
  // Broken up by rock jutting out of its walls, never cut back below its water, and its bed both ways.
  const top = out <= 0 ? level - bed + jag * POOL_JAG_FT[1] : level + out / run + Math.abs(jag) * POOL_JAG_FT[0];
  // Over a fall's ledge, built up to hold its water to its lip; in a pool, its banks under its water aren't.
  const ledge = fallsOf(course).some((fall) => near.t >= fall.t && near.t <= fall.lip);
  const pooled = (course.pools ?? []).some((pool) => near.t >= pool.from && near.t <= pool.to);
  const levee = ledge ? top : out <= 0 || pooled ? -Infinity : level + LEVEE_OVER_FT - Math.max(0, out - LEVEE_TOP_FT) / run;
  return { top, levee, ledge, level, wet: out <= MARGIN_FT };
}

// The pools of `courses` reaching into `box` ([x0, z0, x1, z1]), for pooledAt: [{ course, level,
// points, box }].
export function poolsIn(courses, [x0, z0, x1, z1] = [-Infinity, -Infinity, Infinity, Infinity]) {
  const out = [];
  for (const course of courses) {
    for (const { level, points } of course.pools ?? []) {
      if (points.length < 3) continue;
      const xs = points.map((p) => p[0]);
      const zs = points.map((p) => p[1]);
      const box = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
      if (box[0] <= x1 && box[2] >= x0 && box[1] <= z1 && box[3] >= z0) out.push({ course, level, points, box });
    }
  }
  return out;
}

// The pool of `pools` (poolsIn) that (x, z) is inside the outline of, or null.
export function pooledAt(pools, x, z) {
  for (const pool of pools) if (x >= pool.box[0] && x <= pool.box[2] && z >= pool.box[1] && z <= pool.box[3] && inside(pool.points, x, z)) return pool;
  return null;
}

const SPEEDS = { stream: 1.5, river: 2.5 }; // how fast courses run on the level, ft/s
const SPEED_PER_SLOPE = 40; // and how much faster for each foot they fall a foot
const SPEED_MAX = 14;

// How a course's water runs at (x, z): { flow, [x and z ft/s, and how steep it is there, the root
// of its fall a foot], slower toward its banks, level, its surface there, and d, how far that is
// from its track }, or null where it's not in its water.
export function flowOf(course, x, z) {
  if (!course.surface?.length) return null;
  const near = onTrack(trackOf(course.points, course.seed ?? 0, course.joins), x, z, reachOf(course));
  if (!near || near.d > near.width / 2 + MARGIN_FT + 4) return null;
  // Its slope there, but for its falls, whose foam's drawn with them.
  const [a, b] = [near.t - SURFACE_STEP_FT, near.t + SURFACE_STEP_FT];
  const dropped = fallsOf(course).reduce((sum, fall) => sum + (fall.lip >= a && fall.lip < b ? fall.top - fall.bottom : 0), 0);
  const slope = Math.max(0, (levelAt(course, a) - levelAt(course, b) - dropped) / (2 * SURFACE_STEP_FT));
  const middle = Math.max(0.3, 1 - (near.d / (near.width / 2 + MARGIN_FT)) ** 2);
  const speed = Math.min(SPEED_MAX, SPEEDS[course.type] + SPEED_PER_SLOPE * slope) * middle;
  return { flow: [near.along[0] * speed, near.along[1] * speed, Math.sqrt(slope)], level: levelAt(course, near.t), d: near.d };
}

const features = new WeakMap(); // surface -> its course's falls and cascades

// How far a course `width` ft wide falls, at least, for that to be a fall.
export const fallFtOf = (type, width) => (type === "stream" ? FALL_FT[0] : Math.min(FALL_FT[1], Math.max(FALL_FT[0], width / FALL_WIDTHS)));

// Where a course's track is `t` ft down it: { x, z, width, along, which way it runs }.
function placeOn(track, t) {
  const n = Math.max(1, track.t.findIndex((v) => v >= t));
  const length = Math.hypot(track.x[n] - track.x[n - 1], track.z[n] - track.z[n - 1]) || 1;
  return { x: track.x[n], z: track.z[n], width: track.width[n], along: [(track.x[n] - track.x[n - 1]) / length, (track.z[n] - track.z[n - 1]) / length] };
}

// A course's falls and cascades, from its surface. Falls are where it falls more steeply than
// FALL_STEEP for at least fallFtOf: [{ t, how far down its track it starts falling, lip, where
// its lip is, built out LEDGE_FT past that, end, and its foot, top and bottom, its surface over
// the lip and at its foot, and where its lip is, as placeOn has it }]. Cascades are the rest of it steeper than CASCADE_STEEP, for at least CASCADE_FT: [{ t,
// end, and steps, [{ t, top, bottom, and where, as falls have them }] }], a pool before each
// step at the level its stretch reaches by the next, so its bed's cut into steps, POOL_STEP
// widths or so long. Both from its source down.
function featuresOf(course) {
  const { surface } = course;
  if (!surface?.length) return { falls: [], cascades: [] };
  const kept = features.get(surface);
  if (kept?.points === course.points && kept.joins === course.joins) return kept;
  const seed = course.seed ?? 0;
  const track = trackOf(course.points, seed, course.joins);
  const falls = [];
  const steep = (k, slope) => (surface[k - 1] - surface[k]) / SURFACE_STEP_FT >= slope;
  const falling = new Uint8Array(surface.length);
  for (let k = 1; k < surface.length; k++) {
    if (!steep(k, FALL_STEEP)) continue;
    let end = k;
    while (end + 1 < surface.length && steep(end + 1, FALL_STEEP)) end++;
    const t = (k - 1) * SURFACE_STEP_FT;
    const at = placeOn(track, t);
    if (surface[k - 1] - surface[end] >= fallFtOf(course.type, at.width)) {
      const lip = Math.min(t + LEDGE_FT, end * SURFACE_STEP_FT);
      falls.push({ t, lip, end: end * SURFACE_STEP_FT, top: surface[k - 1], bottom: surface[end], ...placeOn(track, lip) });
      for (let n = k; n <= end; n++) falling[n] = 1;
    }
    k = end;
  }
  const cascades = [];
  for (let k = 1; k < surface.length; k++) {
    if (falling[k] || !steep(k, CASCADE_STEEP)) continue;
    let end = k;
    while (end + 1 < surface.length && !falling[end + 1] && steep(end + 1, CASCADE_STEEP)) end++;
    const [t, last] = [(k - 1) * SURFACE_STEP_FT, end * SURFACE_STEP_FT];
    if (surface[k - 1] - surface[end] >= CASCADE_FT) {
      // Steps POOL_STEP widths apart, give or take a third, the last pool ending where it does.
      const lips = [t];
      for (let n = 0; ; n++) {
        const width = placeOn(track, lips.at(-1)).width;
        const next = lips.at(-1) + width * POOL_STEP * (0.67 + 0.66 * rand(seed, t + n));
        if (next > last - width * POOL_STEP * 0.5) break;
        lips.push(next);
      }
      const steps = lips.map((lip, n) => {
        const top = n ? surfaceAt(surface, lip) : surface[k - 1];
        return { t: lip, top, bottom: surfaceAt(surface, lips[n + 1] ?? last), ...placeOn(track, lip) };
      });
      cascades.push({ t, end: last, steps });
    }
    k = end;
  }
  const found = { points: course.points, joins: course.joins, falls, cascades };
  features.set(surface, found);
  return found;
}

// A steady number from 0 to 1 for `seed` and `n`.
function rand(seed, n) {
  const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

// The boulders across a course's cascades' steps: [{ x, z, size, ft, yaw, roll(n), steady numbers
// from 0 to 1 }], a few across each, more the wider it is, from one bank to the other.
export function boulders(course) {
  const out = [];
  const seed = course.seed ?? 0;
  for (const { steps } of cascadesOf(course)) {
    for (const [n, step] of steps.entries()) {
      const count = Math.min(STEP_BOULDERS[1], STEP_BOULDERS[0] + Math.floor(step.width / STEP_BOULDER_FT));
      for (let m = 0; m < count; m++) {
        const r = (q) => rand(seed + 17, step.t * 7 + m * 13 + q);
        // Spread across it, a little either way of the step.
        const side = ((m + 0.2 + 0.6 * r(0)) / count - 0.5) * step.width * 1.1;
        const ahead = (r(1) - 0.5) * 2;
        const [ax, az] = step.along;
        out.push({
          x: step.x + ax * ahead - az * side,
          z: step.z + az * ahead + ax * side,
          size: 2 + Math.min(STEP_BOULDER_MAX_FT - 2, step.width * 0.15) * (0.4 + 0.6 * r(2)),
          yaw: r(3) * Math.PI * 2,
          roll: (q) => r(4 + q),
        });
      }
    }
  }
  return out;
}

// A course's falls, as featuresOf has them.
export const fallsOf = (course) => featuresOf(course).falls;

// A course's cascades, as featuresOf has them.
export const cascadesOf = (course) => featuresOf(course).cascades;

// A course's surface `t` ft down its track, as surfaceAt has it but for its falls, where it holds
// over their ledges and steps down to their feet at their lips, and its cascades, flat in each pool and stepping down at each
// step.
export function levelAt(course, t) {
  const { falls, cascades } = featuresOf(course);
  for (const fall of falls) {
    if (t > fall.t && t <= fall.end) return t > fall.lip ? fall.bottom : fall.top;
  }
  for (const { t: start, end, steps } of cascades) {
    if (t < start || t > end) continue;
    for (let n = steps.length - 1; n >= 0; n--) if (t >= steps[n].t) return steps[n].bottom;
  }
  return surfaceAt(course.surface, t);
}

// A course's plunge pool `t` ft down its track, `width` ft wide there: { share, how far into it,
// from 1 at the fall's foot to 0 at its end, and deeper, how much deeper it is there }, and below
// a cascade's step, as much deeper as SCOUR has it, but not wider.
function poolAt(course, t, width) {
  const { falls, cascades } = featuresOf(course);
  let best = { share: 0, deeper: 0 };
  for (const fall of falls) {
    const share = 1 - (t - fall.lip) / (POOL_WIDTHS * width);
    if (t < fall.lip || share <= best.share) continue;
    const smooth = share * share * (3 - 2 * share);
    best = { share: smooth, deeper: Math.min(POOL_DEEP_FT, POOL_DEEP * (fall.top - fall.bottom)) * smooth };
  }
  for (const { t: start, end, steps } of cascades) {
    if (t < start || t > end + width) continue;
    for (const step of steps) {
      const share = 1 - (t - step.t) / (SCOUR.widths * width);
      if (t < step.t || share <= 0) continue;
      best = { share: best.share, deeper: Math.max(best.deeper, Math.min(SCOUR.ft, SCOUR.deep * (step.top - step.bottom)) * share * share * (3 - 2 * share)) };
    }
  }
  return best;
}
