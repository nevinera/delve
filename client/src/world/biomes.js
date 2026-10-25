// Biome regions from biome pins (plans/design.md, "Biome pins"). Each cell takes the biome of the
// pin that scores lowest, where a pin's score is its distance from the cell's noise-warped
// position, plus a penalty for each river or zone edge the straight line from the cell to the pin
// crosses. So borders wander, and snap onto rivers and zone edges near where they'd fall. A cell
// within a pin's margin always belongs to that pin: a tile, or half the gap to the nearest other
// biome pin when that's less.
//
// Each biome has a profile of numbers for the generator: ground shape, trees, pools, ravines. A
// pin's tags adjust its profile, and near a border the profile blends toward the next biome's.
//
// Points are feet in continent space.

import { TILE_FT } from "./constants.js";
import { fbm } from "./noise.js";
import { TREE_KINDS } from "./trees.js";

export const BIOMES = ["plains", "forest", "rocky", "swamp"];
export const DEFAULT_BIOME = "plains";

// amp: hill noise height (ft); rough: ridged rocky noise height (ft); steep: rise over run that
// turns to rock; trees: chance of a tree per 32ft grid square; sizes: odds of 1x1, 2x2 and 3x3;
// kinds: odds per tree kind; pools: swamp pools, 0-1; ravines: ravine cracks, 0-1.
const PROFILES = {
  plains: { amp: 4, rough: 0, steep: 0.7, trees: 0.03, sizes: [0.5, 0.4, 0.1], kinds: { oak: 1 } },
  forest: { amp: 9, rough: 0, steep: 0.7, trees: 0.3, sizes: [0.1, 0.3, 0.6], kinds: { oak: 0.85, pine: 0.15 } },
  rocky: { amp: 12, rough: 26, steep: 0.45, trees: 0.06, sizes: [0.6, 0.35, 0.05], kinds: { pine: 0.7, dead: 0.3 } },
  swamp: { amp: 2, rough: 0, steep: 0.7, trees: 0.25, sizes: [0.4, 0.5, 0.1], kinds: { willow: 0.65, dead: 0.35 }, pools: 1 },
};
// What each pin tag does to its profile.
const TAGS = {
  flat: (p) => {
    p.amp *= 0.3;
    p.rough *= 0.3;
  },
  hilly: (p) => {
    p.amp *= 2.2;
    p.rough *= 1.5;
  },
  sparse: (p) => {
    p.trees *= 0.4;
  },
  dense: (p) => {
    p.trees = Math.min(1, p.trees * 1.8);
  },
  ravines: (p) => {
    p.ravines = 1;
  },
};
export const BIOME_TAGS = Object.keys(TAGS);
const BLEND_FT = 300; // borders blend over about twice this

const WARP = { amp: 1000, wavelength: 2600 };
const PENALTY = { river: 1500, edge: 700, cap: 3000 };

// pins: [{ x, z, biome, tags }]; rivers: [[[x, z], ...], ...] point lists; edges: zone edges as
// [ax, az, bx, bz] (shared edges are counted once); seed: number. `warp: false` turns the warp off.
export function prepareBiomes({ pins, rivers, edges, seed }, { warp = true } = {}) {
  const known = pins.filter((p) => BIOMES.includes(p.biome));
  return {
    seed,
    warp: warp ? WARP.amp : 0,
    pins: known.map((p) => {
      const gap = Math.min(...known.filter((q) => q !== p).map((q) => Math.hypot(q.x - p.x, q.z - p.z)));
      const tags = p.tags ?? [];
      return { x: p.x, z: p.z, biome: BIOMES.indexOf(p.biome), tags, profile: profileFor(p.biome, tags), margin: Math.min(TILE_FT, gap / 2) };
    }),
    rivers: rivers.flatMap((points) => points.slice(1).map((b, i) => [...points[i], ...b])),
    edges: dedupe(edges),
  };
}

// The same biomes, with each pin keeping only the rivers and edges that can lie between it and the
// box [x0, z0, x1, z1], so a tile's cells test few segments.
export function biomesNear(b, [x0, z0, x1, z1]) {
  const pins = b.pins.map((p) => {
    const box = [Math.min(x0, p.x), Math.min(z0, p.z), Math.max(x1, p.x), Math.max(z1, p.z)];
    return { ...p, rivers: b.rivers.filter((s) => overlaps(s, box)), edges: b.edges.filter((s) => overlaps(s, box)) };
  });
  return { ...b, pins, near: true };
}

// A biome's profile with tags applied, as plain numbers so profiles can blend.
export function profileFor(biome, tags = []) {
  const base = PROFILES[biome] ?? PROFILES[DEFAULT_BIOME];
  const p = {
    ...base,
    sizes: [...base.sizes],
    kinds: TREE_KINDS.map((kind) => base.kinds[kind] ?? 0),
    pools: base.pools ?? 0,
    ravines: 0,
  };
  for (const tag of tags) TAGS[tag]?.(p);
  return p;
}

const DEFAULT_PROFILE = profileFor(DEFAULT_BIOME);

// The climate at a point: { biome, second, weight, profile }. biome wins the point and second is
// the runner-up (or the same); weight is biome's share, from 1 well inside down to 0.5 on the
// border; profile is the two pins' profiles blended by weight.
export function climateAt(b, x, z) {
  const { biome, pin, second, secondPin, gap } = biomeAt(b, x, z);
  if (!pin) return { biome, second: biome, weight: 1, profile: DEFAULT_PROFILE };
  const weight = 0.5 + 0.5 * smoothstep(gap / BLEND_FT);
  if (weight >= 1) return { biome, second: biome, weight, profile: pin.profile };
  return { biome, second, weight, profile: blend(secondPin.profile, pin.profile, weight) };
}

function blend(a, b, t) {
  const mix = (u, v) => u + (v - u) * t;
  const out = {};
  for (const key of Object.keys(b)) out[key] = Array.isArray(b[key]) ? b[key].map((v, i) => mix(a[key][i], v)) : mix(a[key], b[key]);
  return out;
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

// The biome at a point, as { biome, gap, pin, second, secondPin }: biome is an index into BIOMES,
// and gap is how much further the best pin of any other biome (second, from secondPin) scores,
// Infinity with nothing else in reach, for blending at borders.
export function biomeAt(b, x, z) {
  const { pins } = b;
  if (!pins.length) return { biome: BIOMES.indexOf(DEFAULT_BIOME), gap: Infinity, pin: null };
  for (const p of pins) {
    if (Math.hypot(p.x - x, p.z - z) < p.margin) return { biome: p.biome, gap: Infinity, pin: p };
  }

  const wx = b.warp ? x + fbm(x, z, b.seed ^ 0x2b1e5a, { wavelength: WARP.wavelength }) * b.warp : x;
  const wz = b.warp ? z + fbm(x, z, b.seed ^ 0x6c3d91, { wavelength: WARP.wavelength }) * b.warp : z;
  const raw = pins.map((p) => Math.hypot(p.x - wx, p.z - wz));
  const least = Math.min(...raw);

  // Penalties only ever add, so a pin past least + cap can't win and skips the crossing tests.
  const best = new Map(); // biome -> { score, pin }
  pins.forEach((p, i) => {
    let score = raw[i];
    if (score < least + PENALTY.cap) score += penalty(b.near ? p : b, p, x, z);
    if (!(score >= best.get(p.biome)?.score)) best.set(p.biome, { score, pin: p });
  });
  const [first, next] = [...best.values()].sort((u, v) => u.score - v.score);
  return {
    biome: first.pin.biome,
    pin: first.pin,
    gap: next ? next.score - first.score : Infinity,
    second: next?.pin.biome,
    secondPin: next?.pin,
  };
}

function penalty(segments, p, x, z) {
  let total = 0;
  for (const s of segments.rivers) if (crosses(x, z, p.x, p.z, s)) total += PENALTY.river;
  for (const s of segments.edges) if (crosses(x, z, p.x, p.z, s)) total += PENALTY.edge;
  return Math.min(total, PENALTY.cap);
}

// Whether segment (ax, az)-(bx, bz) properly crosses s.
function crosses(ax, az, bx, bz, [cx, cz, dx, dz]) {
  const side = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = side(cx, cz, dx, dz, ax, az);
  const d2 = side(cx, cz, dx, dz, bx, bz);
  const d3 = side(ax, az, bx, bz, cx, cz);
  const d4 = side(ax, az, bx, bz, dx, dz);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function overlaps([ax, az, bx, bz], [x0, z0, x1, z1]) {
  return Math.max(ax, bx) >= x0 && Math.min(ax, bx) <= x1 && Math.max(az, bz) >= z0 && Math.min(az, bz) <= z1;
}

function dedupe(edges) {
  const seen = new Set();
  return edges.filter(([ax, az, bx, bz]) => {
    const key = ax < bx || (ax === bx && az < bz) ? `${ax},${az},${bx},${bz}` : `${bx},${bz},${ax},${az}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
