import { fbm, hash2 } from "../world/noise.js";
import { CHUNK_FT } from "../v2/sizes.js";

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

export const WALK_DEG = 50; // the steepest a character walks up
const BASE_FT = 2640; // how far either way along the line its ground's averaged, at most
// Each kind's tiers of peaks: where across the band they're scattered, as shares of its half
// width out from the line, how far apart along the line at density 1, likewise, how tall, as
// shares of the growth's height, and how steep their sides are on average, in degrees.
const TIERS = {
  range: [
    { across: [0, 1 / 3], every: 0.6, tall: [0.6, 1], steep: [35, 60] },
    { across: [0, 2 / 3], every: 0.25, tall: [0.25, 0.55], steep: [30, 50] },
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
// nearest, with its segments bucketed `reach` ft squares apart.
export class Line {
  constructor(points, reach) {
    this.points = points;
    this.along = [0]; // how far along each point is
    for (let k = 1; k < points.length; k++) this.along.push(this.along[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
    this.length = this.along.at(-1);
    this.reach = Math.max(1, reach);
    this.buckets = new Map();
    const key = (i, j) => `${i},${j}`;
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
        for (const k of this.buckets.get(`${i},${j}`) ?? []) {
          const [a, b] = [this.points[k], this.points[Math.min(k + 1, this.points.length - 1)]];
          const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
          const ll = dx * dx + dz * dz;
          const t = ll ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / ll)) : 0;
          const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
          if (d <= this.reach && (!best || d < best.d)) best = { d, s: this.along[k] + t * Math.sqrt(ll) };
        }
      }
    }
    return best;
  }

  // The point `s` ft along the line.
  at(s) {
    let k = 1;
    while (k < this.points.length - 1 && this.along[k] < s) k++;
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
// raise(x, z, ground), how far it raises ground of height `ground` at (x, z), and bounds
// [x0, z0, x1, z1] }.
export function growth(kind, points, { width, height, noise, density = 1 }, heightAt) {
  const half = width / 2;
  const line = new Line(points, half);
  const bases = baseHeights(line, heightAt);
  const base = (s) => {
    let k = 1;
    while (k < bases.length - 1 && line.along[k] < s) k++;
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
    const key = `${Math.floor(peak.x / cell)},${Math.floor(peak.z / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(peak);
  }
  // How high a peak stands at t, its share of its radius out.
  const shape = kind === "hills" ? (t) => (1 - t * t) ** 1.5 : (t, bend) => (1 - t) ** bend;
  const near = (x, z) => {
    const hit = line.nearest(x, z);
    if (!hit) return null;
    // The band's edge wobbles along the line.
    const edge = half * (1 + 0.1 * noise * fbm(hit.s, 5, SEED + 1, { wavelength: width }));
    return hit.d > edge ? null : { ...hit, edge };
  };
  const zone = (x, z) => {
    const hit = near(x, z);
    return !hit ? 0 : 3 - Math.min(2, Math.floor((3 * hit.d) / hit.edge));
  };
  // Sharp ribs where noise crosses 0, 0 to 1.
  const ridged = (x, z, wavelength, seed) => 1 - Math.abs(fbm(x, z, seed, { wavelength, octaves: 4 }));
  const raise = (x, z, ground) => {
    const hit = near(x, z);
    if (!hit) return 0;
    const [ci, cj] = [Math.floor(x / cell), Math.floor(z / cell)];
    let [tallest, sum] = [0, 0];
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        for (const peak of buckets.get(`${i},${j}`) ?? []) {
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
  const reach = half * 1.1;
  const bounds = [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach];
  return { kind, line, base, peaks, zone, raise, bounds };
}

// A growth's raises worked out once on a grid, CHUNK_FT apart or more, to keep to MOST_POINTS:
// { step, bounds, at(x, z), the raise there between the grid's points, and undo, the same
// negated, to take it away again }.
export function raises(grown, heightAt) {
  const [x0, z0, x1, z1] = grown.bounds;
  let step = CHUNK_FT;
  while (((x1 - x0) / step + 1) * ((z1 - z0) / step + 1) > MOST_POINTS) step *= 2;
  const [ox, oz] = [Math.floor(x0 / step) * step, Math.floor(z0 / step) * step];
  const [nx, nz] = [Math.ceil((x1 - ox) / step) + 1, Math.ceil((z1 - oz) / step) + 1];
  const grid = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, z] = [ox + i * step, oz + j * step];
      grid[j * nx + i] = grown.raise(x, z, heightAt(x, z));
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
  return { step, bounds: grown.bounds, at: lookup(1), undo: lookup(-1) };
}
