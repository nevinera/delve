// Courses: streams and rivers, drawn by hand as lines running downstream and kept with the bodies
// in each continent's water.json (water.js). A course is
//
//   { type: "stream" | "river", points: [[x, z, width], ...], surface: [ft, ...] }
//
// continent feet, its points from its source down, each with how wide its water is there, and
// straight between. `surface` is its water's height every SURFACE_STEP_FT along it from its source,
// worked out once from the ground when it's drawn (profile), so it never rises, and changing the
// ground later never moves it. Its channel is carved under it (shape): a bed curving down DEPTH
// under its middle, and banks sloping up from its edges, where the ground's higher.

export const COURSE_TYPES = ["stream", "river"];
export const WIDTHS = { stream: 6, river: 40 }; // new courses' widths, ft
export const SURFACE_STEP_FT = 8;
export const BELOW_FT = 1; // how far under the ground beside it a course's surface starts
const BANK_RUN = 1.5; // banks rise a foot every this many feet out
const BANK_FT = 18; // and reach this far out from the water's edge
export const MARGIN_FT = 2; // the water reaches this far past its edge, where the ground's lower

// How deep a course of `type` is under its middle, `width` ft wide.
export function depthOf(type, width) {
  return type === "river" ? Math.min(12, Math.max(2, width / 10)) : Math.min(2, Math.max(1, width / 4));
}

// How far out from a course's line its channel reaches, at its widest.
export const reachOf = ({ points }) => Math.max(...points.map((p) => p[2])) / 2 + BANK_FT;

// A course's box, [x0, z0, x1, z1], with its channel.
export function courseBox(course) {
  const r = reachOf(course);
  const xs = course.points.map((p) => p[0]);
  const zs = course.points.map((p) => p[1]);
  return [Math.min(...xs) - r, Math.min(...zs) - r, Math.max(...xs) + r, Math.max(...zs) + r];
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

// A course's surface down its line `points`, from groundAt(x, z): BELOW_FT under the ground, but
// never over the surface upstream of it, to a tenth of a foot.
export function profile(points, groundAt) {
  const length = lengthOf(points);
  const surface = [];
  let low = Infinity;
  let [k, start] = [1, 0];
  for (let t = 0; t <= length + SURFACE_STEP_FT; t += SURFACE_STEP_FT) {
    const at = Math.min(t, length);
    while (k < points.length - 1 && start + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]) < at) {
      start += Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]);
      k++;
    }
    const [[ax, az], [bx, bz]] = [points[k - 1], points[k] ?? points[k - 1]];
    const seg = Math.hypot(bx - ax, bz - az);
    const u = seg ? (at - start) / seg : 0;
    low = Math.min(low, groundAt(ax + (bx - ax) * u, az + (bz - az) * u) - BELOW_FT);
    surface.push(Math.round(low * 10) / 10);
  }
  return surface;
}

// What a course makes of the ground at (x, z): { top, the highest the ground's left there, level,
// the water's surface, and wet, whether that's within its water }, or null where its channel
// doesn't reach.
export function shape(course, x, z) {
  const near = along(course.points, x, z, reachOf(course));
  if (!near || !course.surface?.length) return null;
  const half = near.width / 2;
  const level = surfaceAt(course.surface, near.t);
  const out = near.d - half;
  if (out > BANK_FT) return null;
  const bed = (1 - (near.d / half) ** 2) * depthOf(course.type, near.width);
  const top = out <= 0 ? level - bed : level + out / BANK_RUN;
  return { top, level, wet: out <= MARGIN_FT };
}
