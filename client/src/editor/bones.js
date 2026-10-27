import { LAND_FT, LandGrid, SEA_FLOOR_FT, landBounds } from "../world/landGrid.js";
import { hashString, valueNoise } from "../world/noise.js";
import { rain, slump } from "./erosion.js";
import { SHAPES, stamp } from "./sculptTools.js";

// A "bones" file: the land's shape as a list of operations, run in order on empty sea, so a person
// or an agent can write a landscape down and get the same land from it every time. JSON:
//
//   { "bones": 1, "seed": 42, "ops": [{ "op": "land", ... }, ...] }
//
// Places and lengths are in feet, x east and z south. Heights are feet above sea level. Shapes are
// `outline`s ([[x, z], ...], closed), `path`s ([[x, z], ...], open), or circles (`at` and `radius`).
// Ops that work over an area take an outline or a circle to keep them in, softened over `feather`
// ft inside its edge; without one they work over all the land there is so far. They can also be
// kept to ground `above` or `below` a height, easing in over HEIGHT_EASE_FT. Each op's noise
// comes from the seed and the op's place in the list.
//
// See OPS below for each op and what it takes; runBones() checks a file against them.

const WEAR_ABOVE_FT = 40; // noise and detail ease in over this much height above the sea

export const OPS = {
  // Raises land inside an outline: up from the coast to `height` over `inland` ft, and down to
  // the sea floor over `shelf` ft outside it. `rough` ft of noise wobbles the coastline into bays
  // and headlands. Kept where it's higher than the ground already there.
  land: { needs: ["outline"], takes: { height: 40, inland: 3000, shelf: 1500, rough: 0 } },
  // `count` islands scattered within `spread` ft of `around`, each `size` ft across (a range) and
  // `height` ft tall (a range), their coasts wobbled by `rough` (0 to 1) of their size.
  isles: { needs: ["around", "spread", "count"], takes: { size: [400, 2000], height: [20, 120], rough: 0.4 } },
  // A mountain ridge along a path, `width` ft either side and `height` ft tall at its crest, added
  // to the ground. `sharp` (0 to 1) runs from rounded hills to a knife edge, `vary` (0 to 1) how
  // much its height rises and falls along it, `jag` (0 to 1) how broken its crest and flanks are,
  // and `wander` (0 to 1) how far it strays from the path.
  ridge: { needs: ["path", "height", "width"], takes: { sharp: 0.5, vary: 0.4, jag: 0.4, wander: 0.3 } },
  // A valley or canyon along a path, `width` ft either side and `depth` ft deep in its middle,
  // cut into the ground. `sharp` (0 to 1) runs from a broad trough to a steep-walled canyon, and
  // `floor` keeps it from going lower than that height.
  valley: { needs: ["path", "depth", "width"], takes: { sharp: 0.3, floor: null, wander: 0.2 } },
  // `count` peaks within `spread` ft of `around`, `height` ft tall and `radius` ft across their
  // base (ranges), added to the ground.
  peaks: { needs: ["around", "spread", "count"], takes: { height: [300, 900], radius: [800, 2000], shape: "peak" } },
  // One of the stamp brush's shapes (peak, hill, mesa, crater) at `at`, as the stamp tool does.
  stamp: { needs: ["at", "shape", "radius", "height"], takes: { blend: "add" } },
  // A great crater at `at`, `radius` ft to the top of its wall: a floor at `floor` ft, sunk inside
  // a wall `wall` (0 to 1) of the radius thick and a rim `rim` ft above the ground around it,
  // falling away over `apron` ft. `rough` (0 to 1) wobbles its edge.
  crater: { needs: ["at", "radius", "floor"], takes: { rim: 200, wall: 0.1, apron: 3000, rough: 0.15 } },
  // Raises (or with a negative height, lowers) an area by `height` ft.
  lift: { needs: ["height"], area: true, takes: {} },
  // Pulls an area to `height` ft, `strength` (0 to 1) of the way.
  set: { needs: ["height"], area: true, takes: { strength: 1 } },
  // Adds noise up to `height` ft either way with features `wavelength` ft apart: "smooth" rolls,
  // "ridged" makes sharp crests and "billow" rounded lumps with creases between.
  noise: { needs: ["height", "wavelength"], area: true, takes: { kind: "smooth", octaves: 4 } },
  // Steps the ground every `step` ft, `strength` (0 to 1) of the way.
  terrace: { needs: ["step"], area: true, takes: { strength: 1 } },
  // Evens out the ground, `passes` times over.
  smooth: { needs: [], area: true, takes: { passes: 4 } },
  // Wears the ground away: by "water", `drops` raindrops a grid point each `size` times as heavy
  // as the brush's, or by "slump", `passes` times over where it's steeper than `talus` degrees.
  erode: { needs: ["by"], area: true, takes: { drops: 4, size: 10, passes: 20, talus: 35 } },
};
const AREA = { outline: null, at: null, radius: null, feather: 1000, above: null, below: null };
const HEIGHT_EASE_FT = 150; // above and below ease in over this much height

// The land a bones file describes, as a LandGrid. Throws, saying which op, when one's wrong.
export function runBones(bones) {
  if (bones?.bones !== 1 || !Array.isArray(bones.ops)) throw new Error('a bones file is { "bones": 1, "seed": ..., "ops": [...] }');
  const grid = new LandGrid();
  bones.ops.forEach((spec, n) => {
    const op = OPS[spec.op];
    const where = `op ${n + 1} (${spec.op})`;
    if (!op) throw new Error(`${where}: there's no such op; the ops are ${Object.keys(OPS).join(", ")}`);
    const missing = op.needs.filter((key) => spec[key] === undefined);
    if (missing.length) throw new Error(`${where}: needs ${missing.join(", ")}`);
    const known = new Set(["op", "note", ...op.needs, ...Object.keys(op.takes), ...(op.area ? Object.keys(AREA) : [])]);
    const unknown = Object.keys(spec).filter((key) => !known.has(key));
    if (unknown.length) throw new Error(`${where}: doesn't take ${unknown.join(", ")}`);
    const args = { ...op.takes, ...(op.area ? AREA : {}), ...spec, seed: hashString(`${bones.seed ?? 0}:${n}`) };
    RUN[spec.op](grid, args);
  });
  return grid;
}

// --- the ops ---

const RUN = {
  land(grid, { outline, height, inland, shelf, rough, seed }) {
    each(grid, boundsOf(outline, shelf + rough), (x, z, h) => {
      const d = polygonDistance(outline, x, z) + rough * fbm(x, z, seed, { wavelength: Math.max(rough * 2, 400), octaves: 5 });
      const ground = d < 0 ? height * smoothstep(0, inland, -d) : SEA_FLOOR_FT * smoothstep(0, shelf, d);
      return Math.max(h, ground);
    });
  },

  isles(grid, { around, spread, count, size, height, rough, seed }) {
    const random = seeded(seed);
    for (let n = 0; n < count; n++) {
      const [a, r] = [random() * Math.PI * 2, Math.sqrt(random()) * spread];
      const [cx, cz] = [around[0] + Math.cos(a) * r, around[1] + Math.sin(a) * r];
      const radius = between(size, random()) / 2;
      const top = between(height, random());
      const shelf = radius * 0.6 + 200;
      const isle = seed + n * 7919;
      each(grid, [cx - radius * (1 + rough) - shelf, cz - radius * (1 + rough) - shelf, cx + radius * (1 + rough) + shelf, cz + radius * (1 + rough) + shelf], (x, z, h) => {
        const d = Math.hypot(x - cx, z - cz) - radius + rough * radius * fbm(x, z, isle, { wavelength: Math.max(radius, 200), octaves: 4 });
        const ground = d < 0 ? top * smoothstep(0, radius * 0.8, -d) : SEA_FLOOR_FT * smoothstep(0, shelf, d);
        return Math.max(h, ground);
      });
    }
  },

  ridge(grid, { path, height, width, sharp, vary, jag, wander, seed }) {
    const length = pathLength(path);
    each(grid, boundsOf(path, width * (1 + wander) + 200), (x, z, h) => {
      const [wx, wz] = warp(x, z, seed, width * wander, width * 2);
      const { d, s } = pathDistance(path, wx, wz);
      if (d >= width) return h;
      const t = 1 - d / width;
      const profile = (1 - sharp) * (0.5 - 0.5 * Math.cos(Math.PI * t)) + sharp * t ** 1.6;
      const along = 1 + vary * fbm(s, 0, seed + 1, { wavelength: width * 3, octaves: 3 }) * 1.4;
      const ends = smoothstep(0, width, s) * smoothstep(0, width, length - s);
      const crags = 1 - jag + jag * ridged(x, z, seed + 2, width * 0.5, 5);
      return h + height * profile * Math.max(0.1, along) * ends * crags;
    });
  },

  valley(grid, { path, depth, width, sharp, floor, wander, seed }) {
    const length = pathLength(path);
    each(grid, boundsOf(path, width * (1 + wander) + 200), (x, z, h) => {
      const [wx, wz] = warp(x, z, seed, width * wander, width * 3);
      const { d, s } = pathDistance(path, wx, wz);
      if (d >= width) return h;
      const t = 1 - d / width;
      const profile = (1 - sharp) * (0.5 - 0.5 * Math.cos(Math.PI * t)) + sharp * smoothstep(0.3, 0.6, t);
      const ends = smoothstep(0, width * 0.5, s) * smoothstep(0, width * 0.5, length - s);
      const cut = h - depth * profile * ends;
      return floor === null ? cut : Math.max(Math.min(h, floor), cut);
    });
  },

  peaks(grid, { around, spread, count, height, radius, shape, seed }) {
    const random = seeded(seed);
    for (let n = 0; n < count; n++) {
      const [a, r] = [random() * Math.PI * 2, Math.sqrt(random()) * spread];
      const at = [around[0] + Math.cos(a) * r, around[1] + Math.sin(a) * r];
      applyChanges(grid, stamp(grid, { shape, blend: "add", height: between(height, random()), radius: between(radius, random()) }, at));
    }
  },

  stamp(grid, { at, shape, radius, height, blend }) {
    if (!SHAPES[shape]) throw new Error(`stamp: no shape ${shape}; the shapes are ${Object.keys(SHAPES).join(", ")}`);
    applyChanges(grid, stamp(grid, { shape, blend, height, radius }, at));
  },

  crater(grid, { at, radius, floor, rim, wall, apron, rough, seed }) {
    const [cx, cz] = at;
    const reach = radius * (1 + rough) + apron;
    each(grid, [cx - reach, cz - reach, cx + reach, cz + reach], (x, z, h) => {
      const r = Math.hypot(x - cx, z - cz) + rough * radius * fbm(x, z, seed, { wavelength: radius * 0.6, octaves: 4 });
      const d = r / radius;
      if (d >= 1) return h + rim * (1 - smoothstep(radius, radius + apron, r));
      if (d <= 1 - wall) return floor;
      // The wall climbs from the floor to the rim, standing on the ground as it was.
      return floor + (h + rim - floor) * smoothstep(1 - wall, 1, d) ** 0.7;
    });
  },

  lift(grid, { height, ...area }) {
    each(grid, areaBounds(grid, area), (x, z, h, w) => h + height * w, area);
  },

  set(grid, { height, strength, ...area }) {
    each(grid, areaBounds(grid, area), (x, z, h, w) => h + (height - h) * strength * w, area);
  },

  noise(grid, { height, wavelength, kind, octaves, seed, ...area }) {
    each(grid, areaBounds(grid, area), (x, z, h, w) => {
      const n =
        kind === "ridged" ? ridged(x, z, seed, wavelength, octaves) * 2 - 1 : kind === "billow" ? 1 - 2 * Math.abs(fbm(x, z, seed, { wavelength, octaves })) * 1.6 : fbm(x, z, seed, { wavelength, octaves }) * 1.6;
      return h + height * n * w * landward(h);
    }, area);
  },

  terrace(grid, { step, strength, ...area }) {
    each(grid, areaBounds(grid, area), (x, z, h, w) => {
      if (h <= 0) return h;
      // Flat treads with short slopes between them.
      const f = h / step - Math.floor(h / step);
      const stepped = (Math.floor(h / step) + smoothstep(0.75, 1, f)) * step;
      return h + (stepped - h) * strength * w;
    }, area);
  },

  smooth(grid, { passes, ...area }) {
    const bounds = areaBounds(grid, area);
    for (let p = 0; p < passes; p++) {
      const before = (gx, gz) => grid.point(gx, gz);
      const next = [];
      each(grid, bounds, (x, z, h, w) => {
        const [gx, gz] = [x / LAND_FT, z / LAND_FT];
        const mean = (before(gx + 1, gz) + before(gx - 1, gz) + before(gx, gz + 1) + before(gx, gz - 1)) / 4;
        next.push([gx, gz, h + (mean - h) * 0.5 * w]);
        return h;
      }, area);
      applyChanges(grid, next);
    }
  },

  erode(grid, { by, drops, size, passes, talus, seed, ...area }) {
    const [x0, z0, x1, z1] = areaBounds(grid, area);
    const region = { gx0: Math.floor(x0 / LAND_FT), gz0: Math.floor(z0 / LAND_FT), gx1: Math.ceil(x1 / LAND_FT), gz1: Math.ceil(z1 / LAND_FT), weight: (x, z) => areaWeight(area, x, z) * heightWeight(area, grid.heightAt(x, z)) };
    const cells = (region.gx1 - region.gx0 + 1) * (region.gz1 - region.gz0 + 1);
    if (by === "water") applyChanges(grid, rain(grid, region, { drops: Math.round(drops * cells), size, random: seeded(seed) }));
    else if (by === "slump") applyChanges(grid, slump(grid, region, { talus, passes }));
    else throw new Error(`erode: by is "water" or "slump", not ${by}`);
  },
};

// --- shapes ---

// Every grid point in [x0, z0, x1, z1] (ft), set to fn(x, z, h, w): w is the area's weight
// there, when an area's given, and points it doesn't reach are skipped.
function each(grid, [x0, z0, x1, z1], fn, area) {
  for (let gz = Math.floor(z0 / LAND_FT); gz <= Math.ceil(z1 / LAND_FT); gz++) {
    for (let gx = Math.floor(x0 / LAND_FT); gx <= Math.ceil(x1 / LAND_FT); gx++) {
      const [x, z] = [gx * LAND_FT, gz * LAND_FT];
      const w = area ? areaWeight(area, x, z) : 1;
      if (!w) continue;
      const h = grid.point(gx, gz);
      const tall = area ? heightWeight(area, h) : 1;
      if (!tall) continue;
      const next = fn(x, z, h, w * tall);
      if (next !== h) grid.set(gx, gz, next);
    }
  }
}

function applyChanges(grid, changes) {
  for (const [gx, gz, h] of changes) grid.set(gx, gz, h);
}

// An area's weight at (x, z): 1 inside it, easing to 0 at its edge over `feather` ft.
function areaWeight({ outline, at, radius, feather }, x, z) {
  const inside = outline ? -polygonDistance(outline, x, z) : at ? radius - Math.hypot(x - at[0], z - at[1]) : Infinity;
  return inside <= 0 ? 0 : smoothstep(0, feather, inside);
}

// An area's weight for ground at height h, from its above and below.
function heightWeight({ above, below }, h) {
  let w = 1;
  if (above !== null && above !== undefined) w *= smoothstep(above, above + HEIGHT_EASE_FT, h);
  if (below !== null && below !== undefined) w *= 1 - smoothstep(below - HEIGHT_EASE_FT, below, h);
  return w;
}

function areaBounds(grid, { outline, at, radius }) {
  if (outline) return boundsOf(outline, 0);
  if (at) return [at[0] - radius, at[1] - radius, at[0] + radius, at[1] + radius];
  const bounds = landBounds(grid);
  if (!bounds) throw new Error("there's no land yet to work over; give an outline or a circle");
  return bounds;
}

function boundsOf(points, margin) {
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return [Math.min(...xs) - margin, Math.min(...zs) - margin, Math.max(...xs) + margin, Math.max(...zs) + margin];
}

// Distance from (x, z) to a closed outline's edge: negative inside it.
export function polygonDistance(outline, x, z) {
  let best = Infinity;
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [ax, az] = outline[j];
    const [bx, bz] = outline[i];
    best = Math.min(best, segment(ax, az, bx, bz, x, z).d);
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? -best : best;
}

// Distance from (x, z) to an open path, and how far along the path the nearest point is.
function pathDistance(path, x, z) {
  let [d, s, run] = [Infinity, 0, 0];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const seg = segment(ax, az, bx, bz, x, z);
    if (seg.d < d) [d, s] = [seg.d, run + seg.t * seg.length];
    run += seg.length;
  }
  return { d, s };
}

function pathLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return length;
}

function segment(ax, az, bx, bz, x, z) {
  const [dx, dz] = [bx - ax, bz - az];
  const length = Math.hypot(dx, dz);
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length * length))) : 0;
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t, length };
}

// (x, z) pushed up to `amount` ft aside by noise `wavelength` ft across.
function warp(x, z, seed, amount, wavelength) {
  if (!amount) return [x, z];
  return [x + amount * fbm(x, z, seed + 11, { wavelength, octaves: 3 }) * 1.5, z + amount * fbm(x, z, seed + 13, { wavelength, octaves: 3 }) * 1.5];
}

// Value noise lines its creases up with the axes, which shows as straight streaks across big
// land (and erosion deepens them), so each octave here is turned and shifted.
function octave(x, z, seed, o, scale) {
  const a = 0.6 + o * 1.1;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return valueNoise((x * c - z * s) * scale + o * 17.3, (x * s + z * c) * scale - o * 9.1, (seed + Math.imul(o, 0x9e3779b9)) | 0);
}

// Fractal noise in about [-1, 1], features `wavelength` ft apart.
function fbm(x, z, seed, { wavelength, octaves = 3 }) {
  let [sum, amp, norm, scale] = [0, 1, 0, 1 / wavelength];
  for (let o = 0; o < octaves; o++) {
    sum += octave(x, z, seed, o, scale) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 2;
  }
  return sum / norm;
}

// Ridged noise from 0 to 1: sharp crests along its creases.
function ridged(x, z, seed, wavelength, octaves) {
  let [sum, amp, norm, scale] = [0, 1, 0, 1 / wavelength];
  for (let o = 0; o < octaves; o++) {
    sum += (1 - Math.abs(octave(x, z, seed, o, scale))) ** 2 * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 2;
  }
  return sum / norm;
}

// How much noise lands on ground at height h: none at sea level, easing in above it.
function landward(h) {
  return smoothstep(0, WEAR_ABOVE_FT, h);
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const between = (range, t) => (Array.isArray(range) ? range[0] + (range[1] - range[0]) * t : range);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
