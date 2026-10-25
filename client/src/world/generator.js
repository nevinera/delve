// Turns a continent's zone sketches into baked tiles (plans/design.md, "Zone authoring"). Every
// cell is a pure function of its continent position and the sketches, so tiles generate
// independently and agree across seams, whichever zone asked for them.
//
// The world is open ocean. Land is wherever a zone's region is: its height comes from every height
// pin on the continent, and it slopes down to the sea at the edge of the zoned area, so a region's
// outline is its coast. Rivers carve down through it.
//
// This pass makes height, water, terrain types and forest density with one default biome.
// Objects, scatter and biomes wait for kits.

import polygonClipping from "polygon-clipping";
import { CELLS, CELL_FT, TILE_FT } from "./constants.js";
import { fbm, hashString } from "./noise.js";
import { makePolyline, nearest, nearBounds, pointAt } from "./polyline.js";

export const GENERATOR_VERSION = 2;

export const TERRAIN = ["grass", "dirt", "sand", "rock", "path", "shore", "mud"];
const T = Object.fromEntries(TERRAIN.map((name, i) => [name, i]));
export const BIOMES = ["temperate"];

const BASE = {
  defaultHeight: 20, // land height when the continent has no height pins
  shoreHeight: 3, // ft above sea level at the water's edge
  shoreRampFt: 400, // land rises from the shore to its pinned height over this distance
  seaDrop: 0.08, // ft of drop per ft out to sea
  seaFloor: -60,
  noiseAmp: 8,
  noiseWavelength: 900,
};
// Past this distance from the zoned area's edge, nothing about the edge matters any more.
const EDGE_REACH_FT = Math.max(BASE.shoreRampFt, (BASE.shoreHeight - BASE.seaFloor) / BASE.seaDrop) + 64;
const RIVER = { surfaceDrop: 1.5, minDepth: 3, maxDepth: 10, minBankFt: 30 };
const STEEP = 0.7; // rise over run that turns into rock
const PROFILE_STEP = 16;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// zones: every zone on the continent, as stored ({ region, pins, strokes }, continent tile
// units). seedKey (the continent's key) seeds the noise.
export function prepareWorld(zones, seedKey) {
  const toFt = ([x, z]) => [x * TILE_FT, z * TILE_FT];
  const zoned = zones.filter((z) => z.region?.length);

  // The zoned area: every region together. Its outline is where land meets open ocean.
  const union = zoned.length ? polygonClipping.union(...zoned.map((z) => z.region)) : [];
  const area = union.map((polygon) => polygon.map((ring) => ring.slice(0, -1).map(toFt)));

  const ctx = {
    seed: hashString(seedKey),
    area,
    areaEdges: edgesOf(area),
    pins: zoned.flatMap((z) => z.pins.filter((p) => p.kind === "height" && Number.isFinite(p.height))).map((p) => {
      const [x, z] = toFt(p.at);
      return { x, z, height: p.height };
    }),
    rivers: [],
  };

  // Rivers always descend: the surface follows the lowest ground seen so far from the source.
  ctx.rivers = zoned.flatMap((z) => z.strokes.filter((s) => s.kind === "river" && s.points.length >= 2)).map((s) => {
    const line = makePolyline(s.points.map(toFt));
    const width = s.width ?? 30;
    const ground = sampleAlong(line, (x, z) => groundHeight(ctx, x, z, ctx.areaEdges));
    let low = Infinity;
    return {
      line,
      half: width / 2,
      bank: Math.max(RIVER.minBankFt, width),
      depth: clamp(width / 6, RIVER.minDepth, RIVER.maxDepth),
      surface: ground.map((h) => (low = Math.min(low, h)) - RIVER.surfaceDrop),
    };
  });

  return ctx;
}

// One tile's layers. tx and tz are continent tile coordinates.
export function generateTile(ctx, tx, tz) {
  // Only the area edges that can reach this tile.
  const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
  const near = ([ax, az, bx, bz]) =>
    Math.max(ax, bx) > x0 - EDGE_REACH_FT &&
    Math.min(ax, bx) < x0 + TILE_FT + EDGE_REACH_FT &&
    Math.max(az, bz) > z0 - EDGE_REACH_FT &&
    Math.min(az, bz) < z0 + TILE_FT + EDGE_REACH_FT;
  const edges = ctx.areaEdges.filter(near);

  // One extra cell on each side, so slopes at the tile edge see their neighbours.
  const N = CELLS + 2;
  const samples = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      samples[j * N + i] = sample(ctx, x0 + (i - 0.5) * CELL_FT, z0 + (j - 0.5) * CELL_FT, edges);
    }
  }

  const count = CELLS * CELLS;
  const layers = {
    height: new Float32Array(count),
    water: new Float32Array(count),
    terrain: new Uint8Array(count),
    biome: new Uint8Array(count),
    forest: new Uint8Array(count),
  };
  for (let j = 0; j < CELLS; j++) {
    for (let i = 0; i < CELLS; i++) {
      const at = (di, dj) => samples[(j + 1 + dj) * N + (i + 1 + di)];
      const s = at(0, 0);
      const gx = (at(1, 0).h - at(-1, 0).h) / (2 * CELL_FT);
      const gz = (at(0, 1).h - at(0, -1).h) / (2 * CELL_FT);
      const k = j * CELLS + i;
      layers.height[k] = s.h;
      layers.water[k] = s.water;
      layers.terrain[k] = terrainFor(s, Math.hypot(gx, gz));
      const x = x0 + (i + 0.5) * CELL_FT;
      const z = z0 + (j + 0.5) * CELL_FT;
      layers.forest[k] = Math.round(forestFor(ctx, s, layers.terrain[k], x, z) * 255);
    }
  }

  return {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: CELL_FT,
    palettes: { terrain: TERRAIN, biome: BIOMES },
    objects: [],
    generator: { version: GENERATOR_VERSION, seed: ctx.seed },
    layers,
  };
}

// --- height ---

// Ground before rivers: open sea outside the zoned area, sloping up from the shore inside it.
function groundHeight(ctx, x, z, edges) {
  const edgeDist = Math.min(EDGE_REACH_FT, distanceToEdges(x, z, edges));
  if (!pointInRegion(x, z, ctx.area)) return Math.max(BASE.seaFloor, BASE.shoreHeight - edgeDist * BASE.seaDrop);
  const t = smoothstep(0, BASE.shoreRampFt, edgeDist);
  const noise = fbm(x, z, ctx.seed, { wavelength: BASE.noiseWavelength, octaves: 3 }) * BASE.noiseAmp;
  return lerp(BASE.shoreHeight, pinnedHeight(ctx, x, z), t) + noise * t;
}

// Inverse-distance weighting over every height pin on the continent, so neighbouring zones blend.
function pinnedHeight(ctx, x, z) {
  if (!ctx.pins.length) return BASE.defaultHeight;
  let num = 0;
  let den = 0;
  for (const p of ctx.pins) {
    const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d2 < 1) return p.height;
    num += p.height / d2;
    den += 1 / d2;
  }
  return num / den;
}

function sample(ctx, x, z, edges) {
  const out = { h: groundHeight(ctx, x, z, edges), water: NaN, river: false, bank: false };
  for (const r of ctx.rivers) {
    if (!nearBounds(r.line, x, z, r.half + r.bank)) continue;
    const n = nearest(r.line, x, z);
    if (n.dist >= r.half + r.bank) continue;
    const surface = profileAt(r.surface, n.along);
    if (n.dist < r.half) {
      const t = n.dist / r.half;
      out.h = Math.min(out.h, surface - r.depth * (1 - t * t));
      out.water = Number.isNaN(out.water) ? surface : Math.max(out.water, surface);
      out.river = true;
    } else {
      const t = smoothstep(0, 1, (n.dist - r.half) / r.bank);
      out.h = Math.min(out.h, lerp(surface + 1, out.h, t));
      if (n.dist < r.half + r.bank * 0.6) out.bank = true;
    }
  }
  if (out.h < 0 && Number.isNaN(out.water)) out.water = 0;
  return out;
}

// --- geometry ---

function pointInRegion(x, z, region) {
  return region.some(([outline, ...holes]) => inRing(x, z, outline) && !holes.some((h) => inRing(x, z, h)));
}

function inRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Every edge of every ring, as [ax, az, bx, bz].
function edgesOf(region) {
  return region.flat().flatMap((ring) => ring.map((a, i) => [...a, ...ring[(i + 1) % ring.length]]));
}

function distanceToEdges(x, z, edges) {
  let best = Infinity;
  for (const [ax, az, bx, bz] of edges) {
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + t * dx), z - (az + t * dz)));
  }
  return best;
}

// --- profiles along strokes ---

function sampleAlong(line, fn) {
  const count = Math.max(2, Math.ceil(line.length / PROFILE_STEP) + 1);
  return Array.from({ length: count }, (_, i) => fn(...pointAt(line, Math.min(line.length, i * PROFILE_STEP))));
}

function profileAt(profile, along) {
  const f = clamp(along / PROFILE_STEP, 0, profile.length - 1);
  const i = Math.floor(f);
  return i >= profile.length - 1 ? profile[profile.length - 1] : lerp(profile[i], profile[i + 1], f - i);
}

// --- terrain and forest ---

function terrainFor(s, slope) {
  if (s.river) return T.mud;
  if (s.h < 0) return T.sand;
  if (slope > STEEP) return T.rock;
  if (s.bank) return T.shore;
  if (s.h < 2.5 + BASE.shoreHeight) return T.sand;
  return T.grass;
}

function forestFor(ctx, s, terrain, x, z) {
  if (terrain !== T.grass) return 0;
  const density = clamp((fbm(x, z, ctx.seed ^ 0x5f3759df, { wavelength: 700, octaves: 3 }) * 0.5 + 0.5) * 1.6 - 0.45, 0, 1);
  return density * smoothstep(BASE.shoreHeight + 2.5, BASE.shoreHeight + 10, s.h);
}
