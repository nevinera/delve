// Biome regions from biome pins (plans/design.md, "Biome pins"). Each cell takes the biome of the
// pin that scores lowest, where a pin's score is its distance from the cell's noise-warped
// position, plus a penalty for each river or zone edge the straight line from the cell to the pin
// crosses. So borders wander, and snap onto rivers and zone edges near where they'd fall. A cell
// within a pin's margin always belongs to that pin: a tile, or half the gap to the nearest other
// biome pin when that's less.
//
// Points are feet in continent space.

import { TILE_FT } from "./constants.js";
import { fbm } from "./noise.js";

export const BIOMES = ["plains", "forest", "rocky", "swamp"];
export const DEFAULT_BIOME = "plains";

const WARP = { amp: 450, wavelength: 1800 };
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
      return { x: p.x, z: p.z, biome: BIOMES.indexOf(p.biome), tags: p.tags ?? [], margin: Math.min(TILE_FT, gap / 2) };
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

// The biome at a point, as { biome, gap }: biome is an index into BIOMES, and gap is how much
// further the best pin of any other biome scores (Infinity with nothing else in reach), for
// blending at borders.
export function biomeAt(b, x, z) {
  const { pins } = b;
  if (!pins.length) return { biome: BIOMES.indexOf(DEFAULT_BIOME), gap: Infinity };
  for (const p of pins) {
    if (Math.hypot(p.x - x, p.z - z) < p.margin) return { biome: p.biome, gap: Infinity };
  }

  const wx = b.warp ? x + fbm(x, z, b.seed ^ 0x2b1e5a, { wavelength: WARP.wavelength }) * b.warp : x;
  const wz = b.warp ? z + fbm(x, z, b.seed ^ 0x6c3d91, { wavelength: WARP.wavelength }) * b.warp : z;
  const raw = pins.map((p) => Math.hypot(p.x - wx, p.z - wz));
  const least = Math.min(...raw);

  // Penalties only ever add, so a pin past least + cap can't win and skips the crossing tests.
  const best = new Map(); // biome -> lowest score
  pins.forEach((p, i) => {
    let score = raw[i];
    if (score < least + PENALTY.cap) score += penalty(b.near ? p : b, p, x, z);
    if (!(score >= best.get(p.biome))) best.set(p.biome, score);
  });
  const ranked = [...best].sort((u, v) => u[1] - v[1]);
  return { biome: ranked[0][0], gap: ranked.length > 1 ? ranked[1][1] - ranked[0][1] : Infinity };
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
