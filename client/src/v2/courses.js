// Courses: streams and rivers, drawn by hand as lines running downstream and kept with the bodies
// in each continent's water.json (water.js). A course is
//
//   { type: "stream" | "river", points: [[x, z, width], ...], surface: [ft, ...], seed }
//
// continent feet, its points from its source down, each with how wide its water is there. Its
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
const MOUTH_GRADE = 0.25; // how steeply, ft a foot, a course at most falls to the water it runs into
const TRACK_STEP_FT = 4; // how far apart its track's points are
const MEANDER = 1.2; // how far its track wanders either side of its line, in widths
const MEANDER_MAX_FT = 60;
const MEANDER_WAVE = 11; // how far down it, in widths, it takes to wander there and back
const POOL_WAVE = 6; // and to go from one pool to the next
const BEND_WIDTHS = 1.5; // how sharply it turns, as the widths round a turn of a radian, for its bend to count fully
const GRID_FT = 32; // its track's segments are found by squares this wide

// How deep a course of `type` is under its middle, `width` ft wide.
export function depthOf(type, width) {
  return type === "river" ? Math.min(12, Math.max(2, width / 10)) : Math.min(2, Math.max(1, width / 4));
}

// How far out from a course's line its channel reaches, at its widest.
export const reachOf = ({ points }) => {
  const widest = Math.max(...points.map((p) => p[2]));
  return Math.min(MEANDER_MAX_FT, widest * MEANDER) + widest * 0.7 + BANK_FT;
};

// A course's box, [x0, z0, x1, z1], with its channel.
export function courseBox(course) {
  const r = reachOf(course);
  const xs = course.points.map((p) => p[0]);
  const zs = course.points.map((p) => p[1]);
  return [Math.min(...xs) - r, Math.min(...zs) - r, Math.max(...xs) + r, Math.max(...zs) + r];
}

// A wave from -1 to 1 at `phase` (in waves), not quite regular, by `seed`.
function wave(phase, seed) {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 12345.6789;
  return 0.65 * Math.sin(2 * Math.PI * phase + a) + 0.35 * Math.sin(2 * Math.PI * 1.73 * phase + b);
}

const tracks = new WeakMap(); // points -> their track, by seed

// The track a course's water runs down, from its `points` and `seed`: { x, z, t, width, depth,
// bend } at each of its points, every TRACK_STEP_FT or so, t how far down it, width how wide its
// water is there, depth how much deeper than depthOf has it, as a share, and bend how sharply it
// turns, -1 (right) to 1 (left); with `length` and a grid of its segments.
export function trackOf(points, seed = 0) {
  const kept = tracks.get(points);
  if (kept?.seed === seed) return kept;
  const given = points;
  if (points.length < 2) points = [points[0], points[0]];
  // A curve through the points (Catmull-Rom), each with its width.
  const curve = [];
  for (let k = 1; k < points.length; k++) {
    const [p0, p1, p2, p3] = [points[Math.max(0, k - 2)], points[k - 1], points[k], points[Math.min(points.length - 1, k + 1)]];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / TRACK_STEP_FT));
    for (let m = k === 1 ? 0 : 1; m <= n; m++) {
      const u = m / n;
      const at = (c) => 0.5 * (2 * p1[c] + (p2[c] - p0[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u + (3 * p1[c] - p0[c] - 3 * p2[c] + p3[c]) * u * u * u);
      curve.push([at(0), at(1), p1[2] + (p2[2] - p1[2]) * u]);
    }
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
  const track = { seed, length: t.at(-1), x: [], z: [], t, width: [], depth: [], bend: [] };
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
  const reach = reachOf({ points });
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
// to its left (+) or right (-), and its width, depth and bend there }, or null where it's further
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
    best = { d, t: mix(track.t), side: Math.sign(left) * d, width: mix(track.width), depth: mix(track.depth), bend: mix(track.bend) };
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

// A course's surface down its track, from its `points` and `seed`, and groundAt(x, z): BELOW_FT
// under the ground in its middle and EDGE_BELOW_FT under it just past its edges, but never over the surface upstream of it, nor under the water it runs into,
// stillAt(x, z) (a body's or the sea's level, or null), to a tenth of a foot. Where it runs into
// that water, it falls to it no more steeply than MOUTH_GRADE, over as far as that takes from
// where it was just before it.
export function profile(points, groundAt, stillAt = () => null, seed = 0) {
  const track = trackOf(points, seed);
  const surface = [];
  let low = Infinity;
  let mouth = -1; // where it first runs into still water
  let k = 1;
  for (let t = 0; t <= track.length + SURFACE_STEP_FT; t += SURFACE_STEP_FT) {
    const at = Math.min(t, track.length);
    while (k < track.t.length - 1 && track.t[k] < at) k++;
    const span = track.t[k] - track.t[k - 1];
    const u = span ? (at - track.t[k - 1]) / span : 0;
    const [x, z] = [track.x[k - 1] + (track.x[k] - track.x[k - 1]) * u, track.z[k - 1] + (track.z[k] - track.z[k - 1]) * u];
    const [ground, still] = [groundAt(x, z), stillAt(x, z)];
    if (still != null && ground < still && mouth < 0) mouth = surface.length;
    // Square to it, out past each edge.
    const [dx, dz] = [track.x[k] - track.x[k - 1], track.z[k] - track.z[k - 1]];
    const d = Math.hypot(dx, dz) || 1;
    const out = (track.width[k - 1] + (track.width[k] - track.width[k - 1]) * u) / 2 + MARGIN_FT;
    const edges = Math.min(groundAt(x - (dz / d) * out, z + (dx / d) * out), groundAt(x + (dz / d) * out, z - (dx / d) * out));
    low = Math.min(low, Math.max(Math.min(ground - BELOW_FT, edges - EDGE_BELOW_FT), still ?? -Infinity));
    surface.push(low);
  }
  const before = surface[mouth - 1];
  for (let n = mouth - 1; n >= 0 && surface[n + 1] + MOUTH_GRADE * SURFACE_STEP_FT < before; n--) surface[n] = Math.min(surface[n], surface[n + 1] + MOUTH_GRADE * SURFACE_STEP_FT);
  return surface.map((v) => Math.round(v * 10) / 10);
}

// What a course makes of the ground at (x, z): { top, the highest the ground's left there, levee,
// the lowest it's built up to on its banks, level, the water's surface, and wet, whether that's
// within its water }, or null where its channel doesn't reach. Its bed's deepest toward the
// outside of a bend, and its bank's steeper there. Its levee's a little over its water out to
// LEVEE_TOP_FT past its edge, falling away from there as steeply as its bank rises.
export function shape(course, x, z) {
  if (!course.surface?.length) return null;
  const track = trackOf(course.points, course.seed ?? 0);
  const near = onTrack(track, x, z, reachOf(course));
  if (!near) return null;
  const half = near.width / 2;
  const level = surfaceAt(course.surface, near.t);
  const out = near.d - half;
  if (out > BANK_FT) return null;
  // Its deepest line, toward the outside: right of its middle when it turns left.
  const deepest = -near.bend * 0.4 * half;
  const across = near.side >= deepest ? (near.side - deepest) / (half - deepest) : (deepest - near.side) / (half + deepest);
  const bed = Math.max(0, 1 - across * across) * depthOf(course.type, near.width) * near.depth;
  const outside = near.side * near.bend < 0;
  const run = BANK_RUN * (outside ? 1 - 0.6 * Math.abs(near.bend) : 1 + 2 * Math.abs(near.bend));
  const top = out <= 0 ? level - bed : level + out / run;
  const levee = out <= 0 ? -Infinity : level + LEVEE_OVER_FT - Math.max(0, out - LEVEE_TOP_FT) / run;
  return { top, levee, level, wet: out <= MARGIN_FT };
}
