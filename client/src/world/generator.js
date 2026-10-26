// Turns a continent's zone sketches into baked tiles (plans/design.md, "Zone authoring"). Every
// cell is a pure function of its continent position and the sketches, so tiles generate
// independently and agree across seams, whichever zone asked for them.
//
// The world is open ocean. Land is wherever a zone's region is, so a region's outline is its coast.
// The land's broad shape is a smooth surface through every height pin on the continent
// (heightField.js), with rolling hills on top, and crags that grow where the land is steep. It
// meets the sea in cliffs, or in a rough, uneven shore where it's low. Rivers carve down through it.
//
// Biome pins split the land into biomes (biomes.js), and each biome's profile shapes its ground,
// surface and trees, blended at borders. Trees are planted as tree terrain cells (trees.js).
// Objects and scatter wait for kits.

import polygonClipping from "polygon-clipping";
import { BIOMES, biomesNear, climateAt, prepareBiomes } from "./biomes.js";
import { CELLS, CELL_FT, TILE_FT, WATER_KINDS } from "./constants.js";
import { prepareHeights } from "./heightField.js";
import { facets, fbm, hash2, hashString } from "./noise.js";
import { TREE_KINDS, plantTree } from "./trees.js";
import { scatterObjects } from "./objects.js";
import { makePolyline, nearest, nearBounds, pointAt } from "./polyline.js";

export const GENERATOR_VERSION = 20;

export const TERRAIN = ["grass", "dirt", "sand", "rock", "path", "shore", "mud", "moss"];
const T = Object.fromEntries(TERRAIN.map((name, i) => [name, i]));

const BASE = {
  defaultHeight: 20, // land height away from every height pin
  shoreHeight: 3, // land below this plus 2.5ft, near the coast, is beach
  hillWavelength: 1200, // rolling hills
  roughWavelength: 350, // a rocky biome's ridges
};
// Rocky peaks: a height pin in peaky land (the biomes' `peaks`) that's higher than every other pin
// within `aloneFt` is a summit. The broad shape is a smooth dome there, capped flat by its bounds,
// so around a summit it's cut down to a peak: a cone reaching from the summit to the ground
// `reach` of the way to the nearest pin (at most `maxFt`), its flanks steepest near the top
// (`flank` < 1). It eases back to the broad shape over the outer `blend` share.
const PEAK = { aloneFt: 2500, reach: 0.9, maxFt: 6000, flank: 0.7, blend: 0.3 };
// Cliffs: in patches (`patchWavelength`, covering about `cover` of the land where the biomes'
// `cliffs` is 1), ground climbs in ledges `minFt` to `maxFt` high, each rise squeezed into a
// cliff over `riser` of the ledge's height. Cliff lines wander by up to a ledge either way.
const CLIFFS = { patchWavelength: 1600, cover: 0.6, minFt: 20, maxFt: 60, stepWavelength: 900, wander: 260, riser: 0.15 };
// Rocky ground breaks into flat facets (noise.js `facets`) at these sizes, each as tall as
// `share` of the biome's roughness.
const FACETS = [
  { wavelength: 80, share: 1.1 },
  { wavelength: 30, share: 0.35 },
];
// Crags: sharp ridged noise, as tall as the biome's roughness plus `perSlope` times the broad
// shape's steepness (rise over run).
const CRAG = { wavelength: 160, perSlope: 60, probeFt: 24 };
// Everywhere on land: gentle swells some hundreds of feet across, and small lumps and dips on
// top, a foot or two either way. (fbm rarely strays past ±0.5, so heights are about the full
// swing.)
// Swells shrink on land lower than `swellFullAt`, so they don't sink low plains under the sea.
const JITTER = { swellFt: 16, swellWavelength: 650, swellFullAt: 40, ft: 3, wavelength: 90 };
// Land at or above `cliff` ft meets the sea in a cliff; lower land in a rough shore of uneven
// width (`minFt` to `maxFt`) and bumpy height. Between `low` and `cliff` it shifts from one to the
// other.
const COAST = { low: 6, cliff: 10, minFt: 16, maxFt: 90, bumps: 2.5 };
const SEA = { shallow: -2, drop: 0.08, floor: -60, swell: 8, bumps: 3 };
// Low land within `reachFt` of the coast is beach, in biomes that get beaches.
const BEACH = { reachFt: 200, biomes: new Set(["plains", "forest", "rocky"]) };
const POOL = { wavelength: 220, level: -0.1, maxDepth: 4 };
// Ponds and small lakes: at most one per `gridFt` square, by `chance` times the biome's lakes,
// `minFt` to `maxFt` across (mostly small), with wobbly shores. Each has one water level, a little
// under the lowest ground around it, a bed that deepens from the shore, and a rim that holds it. A
// lake only goes where the ground's fairly level and well away from the sea.
const LAKES = { gridFt: 900, chance: 0.7, minFt: 40, maxFt: 300, wobble: 0.35, belowFt: 1, shelfFt: 1, depthFt: [2, 12], rimFt: 1, rimWidthFt: 30, maxDropFt: 15, damFt: 80 };
const RAVINE = { depth: 40, width: 0.04, wavelength: 1400, wander: 250, floor: 1.5 };
const TREE_GRID = 4; // cells per side of a tree planting square
const TREE_GROUND = new Set(["grass", "dirt", "moss", "mud"]);
// The coast wanders inside the zoned area's edge, by up to `maxFt`, in bays and headlands at
// three sizes. It never crosses the edge, so land stays on the zones' own tiles.
const SHORE = { maxFt: 700, layers: [{ wavelength: 1800, weight: 1 }, { wavelength: 400, weight: 0.5 }, { wavelength: 90, weight: 0.15 }] };
// How far each feature reaches, so the editor knows which tiles a change touches. Past
// COAST_REACH_FT from the coast, nothing about the coast matters any more, and past EDGE_REACH_FT
// from the zoned area's edge, nothing about the edge does.
const COAST_REACH_FT = Math.max(COAST.maxFt, (SEA.shallow - SEA.floor) / SEA.drop) + 64;
export const EDGE_REACH_FT = COAST_REACH_FT + SHORE.maxFt;
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
    rivers: [],
    lakeSites: new Map(), // "gi,gj" -> lake or null, filled as tiles need them
  };
  const heightPins = zoned.flatMap((z) => z.pins.filter((p) => p.kind === "height" && Number.isFinite(p.height)));
  ctx.heightAt = prepareHeights(
    heightPins.map((p) => {
      const [x, z] = toFt(p.at);
      return { x, z, height: p.height };
    }),
    BASE.defaultHeight,
  );

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

  ctx.heightAt = withPeaks(ctx.heightAt, summits(heightPins.map((p) => toFt(p.at).concat(p.height)), ctx.biomes));

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
    waterKind: new Uint8Array(count),
    terrain: new Uint8Array(count),
    biome: new Uint8Array(count),
    forest: new Uint8Array(count),
    clutter: new Uint8Array(count),
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
      layers.clutter[k] = Math.min(255, Math.round(s.climate.profile.clutter * 100));
      layers.waterKind[k] = WATER_KINDS.indexOf(s.sea ? "sea" : "fresh");
    }
  }

  const tile = {
    coords: [tx, tz],
    layer: "surface",
    cells: CELLS,
    cellFt: CELL_FT,
    palettes: { terrain: [...TERRAIN], biome: BIOMES, water: [...WATER_KINDS] },
    objects: [],
    generator: { version: GENERATOR_VERSION, seed: ctx.seed },
    layers,
  };
  plantTrees(ctx, tile, (i, j) => samples[(j + 1) * N + (i + 1)]);
  tile.objects = scatterObjects(tile);
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
      if (!s.land || !Number.isNaN(s.water) || roll(3) >= profile.trees) continue;
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

// Ground before rivers, pools and ravines: the sea floor outside the zoned area, and inside it the
// broad shape with hills and crags, meeting the sea at the coast. Returns { h, t, land, climate,
// coastDist }, where t grows from 0 at the coast to 1 a little inland, for features that keep off
// the shore, and coastDist is how far it is to the coast (capped at COAST_REACH_FT).
function land(ctx, x, z, edges, biomes) {
  const climate = climateAt(biomes, x, z);
  // Feet inland from the coast, negative out to sea.
  const edgeDist = Math.min(EDGE_REACH_FT, distanceToEdges(x, z, edges));
  const inland = (pointInRegion(x, z, ctx.area) ? edgeDist : -edgeDist) - shoreInset(ctx, x, z);
  const coastDist = Math.min(COAST_REACH_FT, Math.abs(inland));
  if (inland <= 0) return { h: seaFloor(ctx, x, z, coastDist), t: 0, land: false, climate, coastDist };

  const { amp, rough } = climate.profile;
  const d = CRAG.probeFt;
  const steep = Math.hypot(ctx.heightAt(x + d, z) - ctx.heightAt(x - d, z), ctx.heightAt(x, z + d) - ctx.heightAt(x, z - d)) / (2 * d);
  let h = ctx.heightAt(x, z) + fbm(x, z, ctx.seed, { wavelength: BASE.hillWavelength, octaves: 3 }) * amp;
  if (rough > 0) h += (1 - Math.abs(fbm(x, z, ctx.seed ^ 0x3c6ef372, { wavelength: BASE.roughWavelength, octaves: 3 }))) * rough;
  const crag = rough * 0.5 + steep * CRAG.perSlope;
  if (crag > 0) h += (1 - Math.abs(fbm(x, z, ctx.seed ^ 0x1b873593, { wavelength: CRAG.wavelength, octaves: 3 }))) ** 2 * crag;
  FACETS.forEach(({ wavelength, share }, n) => {
    if (rough > 0) h += facets(x, z, ctx.seed ^ (0x5bd1e995 + n), wavelength) * rough * share;
  });
  if (climate.profile.cliffs > 0) h = ledges(ctx, h, x, z, climate.profile.cliffs);
  const swell = JITTER.swellFt * smoothstep(0, JITTER.swellFullAt, ctx.heightAt(x, z));
  h += fbm(x, z, ctx.seed ^ 0x3c6ef373, { wavelength: JITTER.swellWavelength, octaves: 2 }) * swell;
  h += fbm(x, z, ctx.seed ^ 0x6a09e667, { wavelength: JITTER.wavelength, octaves: 2 }) * JITTER.ft;

  return { h: coast(ctx, h, x, z, coastDist), t: smoothstep(0, COAST.maxFt, coastDist), land: true, climate, coastDist };
}

// How far inside the zoned area's edge the coast lies here, between 0 and SHORE.maxFt.
// Height pins that are summits: [{ x, z, height, radius }], from pins as [x, z, height].
function summits(pins, biomes) {
  return pins.flatMap(([x, z, height], i) => {
    if (climateAt(biomes, x, z).profile.peaks < 0.5) return [];
    let nearest = Infinity;
    for (const [ox, oz, other] of pins.filter((_, j) => j !== i)) {
      const d = Math.hypot(ox - x, oz - z);
      if (other >= height && d < PEAK.aloneFt) return [];
      nearest = Math.min(nearest, d);
    }
    return [{ x, z, height, radius: Math.min(PEAK.maxFt, nearest * PEAK.reach) }];
  });
}

// The broad shape, with each summit's dome cut down to a peak: from the summit down to where the
// dome is at `radius` along the same line, the height follows a curve that's steepest at the top.
function withPeaks(heightAt, peaks) {
  if (!peaks.length) return heightAt;
  return (x, z) => {
    const h = heightAt(x, z);
    for (const p of peaks) {
      const r = Math.hypot(x - p.x, z - p.z);
      if (r >= p.radius) continue;
      const foot = r > 0 ? heightAt(p.x + ((x - p.x) / r) * p.radius, p.z + ((z - p.z) / r) * p.radius) : heightAt(p.x + p.radius, p.z);
      const peak = p.height + (foot - p.height) * (r / p.radius) ** PEAK.flank;
      const cut = Math.min(h, peak);
      return cut + (h - cut) * smoothstep(p.radius * (1 - PEAK.blend), p.radius, r);
    }
    return h;
  };
}

// Ground stepped into ledges and cliffs, in patches, by `amount` (0-1).
function ledges(ctx, h, x, z, amount) {
  const patch = fbm(x, z, ctx.seed ^ 0x2545f491, { wavelength: CLIFFS.patchWavelength, octaves: 2 }) + 0.5;
  const where = smoothstep(1 - CLIFFS.cover - 0.1, 1 - CLIFFS.cover + 0.1, patch) * amount;
  if (where <= 0) return h;
  const step = lerp(CLIFFS.minFt, CLIFFS.maxFt, clamp(fbm(x, z, ctx.seed ^ 0x4f1bbcdc, { wavelength: CLIFFS.stepWavelength }) + 0.5, 0, 1));
  const shift = fbm(x, z, ctx.seed ^ 0x7f4a7c15, { wavelength: CLIFFS.wander, octaves: 2 }) * step;
  const q = (h + shift) / step;
  const ledge = (Math.floor(q) + smoothstep(1 - CLIFFS.riser, 1, q - Math.floor(q))) * step - shift;
  return h + (ledge - h) * where;
}

function shoreInset(ctx, x, z) {
  let n = 0;
  SHORE.layers.forEach(({ wavelength, weight }, i) => (n += fbm(x, z, ctx.seed ^ (0x7f4a7c15 + i), { wavelength, octaves: 2 }) * weight));
  return SHORE.maxFt * (0.5 + 0.5 * Math.tanh(1.2 * n));
}

// Cliffs where the land is high; where it's low, a shore of uneven width that drops in bumps to
// just below sea level.
function coast(ctx, h, x, z, coastDist) {
  const low = 1 - smoothstep(COAST.low, COAST.cliff, h);
  if (low <= 0) return h;
  const width = lerp(COAST.minFt, COAST.maxFt, fbm(x, z, ctx.seed ^ 0x27d4eb2f, { wavelength: 500 }) * 0.5 + 0.5) * low;
  if (coastDist >= width) return h;
  const shore = SEA.shallow + (coastDist / width) * (h - SEA.shallow) + fbm(x, z, ctx.seed ^ 0x165667b1, { wavelength: 40 }) * COAST.bumps;
  return Math.min(h, shore);
}

// The sea floor: shallow by the coast and deeper further out, with slow swells and finer bumps.
// Always under water.
function seaFloor(ctx, x, z, coastDist) {
  const depth = Math.max(SEA.floor, SEA.shallow - coastDist * SEA.drop);
  const swell = fbm(x, z, ctx.seed ^ 0x61c88647, { wavelength: 1500 }) * SEA.swell;
  const bumps = fbm(x, z, ctx.seed ^ 0x2545f491, { wavelength: 250 }) * SEA.bumps;
  return Math.min(-1, depth + swell + bumps);
}

function sample(ctx, x, z, edges, biomes) {
  const ground = land(ctx, x, z, edges, biomes);
  const out = { h: ground.h, water: NaN, sea: false, river: false, bank: false, pool: false, lake: false, land: ground.land, climate: ground.climate, coastDist: ground.coastDist };
  const { pools, ravines } = ground.climate.profile;
  if (pools > 0 && ground.t > 0) pool(ctx, out, x, z, pools * ground.t);
  if (ravines > 0 && ground.t > 0) ravine(ctx, out, x, z, ravines * ground.t);
  if (ground.land) lakes(ctx, out, x, z);
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
  // The sea covers the sea floor and the shore strip. Land below sea level further in stays dry.
  if (out.h < 0 && Number.isNaN(out.water) && (!out.land || out.coastDist < COAST.maxFt)) {
    out.water = 0;
    out.sea = true;
  }
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

// Ponds and small lakes, from the lake sites in the grid squares around the point.
function lakes(ctx, out, x, z) {
  const gi = Math.floor(x / LAKES.gridFt);
  const gj = Math.floor(z / LAKES.gridFt);
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const site = lakeSite(ctx, gi + di, gj + dj);
      if (!site) continue;
      const d = Math.hypot(x - site.x, z - site.z);
      if (d > site.r * (1 + LAKES.wobble) + LAKES.rimWidthFt) continue;
      const shore = site.r * (1 + LAKES.wobble * fbm(x, z, ctx.seed ^ 0x5851f42d, { wavelength: Math.max(40, site.r * 0.7), octaves: 2 }));
      if (d < shore) {
        out.water = site.level;
        out.h = Math.min(out.h, site.level - LAKES.shelfFt - site.depth * smoothstep(0, shore * 0.6, shore - d));
        out.lake = true;
      } else if (d < shore + LAKES.rimWidthFt) {
        out.h = Math.max(out.h, lerp(site.level + LAKES.rimFt, out.h, (d - shore) / LAKES.rimWidthFt));
        out.bank = true;
      }
    }
  }
}

// The lake in grid square (gi, gj), as { x, z, r, level, depth }, or null. Worked out once per
// square, from every zone, so tiles agree.
function lakeSite(ctx, gi, gj) {
  const key = `${gi},${gj}`;
  if (ctx.lakeSites.has(key)) return ctx.lakeSites.get(key);
  ctx.lakeSites.set(key, null);
  const roll = (k) => hash2(gi, gj, ctx.seed ^ Math.imul(k + 11, 0x27d4eb2d));
  const x = (gi + 0.3 + 0.4 * roll(1)) * LAKES.gridFt;
  const z = (gj + 0.3 + 0.4 * roll(2)) * LAKES.gridFt;
  const { lakes: amount } = climateAt(ctx.biomes, x, z).profile;
  if (!(amount > 0) || roll(3) >= LAKES.chance * amount) return null;
  const size = roll(4) ** 2;
  const r = lerp(LAKES.minFt, LAKES.maxFt, size) / 2;
  const around = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => land(ctx, x + dx, z + dz, ctx.areaEdges, ctx.biomes));
  const heights = around.map((g) => g.h);
  if (!around.every((g) => g.land && g.coastDist > r * (1 + LAKES.wobble) + LAKES.damFt)) return null;
  if (Math.max(...heights) - Math.min(...heights) > LAKES.maxDropFt) return null;
  const site = { x, z, r, level: Math.min(...heights) - LAKES.belowFt, depth: lerp(...LAKES.depthFt, size) };
  ctx.lakeSites.set(key, site);
  return site;
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
  if (s.river || s.pool || s.lake) return T.mud;
  if (!s.land) return T.sand;
  if (slope > s.climate.profile.steep) return T.rock;
  if (s.bank) return T.shore;
  const { biome, second, weight } = s.climate;
  const here = BIOMES[hash2(ci, cj, ctx.seed ^ 0x2545f491) < weight ? biome : second];
  if (s.h < 2.5 + BASE.shoreHeight && s.coastDist < BEACH.reachFt && BEACH.biomes.has(here)) return T.sand;
  if (s.h < 0) return T.mud;
  const n = fbm(ci * CELL_FT, cj * CELL_FT, ctx.seed ^ 0x6a09e667, { wavelength: 60, octaves: 3 });
  if (here === "swamp") return n > 0.25 ? T.moss : n > 0.05 ? T.mud : T.grass;
  if (here === "rocky") return n > 0.15 ? T.rock : n > -0.25 ? T.dirt : T.grass;
  return n > (here === "forest" ? 0.6 : 0.5) ? T.dirt : T.grass;
}
