import { fbm } from "../world/noise.js";
import { CHUNK_FT } from "../v2/sizes.js";

// Growths: ground grown along a line drawn with geo's draw tool. A growth has a core, as wide as
// its width, too steep to walk up the sides of (WALK_DEG), and foothills outside it, walkable,
// stepping down to the ground about half the width further out. Both edges wobble along the line.
// It aims for a height over the ground under the line, smoothed along it over BASE_FT, so it
// bridges small valleys but dips through big ones. It only ever raises the ground, so it never
// cuts into ground already higher.
// - hills: rounded tops, lumpy with noise, on steep sides.

export const WALK_DEG = 50; // the steepest a character walks up
const WALL_DEG = 65; // how steep a core's sides are
const BASE_FT = 2640; // how far either way along the line its ground's averaged, at most
const FOOT_SHARE = 0.3; // how high foothills reach, as a share of the growth's height
const SHOULDER_SHARE = 0.8; // how high a hill's sides reach before its top rounds over
const WOBBLE = 0.2; // how far edges wobble in and out, as a share of the core's half width, at full noise
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

// A growth of `kind` along `points`, with settings { width, height, noise } (noise 0 to 1):
// { line, base(s), the height it aims for under its top s ft along, zone(x, z), 2 in the core, 1
// in the foothills, 0 outside, raise(x, z, ground), how far it raises ground of height `ground`
// at (x, z), and bounds [x0, z0, x1, z1] }.
export function growth(kind, points, { width, height, noise }, heightAt) {
  const half = width / 2;
  const line = new Line(points, half * (2 + 3 * WOBBLE));
  const bases = baseHeights(line, heightAt);
  const base = (s) => {
    let k = 1;
    while (k < bases.length - 1 && line.along[k] < s) k++;
    const span = line.along[k] - line.along[k - 1] || 1;
    const t = Math.max(0, Math.min(1, (s - line.along[k - 1]) / span));
    return bases[k - 1] + ((bases[k] ?? bases[k - 1]) - bases[k - 1]) * t;
  };
  // The core's and foothills' edges, from the line, s ft along it.
  const edges = (s) => {
    const core = half * (1 + WOBBLE * noise * fbm(s, 0, SEED, { wavelength: width * 2 }));
    return [core, core + half * (1 + 1.5 * WOBBLE * noise * fbm(s, 7, SEED + 1, { wavelength: width * 1.5 }))];
  };
  const near = (x, z) => {
    const hit = line.nearest(x, z);
    if (!hit) return null;
    const [core, foot] = edges(hit.s);
    return hit.d > foot ? null : { ...hit, core, foot };
  };
  const zone = (x, z) => {
    const hit = near(x, z);
    return !hit ? 0 : hit.d <= hit.core ? 2 : 1;
  };
  const wall = Math.min(half / 2, ((SHOULDER_SHARE - FOOT_SHARE) * height) / Math.tan((WALL_DEG * Math.PI) / 180));
  const lumps = (x, z, wavelength, seed) => noise * fbm(x, z, seed, { wavelength, octaves: 4 });
  // How high hills' ground is over their base, at `d` from the line with the core's edge at `core`.
  const hills = (x, z, d, core) => {
    const top = core - wall;
    if (d <= top) {
      const t = d / top;
      return height * (SHOULDER_SHARE + (1 - SHOULDER_SHARE) * (1 - t * t) + 0.6 * lumps(x, z, width / 4, SEED + 2));
    }
    const shoulder = height * (SHOULDER_SHARE + 0.6 * lumps(x, z, width / 4, SEED + 2));
    return shoulder + (FOOT_SHARE * height - shoulder) * ((d - top) / wall);
  };
  const raise = (x, z, ground) => {
    const hit = near(x, z);
    if (!hit) return 0;
    const b = base(hit.s);
    if (hit.d <= hit.core) return Math.max(0, b + hills(x, z, hit.d, hit.core) - ground);
    // Foothills step down from the core's foot to the base, rolling, and fade out at their edge.
    const out = smoothstep(hit.core, hit.foot, hit.d);
    const rise = FOOT_SHARE * height * (1 - out) + 0.15 * height * lumps(x, z, width / 4, SEED + 3) * (1 - out);
    return Math.max(0, b + rise - ground) * (1 - out);
  };
  const reach = half * (2 + 3 * WOBBLE);
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  const bounds = [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach];
  return { kind, line, base, zone, raise, bounds };
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
