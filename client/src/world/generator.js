// Turns a continent's zone sketches into baked tiles (plans/design.md, "Zone authoring"). Every
// cell is a pure function of its continent position and the sketches, so tiles generate
// independently and agree across seams, whichever zone asked for them.
//
// The world is open ocean. Land is wherever a zone's region is: its height comes from every height
// pin on the continent, and it slopes down to the sea at the edge of the zoned area, so a region's
// outline is its coast. Rivers carve down through it.
//
// Biome pins split the land into biomes (biomes.js), and each biome's profile shapes its ground,
// surface and trees, blended at borders. Trees are planted as tree terrain cells (trees.js).
// Objects and scatter wait for kits.

import polygonClipping from "polygon-clipping";
import { BIOMES, biomesNear, climateAt, prepareBiomes } from "./biomes.js";
import { CELLS, CELL_FT, TILE_FT } from "./constants.js";
import { fbm, hash2, hashString } from "./noise.js";
import { TREE_KINDS, plantTree } from "./trees.js";
import { makePolyline, nearest, nearBounds, pointAt } from "./polyline.js";

export const GENERATOR_VERSION = 4;

export const TERRAIN = ["grass", "dirt", "sand", "rock", "path", "shore", "mud", "moss"];
const T = Object.fromEntries(TERRAIN.map((name, i) => [name, i]));

const BASE = {
  defaultHeight: 20, // land height away from every height pin
  shoreHeight: 3, // ft above sea level at the water's edge
  shoreRampFt: 400, // land rises from the shore to its pinned height over this distance
  seaDrop: 0.08, // ft of drop per ft out to sea
  seaFloor: -60,
  noiseWavelength: 900,
  roughWavelength: 350,
};
const POOL = { wavelength: 220, level: -0.1, maxDepth: 4 };
const RAVINE = { depth: 40, width: 0.04, wavelength: 1400, wander: 250, floor: 1.5 };
const TREE_GRID = 4; // cells per side of a tree planting square
const TREE_GROUND = new Set(["grass", "dirt", "moss", "mud"]);
// How far each feature reaches, so the editor knows which tiles a change touches.
// Past EDGE_REACH_FT from the zoned area's edge, nothing about the edge matters any more.
export const EDGE_REACH_FT = Math.max(BASE.shoreRampFt, (BASE.shoreHeight - BASE.seaFloor) / BASE.seaDrop) + 64;
export const PIN_REACH_FT = 2048;
const RIVER = { surfaceDrop: 1.5, minDepth: 3, maxDepth: 10, minBankFt: 30 };
export function riverReachFt(width) {
  return width / 2 + Math.max(RIVER.minBankFt, width);
}
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

  const pinsOf = (kind) => zoned.flatMap((z) => z.pins.filter((p) => p.kind === kind));
  ctx.biomes = prepareBiomes({
    pins: pinsOf("biome").map((p) => {
      const [x, z] = toFt(p.at);
      return { x, z, biome: p.biome, tags: p.tags };
    }),
    rivers: zoned.flatMap((z) => z.strokes.filter((s) => s.kind === "river")).map((s) => s.points.map(toFt)),
    edges: zoned.flatMap((z) => edgesOf(z.region.map((polygon) => polygon.map((ring) => ring.map(toFt))))),
    seed: ctx.seed,
  });

  // Rivers always descend: the surface follows the lowest ground seen so far from the source.
  ctx.rivers = zoned.flatMap((z) => z.strokes.filter((s) => s.kind === "river" && s.points.length >= 2)).map((s) => {
    const line = makePolyline(s.points.map(toFt));
    const width = s.width ?? 30;
    const ground = sampleAlong(line, (x, z) => land(ctx, x, z, ctx.areaEdges, ctx.biomes).h);
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
  const biomes = biomesNear(ctx.biomes, [x0, z0, x0 + TILE_FT, z0 + TILE_FT]);

  // One extra cell on each side, so slopes at the tile edge see their neighbours.
  const N = CELLS + 2;
  const samples = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      samples[j * N + i] = sample(ctx, x0 + (i - 0.5) * CELL_FT, z0 + (j - 0.5) * CELL_FT, edges, biomes);
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
      layers.terrain[k] = terrainFor(ctx, s, Math.hypot(gx, gz), tx * CELLS + i, tz * CELLS + j);
      layers.forest[k] = s.land ? Math.round(s.climate.profile.trees * 255) : 0;
      layers.biome[k] = s.climate.biome;
    }
  }

  const tile = {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: CELL_FT,
    palettes: { terrain: [...TERRAIN], biome: BIOMES },
    objects: [],
    generator: { version: GENERATOR_VERSION, seed: ctx.seed },
    layers,
  };
  plantTrees(ctx, tile, (i, j) => samples[(j + 1) * N + (i + 1)]);
  return tile;
}

// Trees on a grid of TREE_GRID-cell squares: each square may get one tree, by its biome's odds,
// at a random spot in the square. Squares are counted across the continent so every tile agrees.
function plantTrees(ctx, tile, sampleAt) {
  const [tx, tz] = tile.coords;
  const per = CELLS / TREE_GRID;
  for (let sj = 0; sj < per; sj++) {
    for (let si = 0; si < per; si++) {
      const roll = (k) => hash2(tx * per + si, tz * per + sj, ctx.seed ^ Math.imul(k, 0x45d9f3b));
      const ci = si * TREE_GRID + Math.floor(roll(1) * TREE_GRID);
      const cj = sj * TREE_GRID + Math.floor(roll(2) * TREE_GRID);
      const s = sampleAt(ci, cj);
      const { profile } = s.climate;
      if (!s.land || roll(3) >= profile.trees) continue;
      if (!TREE_GROUND.has(TERRAIN[tile.layers.terrain[cj * CELLS + ci]])) continue;
      const size = 1 + pick(profile.sizes, roll(4));
      const kind = TREE_KINDS[pick(profile.kinds, roll(5))];
      const half = Math.floor((size - 1) / 2);
      plantTree(tile, ci - half, cj - half, size, kind);
    }
  }
}

// An index into odds (which needn't sum to 1), chosen by r in [0, 1).
function pick(odds, r) {
  const total = odds.reduce((a, b) => a + b, 0);
  let left = r * total;
  for (let i = 0; i < odds.length; i++) {
    left -= odds[i];
    if (left < 0) return i;
  }
  return odds.length - 1;
}

// --- height ---

// Ground before rivers, pools and ravines: open sea outside the zoned area, sloping up from the
// shore inside it, with hills and rocky ridges by biome. Returns { h, t, land, climate }, where t
// is how far inland it is, from 0 at the shore to 1 past the shore ramp.
function land(ctx, x, z, edges, biomes) {
  const climate = climateAt(biomes, x, z);
  const edgeDist = Math.min(EDGE_REACH_FT, distanceToEdges(x, z, edges));
  if (!pointInRegion(x, z, ctx.area)) {
    return { h: Math.max(BASE.seaFloor, BASE.shoreHeight - edgeDist * BASE.seaDrop), t: 0, land: false, climate };
  }
  const t = smoothstep(0, BASE.shoreRampFt, edgeDist);
  const { amp, rough } = climate.profile;
  let relief = fbm(x, z, ctx.seed, { wavelength: BASE.noiseWavelength, octaves: 3 }) * amp;
  if (rough > 0) relief += (1 - Math.abs(fbm(x, z, ctx.seed ^ 0x3c6ef372, { wavelength: BASE.roughWavelength, octaves: 3 }))) * rough;
  return { h: lerp(BASE.shoreHeight, pinnedHeight(ctx, x, z), t) + relief * t, t, land: true, climate };
}

// Height pins blend by inverse-distance weighting among the pins within PIN_REACH_FT, and the
// result fades smoothly back to the default height toward the edge of the nearest pin's reach,
// so each pin raises (or lowers) a gentle rise rather than a plateau.
function pinnedHeight(ctx, x, z) {
  let num = 0;
  let den = 0;
  let reach = 0;
  for (const p of ctx.pins) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d >= PIN_REACH_FT) continue;
    if (d < 1) return p.height;
    num += p.height / (d * d);
    den += 1 / (d * d);
    reach = Math.max(reach, smoothstep(PIN_REACH_FT, 0, d));
  }
  return den ? lerp(BASE.defaultHeight, num / den, reach) : BASE.defaultHeight;
}

function sample(ctx, x, z, edges, biomes) {
  const ground = land(ctx, x, z, edges, biomes);
  const out = { h: ground.h, water: NaN, river: false, bank: false, pool: false, land: ground.land, climate: ground.climate };
  const { pools, ravines } = ground.climate.profile;
  if (pools > 0 && ground.t > 0) pool(ctx, out, x, z, pools * ground.t);
  if (ravines > 0 && ground.t > 0) ravine(ctx, out, x, z, ravines * ground.t);
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

// Swamp pools: standing water a little below the ground around it, where noise dips. `amount`
// (0-1) grows them from none to full size.
function pool(ctx, out, x, z, amount) {
  const level = lerp(-1, POOL.level, amount);
  const n = fbm(x, z, ctx.seed ^ 0x51ab3c, { wavelength: POOL.wavelength, octaves: 2 });
  if (n >= level) return;
  out.water = out.h - 0.5;
  out.h = out.water - Math.min(POOL.maxDepth, (level - n) * 30);
  out.pool = true;
}

// Ravines: narrow winding cracks, deep enough not to climb out of, along the zero line of a
// warped noise field. They stop a little above sea level so they don't flood.
function ravine(ctx, out, x, z, amount) {
  const wx = x + fbm(x, z, ctx.seed ^ 0x1f83d9ab, { wavelength: 600 }) * RAVINE.wander;
  const wz = z + fbm(x, z, ctx.seed ^ 0x5be0cd19, { wavelength: 600 }) * RAVINE.wander;
  const r = Math.abs(fbm(wx, wz, ctx.seed ^ 0x7a11c0de, { wavelength: RAVINE.wavelength, octaves: 2 }));
  const cut = smoothstep(RAVINE.width, RAVINE.width * 0.35, r) * amount;
  if (cut <= 0) return;
  out.h = Math.max(out.h - RAVINE.depth * cut, Math.min(out.h, RAVINE.floor));
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

// --- terrain ---

// A cell's terrain type. Near a border the biome is picked per cell by its share, so surfaces
// speckle into each other. (ci, cj) is the cell's continent cell position, for steady noise.
function terrainFor(ctx, s, slope, ci, cj) {
  if (s.river || s.pool) return T.mud;
  if (s.h < 0) return T.sand;
  if (slope > s.climate.profile.steep) return T.rock;
  if (s.bank) return T.shore;
  if (s.h < 2.5 + BASE.shoreHeight) return T.sand;
  const { biome, second, weight } = s.climate;
  const here = BIOMES[hash2(ci, cj, ctx.seed ^ 0x2545f491) < weight ? biome : second];
  const n = fbm(ci * CELL_FT, cj * CELL_FT, ctx.seed ^ 0x6a09e667, { wavelength: 60, octaves: 3 });
  if (here === "swamp") return n > 0.25 ? T.moss : n > 0.05 ? T.mud : T.grass;
  if (here === "rocky") return n > 0.15 ? T.rock : n > -0.25 ? T.dirt : T.grass;
  return n > (here === "forest" ? 0.6 : 0.5) ? T.dirt : T.grass;
}
