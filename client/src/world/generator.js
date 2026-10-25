// Turns a zone sketch (zone.json) into baked tiles (plans/design.md, "Zone authoring"). Every cell
// is a pure function of its continent position and the sketch, so tiles generate independently
// and agree across seams.
//
// This first pass makes height, water, terrain types and forest density with one default biome.
// Objects, scatter and biomes wait for kits.

import { CELLS, CELL_FT, TILE_FT } from "./constants.js";
import { fbm, hashString } from "./noise.js";
import { makePolyline, nearest, nearBounds, pointAt } from "./polyline.js";

export const GENERATOR_VERSION = 1;

export const TERRAIN = ["grass", "dirt", "sand", "rock", "path", "shore", "mud"];
const T = Object.fromEntries(TERRAIN.map((name, i) => [name, i]));
export const BIOMES = ["temperate"];

const BASE = {
  shoreHeight: 4, // ft above sea level where a coast stroke is drawn
  inlandRise: 0.007, // ft of rise per ft inland
  seaDrop: 0.08, // ft of drop per ft out to sea
  seaFloor: -60,
  noLandHeight: 20, // a zone with no coast sits this high
  noiseAmp: 10,
  noiseWavelength: 900,
  noiseRampFt: 400, // the coast is flat; noise grows to full strength this far inland
};
const ROAD = { shoulderFt: 24, smoothFt: 240 };
const RIVER = { surfaceDrop: 1.5, minDepth: 3, maxDepth: 10, minBankFt: 30 };
const PADS = { hub: { radius: 100, blend: 80, clearing: 250 }, poi: { radius: 40, blend: 40, clearing: 90 } };
const STEEP = 0.7; // rise over run that turns into rock
const PROFILE_STEP = 16;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Converts the sketch into continent-space features, and precomputes the river and road profiles
// and pad heights that every tile shares. key ("cartaxia/cradle") seeds the noise.
export function prepareZone(zone, key) {
  const [ox, oz] = zone.origin;
  const toFt = ([x, z]) => [(ox + x) * TILE_FT, (oz + z) * TILE_FT];
  const strokes = (kind) => zone.strokes.filter((s) => s.kind === kind && s.points.length >= 2);

  const ctx = {
    key,
    seed: hashString(key),
    tiles: zone.tiles.map(([x, z]) => [ox + x, oz + z]),
    coasts: strokes("coast").map((s) => makePolyline(s.points.map(toFt))),
    roads: [],
    rivers: [],
    pads: [],
  };

  ctx.roads = strokes("road").map((s) => {
    const line = makePolyline(s.points.map(toFt));
    const raw = sampleAlong(line, (x, z) => baseHeight(ctx, x, z));
    const window = Math.round(ROAD.smoothFt / PROFILE_STEP / 2);
    const profile = raw.map((_, i) => {
      const part = raw.slice(Math.max(0, i - window), i + window + 1);
      return part.reduce((a, b) => a + b, 0) / part.length;
    });
    return { line, half: (s.width ?? 12) / 2, profile };
  });

  ctx.pads = zone.pins
    .filter((p) => PADS[p.kind])
    .map((p) => {
      const [x, z] = toFt(p.at);
      return { kind: p.kind, x, z, ...PADS[p.kind], height: roadedHeight(ctx, x, z).h };
    });

  // Rivers always descend: the surface follows the lowest ground seen so far from the source.
  ctx.rivers = strokes("river").map((s) => {
    const line = makePolyline(s.points.map(toFt));
    const width = s.width ?? 30;
    const ground = sampleAlong(line, (x, z) => paddedHeight(ctx, x, z).h);
    let low = Infinity;
    const surface = ground.map((h) => (low = Math.min(low, h)) - RIVER.surfaceDrop);
    return {
      line,
      half: width / 2,
      bank: Math.max(RIVER.minBankFt, width),
      depth: clamp(width / 6, RIVER.minDepth, RIVER.maxDepth),
      surface,
    };
  });

  return ctx;
}

// One tile's layers. tx and tz are continent tile coordinates.
export function generateTile(ctx, tx, tz) {
  // One extra cell on each side, so slopes at the tile edge see their neighbours.
  const N = CELLS + 2;
  const samples = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = tx * TILE_FT + (i - 0.5) * CELL_FT;
      const z = tz * TILE_FT + (j - 0.5) * CELL_FT;
      samples[j * N + i] = sample(ctx, x, z);
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
      const slope = Math.hypot(gx, gz);
      const k = j * CELLS + i;
      const x = tx * TILE_FT + (i + 0.5) * CELL_FT;
      const z = tz * TILE_FT + (j + 0.5) * CELL_FT;

      layers.height[k] = s.h;
      layers.water[k] = s.water;
      layers.terrain[k] = terrainFor(s, slope);
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

// --- height, in the order the features apply ---

function inlandDistance(ctx, x, z) {
  let best = { dist: Infinity, side: -1 };
  for (const coast of ctx.coasts) {
    const n = nearest(coast, x, z);
    if (n.dist < best.dist) best = n;
  }
  // Water is on the coast's left, so land is on its right.
  return best.dist === Infinity ? Infinity : best.dist * -best.side;
}

function baseHeight(ctx, x, z) {
  const inland = inlandDistance(ctx, x, z);
  if (inland === Infinity) return BASE.noLandHeight + noise(ctx, x, z);
  if (inland < 0) return Math.max(BASE.seaFloor, BASE.shoreHeight + inland * BASE.seaDrop);
  return BASE.shoreHeight + inland * BASE.inlandRise + noise(ctx, x, z) * smoothstep(0, BASE.noiseRampFt, inland);
}

function noise(ctx, x, z) {
  return fbm(x, z, ctx.seed, { wavelength: BASE.noiseWavelength, octaves: 3 }) * BASE.noiseAmp;
}

function roadedHeight(ctx, x, z) {
  let h = baseHeight(ctx, x, z);
  let road = false;
  for (const r of ctx.roads) {
    if (!nearBounds(r.line, x, z, r.half + ROAD.shoulderFt)) continue;
    const n = nearest(r.line, x, z);
    if (n.dist >= r.half + ROAD.shoulderFt) continue;
    const rh = profileAt(r.profile, n.along);
    h = lerp(rh, h, smoothstep(r.half, r.half + ROAD.shoulderFt, n.dist));
    if (n.dist < r.half) road = true;
  }
  return { h, road };
}

function paddedHeight(ctx, x, z) {
  const out = roadedHeight(ctx, x, z);
  out.pad = null;
  for (const p of ctx.pads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.radius + p.blend) continue;
    out.h = lerp(p.height, out.h, smoothstep(p.radius, p.radius + p.blend, d));
    if (d < p.radius) out.pad = p.kind;
  }
  return out;
}

function sample(ctx, x, z) {
  const out = paddedHeight(ctx, x, z);
  out.water = NaN;
  out.river = false;
  out.bank = false;
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
  if (s.road) return T.path;
  if (s.pad === "hub") return T.dirt;
  if (s.bank) return T.shore;
  if (s.h < 2.5) return T.sand;
  return T.grass;
}

function forestFor(ctx, s, terrain, x, z) {
  if (terrain !== T.grass) return 0;
  let density = clamp((fbm(x, z, ctx.seed ^ 0x5f3759df, { wavelength: 700, octaves: 3 }) * 0.5 + 0.5) * 1.6 - 0.45, 0, 1);
  for (const r of ctx.roads) {
    if (!nearBounds(r.line, x, z, r.half + 60)) continue;
    density *= smoothstep(r.half + 10, r.half + 60, nearest(r.line, x, z).dist);
  }
  for (const p of ctx.pads) density *= smoothstep(p.radius, p.clearing, Math.hypot(x - p.x, z - p.z));
  return density * smoothstep(2.5, 10, s.h);
}
