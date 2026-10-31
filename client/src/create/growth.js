import { fbm, hash2 } from "../world/noise.js";
import { CELL_FT, CHUNK_FT } from "../v2/sizes.js";

// Growths: ground grown along a line drawn with geo's draw tool, by scattering peaks along it and
// growing each, overlapping, the way they'd be raised by hand. The band the growth covers is its
// width across, in thirds each side of the line: its tallest peaks in the middle third, smaller
// ones across the middle two thirds, and low hills out through the outer thirds, everything
// shorter the further out, fading to the ground at the band's edge. Where peaks overlap, the
// tallest stands and the rest add a share of theirs, building shoulders and saddles. It aims for a
// height over the ground under the line, smoothed along it over BASE_FT, so it bridges small
// valleys but dips through big ones. It only ever raises the ground, so it never cuts into ground
// already higher.
// - range: cones of different steepness, their sides broken into sharp ribs and crags by noise.
// - hills: rounded domes, lumpy with noise.
// A cliff's different: no peaks, the ground on one side of the line raised to its height, its face
// along the line (cliff()).

export const WALK_DEG = 50; // the steepest a character walks up
const BASE_FT = 2640; // how far either way along the line its ground's averaged, at most
// Each kind's tiers of peaks: where across the band they're scattered, as shares of its half
// width out from the line, how far apart along the line at density 1, likewise, how tall, as
// shares of the growth's height, and how steep their sides are on average, in degrees.
const TIERS = {
  range: [
    { across: [0, 1 / 3], every: 0.6, tall: [0.6, 1], steep: [45, 70] },
    { across: [0, 2 / 3], every: 0.25, tall: [0.25, 0.55], steep: [40, 60] },
    { across: [1 / 3, 1], every: 0.12, tall: [0.06, 0.2], steep: [12, 25] },
  ],
  hills: [
    { across: [0, 1 / 3], every: 0.4, tall: [0.6, 1], steep: [22, 35] },
    { across: [0, 2 / 3], every: 0.2, tall: [0.3, 0.6], steep: [18, 30] },
    { across: [1 / 3, 1], every: 0.1, tall: [0.08, 0.25], steep: [10, 20] },
  ],
};
const OTHERS = 0.35; // how much of the peaks under the tallest at a point adds to it
const EDGE = 0.85; // where the fade to the band's edge begins, as a share of its half width
const MOST_POINTS = 600000; // how many points a growth's worked out on, at most
const SEED = 0x6a7e11d5;

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// A line of points [x, z], to find how far points are from it and how far along it they're
// nearest, with its segments bucketed `reach` ft squares apart. Points closer than a sixteenth of
// `reach` to the last one kept are left out, so it's quick to search.
const SIMPLER = 16;
const bucket = (i, j) => (i + 32768) * 65536 + (j + 32768);
export class Line {
  constructor(points, reach) {
    const apart = reach / SIMPLER;
    this.points = [points[0]];
    for (let k = 1; k < points.length; k++) {
      const [last, p] = [this.points.at(-1), points[k]];
      if (k === points.length - 1 || Math.hypot(p[0] - last[0], p[1] - last[1]) >= apart) this.points.push(p);
    }
    points = this.points;
    this.along = [0]; // how far along each point is
    for (let k = 1; k < points.length; k++) this.along.push(this.along[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
    this.length = this.along.at(-1);
    this.reach = Math.max(1, reach);
    this.buckets = new Map();
    const key = bucket;
    for (let k = 0; k < Math.max(1, points.length - 1); k++) {
      const [a, b] = [points[k], points[Math.min(k + 1, points.length - 1)]];
      for (let j = Math.floor(Math.min(a[1], b[1]) / this.reach); j <= Math.floor(Math.max(a[1], b[1]) / this.reach); j++) {
        for (let i = Math.floor(Math.min(a[0], b[0]) / this.reach); i <= Math.floor(Math.max(a[0], b[0]) / this.reach); i++) {
          if (!this.buckets.has(key(i, j))) this.buckets.set(key(i, j), []);
          this.buckets.get(key(i, j)).push(k);
        }
      }
    }
  }

  // The nearest point of the line to (x, z) within `reach`: { d, s }, how far it is and how far
  // along the line, or null.
  nearest(x, z) {
    const [bi, bj] = [Math.floor(x / this.reach), Math.floor(z / this.reach)];
    let best = null;
    for (let j = bj - 1; j <= bj + 1; j++) {
      for (let i = bi - 1; i <= bi + 1; i++) {
        for (const k of this.buckets.get(bucket(i, j)) ?? []) {
          const [a, b] = [this.points[k], this.points[Math.min(k + 1, this.points.length - 1)]];
          const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
          const ll = dx * dx + dz * dz;
          const t = ll ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll)) : 0;
          const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
          // Which side it's on: -1 left of the line, going along it, 1 right.
          const side = dx * (z - a[1]) - dz * (x - a[0]) < 0 ? -1 : 1;
          if (d <= this.reach && (!best || d < best.d)) best = { d, s: this.along[k] + t * Math.sqrt(ll), side };
        }
      }
    }
    return best;
  }

  // Whether (x, z)'s nearest point of the line is one of its ends, round which the line can be
  // walked.
  end(hit) {
    return hit.s <= 0 || hit.s >= this.length;
  }

  // The first point at least `s` ft along the line, but the first, by halving.
  after(s) {
    let [lo, hi] = [1, this.points.length - 1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.along[mid] < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // The point `s` ft along the line.
  at(s) {
    const k = this.after(s);
    const [a, b] = [this.points[k - 1], this.points[k] ?? this.points[k - 1]];
    const span = this.along[k] - this.along[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - this.along[k - 1]) / span));
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
}

// The ground's height under each of a line's points, averaged along it, nearer counting more, out
// to BASE_FT either way.
export function baseHeights(line, heightAt) {
  const ground = line.points.map(([x, z]) => heightAt(x, z));
  return line.points.map((_, k) => {
    let [sum, weights] = [0, 0];
    for (let m = 0; m < ground.length; m++) {
      const d = Math.abs(line.along[m] - line.along[k]);
      if (d > BASE_FT) continue;
      const w = Math.exp(-(((2 * d) / BASE_FT) ** 2));
      sum += ground[m] * w;
      weights += w;
    }
    return sum / weights;
  });
}

// A growth of `kind` along `points`, with settings { width, height, noise, density } (noise 0 to
// 1): { line, base(s), the height it aims for under its top s ft along, peaks, [{ x, z, tall,
// tier }], zone(x, z), the third out from the line it's in, 3 the middle, 0 outside,
// raise(x, z, ground, nearest), how far it raises ground of height `ground` at (x, z), its
// line's nearest point there given if it's known, and bounds
// [x0, z0, x1, z1] }.
export function growth(kind, points, settings, heightAt) {
  if (kind === "cliff") return cliff(points, settings, heightAt);
  const { width, height, noise, density = 1 } = settings;
  const half = width / 2;
  // Reaching a little past the band, to tell which side of it ground outside is (crossing()).
  const line = new Line(points, half * 1.25);
  const bases = baseHeights(line, heightAt);
  const base = (s) => {
    const k = line.after(s);
    const span = line.along[k] - line.along[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - line.along[k - 1]) / span));
    return bases[k - 1] + ((bases[k] ?? bases[k - 1]) - bases[k - 1]) * t;
  };
  // How tall a peak may be at `a`, its share of the half width out: full in the middle third,
  // then less and less to nothing at the edge.
  const shorter = (a) => (a <= 1 / 3 ? 1 : Math.max(0, 1 - (a - 1 / 3) / (2 / 3)));
  const peaks = [];
  TIERS[kind].forEach(({ across, every, tall, steep }, tier) => {
    const count = Math.max(1, Math.ceil((line.length / (every * half)) * density));
    for (let k = 0; k < count; k++) {
      const r = (n) => hash2(k, tier * 8 + n, SEED);
      const s = ((k + r(0)) / count) * line.length;
      const a = across[0] + (across[1] - across[0]) * r(1);
      const [p, q] = [line.at(Math.max(0, s - 10)), line.at(Math.min(line.length, s + 10))];
      const along = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const side = r(2) < 0.5 ? -1 : 1;
      const [at, off] = [line.at(s), side * a * half];
      const h = height * (tall[0] + (tall[1] - tall[0]) * r(3)) * shorter(a);
      if (h <= 0) continue;
      const angle = ((steep[0] + (steep[1] - steep[0]) * r(4)) * Math.PI) / 180;
      const x = at[0] - ((q[1] - p[1]) / along) * off;
      const z = at[1] + ((q[0] - p[0]) / along) * off;
      peaks.push({ x, z, tall: h, tier, radius: (kind === "hills" ? 1.3 : 1) * (h / Math.tan(angle)), bend: 1 + 0.5 * r(5) });
    }
  });
  // Peaks bucketed in squares as wide as the widest, to find those reaching a point.
  const cell = Math.max(1, ...peaks.map((p) => p.radius));
  const buckets = new Map();
  for (const peak of peaks) {
    const key = bucket(Math.floor(peak.x / cell), Math.floor(peak.z / cell));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(peak);
  }
  // How high a peak stands at t, its share of its radius out.
  const shape = kind === "hills" ? (t) => (1 - t * t) ** 1.5 : (t, bend) => (1 - t) ** bend;
  // The band's edge, from the line, s ft along it: it wobbles.
  const edge = (s) => Math.min(half, half * (1 + 0.1 * noise * fbm(s, 5, SEED + 1, { wavelength: width })));
  const near = (x, z, hit = line.nearest(x, z)) => {
    if (!hit) return null;
    const e = edge(hit.s);
    return hit.d > e ? null : { ...hit, edge: e };
  };
  const zone = (x, z) => {
    const hit = near(x, z);
    return !hit ? 0 : 3 - Math.min(2, Math.floor((3 * hit.d) / hit.edge));
  };
  // Sharp ribs where noise crosses 0, 0 to 1.
  const ridged = (x, z, wavelength, seed) => 1 - Math.abs(fbm(x, z, seed, { wavelength, octaves: 4 }));
  const raise = (x, z, ground, nearest) => {
    const hit = near(x, z, nearest);
    if (!hit) return 0;
    const [ci, cj] = [Math.floor(x / cell), Math.floor(z / cell)];
    let [tallest, sum] = [0, 0];
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        for (const peak of buckets.get(bucket(i, j)) ?? []) {
          const t = Math.hypot(x - peak.x, z - peak.z) / peak.radius;
          if (t >= 1) continue;
          const h = peak.tall * shape(t, peak.bend);
          tallest = Math.max(tallest, h);
          sum += h;
        }
      }
    }
    let top = tallest + OTHERS * (sum - tallest);
    top *=
      kind === "hills"
        ? 1 + noise * 0.3 * fbm(x, z, SEED + 3, { wavelength: width / 10, octaves: 4 })
        : 1 + noise * (0.5 * (ridged(x, z, width / 16, SEED + 10) - 0.6) + 0.2 * (ridged(x, z, width / 40, SEED + 11) - 0.6));
    const fade = 1 - smoothstep(EDGE * hit.edge, hit.edge, hit.d);
    return Math.max(0, base(hit.s) + top - ground) * fade;
  };
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const reach = half * 1.25;
  const bounds = [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach];
  return { kind, half, line, edge, base, peaks, zone, raise, bounds };
}

// A cliff along `points`, a step `height` ft tall, with settings { width, height, noise, flip }:
// the ground on the line's left, going along it, or its right with `flip`, raised by its height
// out to `width` from the line, keeping its shape, then easing down to the ground over the last
// part of that. Its face is steeper than any character
// walks up, FACE_DEG on average, centred on the line, and with noise it wanders either side of
// the line and is broken into splintered ribs, and its top is lumpy. It's lower to nothing over
// ENDS heights from the line's ends. Its zone() is 3 on its face, 2 on its top, 1 where it eases
// down behind, and its sides(x, z, hit) is 2 below it, 3 on its top and 1 on its face, for
// crossing(), but 0 where it's lower by its ends, round which it can be walked.
const FACE_DEG = 72;
const ENDS = 1;
const MIN_FACE_FT = 6;

function cliff(points, { width, height, noise, flip = false }, heightAt) {
  const line = new Line(points, width * 1.25);
  const bases = baseHeights(line, heightAt);
  const base = (s) => {
    const k = line.after(s);
    const span = line.along[k] - line.along[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - line.along[k - 1]) / span));
    return bases[k - 1] + ((bases[k] ?? bases[k - 1]) - bases[k - 1]) * t;
  };
  const up = flip ? 1 : -1; // the side of the line raised
  const run = Math.max(MIN_FACE_FT, height / Math.tan((FACE_DEG * Math.PI) / 180));
  const ends = ENDS * height;
  const tall = (s) => height * smoothstep(0, ends, s) * smoothstep(0, ends, line.length - s);
  // How far toward the top (x, z) is, across the face: below it under -run / 2, on top over it.
  const across = (x, z, hit) => {
    const u = hit.side === up ? hit.d : -hit.d;
    if (!noise) return u;
    const wander = 0.6 * run * fbm(hit.s, 3, SEED + 20, { wavelength: Math.max(40, 4 * height), octaves: 3 });
    const splinters = 0.35 * run * fbm(x, z, SEED + 21, { wavelength: Math.max(2 * CELL_FT, run), octaves: 3 });
    return u + noise * (wander + splinters);
  };
  const face = (u) => smoothstep(-run / 2, run / 2, u);
  const back = (u) => 1 - smoothstep(EDGE * width, width, u);
  const edge = () => width;
  const zone = (x, z) => {
    const hit = line.nearest(x, z);
    if (!hit || line.end(hit)) return 0;
    const u = across(x, z, hit);
    return u < -run / 2 || u > width ? 0 : u <= run / 2 ? 3 : u <= EDGE * width ? 2 : 1;
  };
  const sides = (x, z, hit) => {
    if (hit.s < ends || hit.s > line.length - ends) return 0;
    const u = across(x, z, hit);
    return u < -run / 2 ? 2 : u <= run / 2 ? 1 : u <= EDGE * width ? 3 : 0;
  };
  const raise = (x, z, ground, nearest) => {
    const hit = nearest === undefined ? line.nearest(x, z) : nearest;
    if (!hit) return 0;
    const u = across(x, z, hit);
    if (u <= -run / 2 || u >= width) return 0;
    const lumps = 1 + noise * 0.08 * fbm(x, z, SEED + 22, { wavelength: Math.max(40, width / 4), octaves: 4 });
    return tall(hit.s) * lumps * face(u) * back(u);
  };
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const reach = width * 1.25;
  const bounds = [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach];
  return { kind: "cliff", half: width, line, edge, base, peaks: [], zone, raise, bounds, step: CELL_FT, sides };
}

// A growth's raises worked out once on a grid, CHUNK_FT apart or more (or its step, if finer), to keep to MOST_POINTS:
// { step, bounds, at(x, z), the raise there between the grid's points, and undo, the same
// negated, to take it away again }.
export function raises(grown, heightAt) {
  const [x0, z0, x1, z1] = grown.bounds;
  let step = grown.step ?? CHUNK_FT;
  while (((x1 - x0) / step + 1) * ((z1 - z0) / step + 1) > MOST_POINTS) step *= 2;
  const [ox, oz] = [Math.floor(x0 / step) * step, Math.floor(z0 / step) * step];
  const [nx, nz] = [Math.ceil((x1 - ox) / step) + 1, Math.ceil((z1 - oz) / step) + 1];
  const grid = new Float32Array(nx * nz);
  const ground = new Float32Array(nx * nz);
  // Each point: 1 in the band, 2 outside it on the left, 3 on the right, 0 elsewhere or by the
  // line's ends, for crossing().
  const kinds = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, z, k] = [ox + i * step, oz + j * step, j * nx + i];
      const hit = grown.line.nearest(x, z);
      ground[k] = heightAt(x, z);
      grid[k] = grown.raise(x, z, ground[k], hit);
      if (hit && !grown.line.end(hit)) kinds[k] = grown.sides ? grown.sides(x, z, hit) : hit.d <= grown.edge(hit.s) ? 1 : hit.side < 0 ? 2 : 3;
    }
  }
  const lookup = (sign) => (x, z) => {
    const [u, v] = [(x - ox) / step, (z - oz) / step];
    if (u < 0 || v < 0 || u > nx - 1 || v > nz - 1) return 0;
    const [i, j] = [Math.min(nx - 2, Math.floor(u)), Math.min(nz - 2, Math.floor(v))];
    const [fu, fv] = [u - i, v - j];
    const g = (a, b) => grid[(j + b) * nx + i + a];
    return sign * ((g(0, 0) * (1 - fu) + g(1, 0) * fu) * (1 - fv) + (g(0, 1) * (1 - fu) + g(1, 1) * fu) * fv);
  };
  return { step, bounds: grown.bounds, at: lookup(1), undo: lookup(-1), grid, ground, kinds, ox, oz, nx, nz };
}

// A way across a growth, once raised by `r`, its raises(), never steeper than WALK_DEG: from the
// ground outside its band on one side, through the band, to the ground outside on the other, not
// round the line's ends. Its points [x, z], or null when there's none. The ground's steepness at
// each point is taken both ways across, so it can't be walked at a slant up a face too steep.
export function crossing(r) {
  const { grid, ground, kinds, ox, oz, nx, nz, step } = r;
  const most = step * Math.tan((WALK_DEG * Math.PI) / 180);
  const height = (i, j) => ground[j * nx + i] + grid[j * nx + i];
  const steep = (i, j) => {
    const [i0, i1, j0, j1] = [Math.max(0, i - 1), Math.min(nx - 1, i + 1), Math.max(0, j - 1), Math.min(nz - 1, j + 1)];
    const across = (height(i1, j) - height(i0, j)) / (i1 - i0 || 1);
    const down = (height(i, j1) - height(i, j0)) / (j1 - j0 || 1);
    return Math.hypot(across, down) > most;
  };
  const from = new Int32Array(nx * nz).fill(-1);
  const queue = [];
  for (let k = 0; k < kinds.length; k++) {
    if (kinds[k] === 2) {
      from[k] = k;
      queue.push(k);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q];
    const [i, j] = [k % nx, Math.floor(k / nx)];
    const h = ground[k] + grid[k];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [a, b] = [i + di, j + dj];
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (from[n] >= 0 || (kinds[n] !== 1 && kinds[n] !== 3) || Math.abs(ground[n] + grid[n] - h) > most || steep(a, b)) continue;
      from[n] = k;
      if (kinds[n] === 3) {
        const path = [];
        for (let m = n; from[m] !== m; m = from[m]) path.push([ox + (m % nx) * step, oz + Math.floor(m / nx) * step]);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

const CAP_POINTS = 12; // points round each end of a middle third's outline
const MIDDLE_POINTS = 200; // and at most this many along each side

// The outline of a growth's middle third, [[x, z], ...]: out a third of the band's edge either
// side of the line, round its ends. Its sides go out across the line's direction smoothed over a
// third of the band, so tight bends make fewer loops.
export function middleOutline({ line, edge }) {
  const r = (s) => edge(s) / 3;
  const across = (s) => {
    const span = r(s);
    const [a, b] = [line.at(Math.max(0, s - span)), line.at(Math.min(line.length, s + span))];
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const d = Math.hypot(dx, dz) || 1;
    return [-dz / d, dx / d];
  };
  const steps = Math.max(1, Math.min(MIDDLE_POINTS, Math.ceil(line.length / (r(0) / 4))));
  const left = [];
  const right = [];
  for (let k = 0; k <= steps; k++) {
    const s = (line.length * k) / steps;
    const [x, z] = line.at(s);
    const [nx, nz] = across(s);
    left.push([x + nx * r(s), z + nz * r(s)]);
    right.push([x - nx * r(s), z - nz * r(s)]);
  }
  // Half a circle round an end, from one side to the other, out past the line's end: round its
  // last point from the left side, its first from the right.
  const cap = (s, from) => {
    const [x, z] = line.at(s);
    const [nx, nz] = across(s);
    const a0 = Math.atan2(nz, nx) + (from > 0 ? 0 : Math.PI);
    const out = [];
    for (let k = 1; k < CAP_POINTS; k++) {
      const a = a0 - (Math.PI * k) / CAP_POINTS;
      out.push([x + Math.cos(a) * r(s), z + Math.sin(a) * r(s)]);
    }
    return out;
  };
  return [...left, ...cap(line.length, 1), ...right.reverse(), ...cap(0, -1)];
}
