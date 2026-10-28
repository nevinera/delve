// Turns a continent's land and sketch into baked tiles (plans/design.md, "Zone authoring"). Every
// cell is a pure function of its continent position, the land and the sketch, so tiles generate
// independently and agree across seams.
//
// The land's broad shape is the height grid sculpted on the heights step (landGrid.js). Where it's
// below sea level is sea, and where it's below DEEP_FT, deep ocean that gets no tiles. On land the
// biomes add rolling hills, and crags that grow where the land is steep, growing in from nothing
// at the shore over SHORE_FT of height. Rivers carve down through it.
//
// Biome pins split the land into biomes (biomes.js), and each biome's profile shapes its ground,
// surface and trees, blended at borders. Trees are planted as tree terrain cells (trees.js).
// Objects and scatter wait for kits.
//
// Roads follow the routes the editor works out for the sketch's paths (editor/roads.js). Each has
// a bed: the ground along it, evened out and held to its grade cap. The road's dug into the ground
// down to its bed or built up to it, with sides that slope back to the land, and is surfaced in
// path, raggedly for trails and footpaths, in patches for faint and disused ones.

import { BIOMES, biomesNear, climateAt, prepareBiomes } from "./biomes.js";
import { CELLS, CELL_FT, TILE_FT, WATER_KINDS, gradeCap } from "./constants.js";
import { LandGrid } from "./landGrid.js";
import { fillLake } from "./lakes.js";
import { waterGround } from "./waterGround.js";
import { facets, fbm, hash2, hashString } from "./noise.js";
import { TREE_KINDS, plantTree } from "./trees.js";
import { scatterObjects } from "./objects.js";
import { makePolyline, nearest, nearBounds, pointAt, simplify } from "./polyline.js";

export const GENERATOR_VERSION = 23;

export const TERRAIN = ["grass", "dirt", "sand", "rock", "path", "shore", "mud", "moss"];
const T = Object.fromEntries(TERRAIN.map((name, i) => [name, i]));

const BASE = {
  shoreHeight: 3, // land below this plus 2.5ft, near the coast, is beach
  hillWavelength: 1200, // rolling hills
  roughWavelength: 350, // a rocky biome's ridges
};
// Cliffs: in patches (`patchWavelength`, covering about `cover` of the land where the biomes'
// `cliffs` is 1), ground climbs in ledges `minFt` to `maxFt` high, each rise squeezed into a
// cliff over `riser` of the ledge's height. Cliff lines wander by up to a ledge either way.
const CLIFFS = { patchWavelength: 1600, cover: 0.85, minFt: 12, maxFt: 45, stepWavelength: 900, wander: 260, riser: 0.07 };
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
// The sea floor: bumps up to `bumps` ft either way, growing in over `fadeFt` from the shore, and
// never shallower than `shallowFt`.
const SEA = { bumps: 3, fadeFt: 6, shallowFt: -0.3 };
// Biome detail grows in from nothing at sea level to full at SHORE_FT, so the coast stays where
// the land grid puts it.
const SHORE_FT = 12;
// Low land within `reachFt` of the sea is beach, in biomes that get beaches.
const BEACH = { reachFt: 120, biomes: new Set(["plains", "forest", "rocky"]) };
// Swamp pools fill the ground's hollows, each flat at its own level: a little under the lowest
// point it would spill over, at most `maxDepthFt` over its bottom, and none shallower than
// `minDepthFt`. Hollows are found by running downhill from points `gridFt` apart, in steps from
// `stepFt` down to 1ft, and a pool's shore by looking out along `rays` lines up to `reachFt`, every
// `rayStepFt`. Swamp ground is pressed with `dentFt`-deep dents about `dentWavelength` ft apart, so
// there are hollows even on level ground; slopes stay dry.
const BOG = { gridFt: 64, stepFt: 8, rays: 12, reachFt: 150, rayStepFt: 8, belowFt: 0.3, minDepthFt: 0.4, maxDepthFt: 5, dentFt: 3, dentWavelength: 80, dentFrom: 0.1, dentFull: 0.45 };
// Ponds and small lakes: at most one per `gridFt` square, by `chance` times the biome's lakes,
// `minFt` to `maxFt` across (mostly small), with wobbly shores. Each has one water level, a little
// under the lowest ground around it, a bed that deepens from the shore, and a rim that holds it. A
// lake only goes where the ground's fairly level and well away from the sea.
const LAKES = { gridFt: 900, chance: 0.7, minFt: 40, maxFt: 300, wobble: 0.35, belowFt: 1, shelfFt: 1, depthFt: [2, 12], rimFt: 1, rimWidthFt: 30, maxDropFt: 15, damFt: 80 };
// The sketch's lakes (lakes.js): flat water at their level, over a bed that deepens from the shore
// by up to `depthFt` (more for wider lakes, up to `wideFt` across), with a rim `rimWidthFt` wide
// that holds the water in.
const PONDS = { shelfFt: 1, depthFt: [2, 12], wideFt: 2000, rimFt: 1, rimWidthFt: 30, slopeFt: 60 };
const RAVINE = { depth: 40, width: 0.04, wavelength: 1400, wander: 250, floor: 1.5 };
const TREE_GRID = 4; // cells per side of a tree planting square
const TREE_GROUND = new Set(["grass", "dirt", "moss", "mud"]);
// A river's channel: `depth` is cut below its surface, up to maxDepth, scaled by the ground's bed
// (biomes.js profiles). Banks slope up over its width (at least minBankFt), scaled by the ground's
// banks, up to maxBanks. The surface follows the lowest ground across the channel, out to
// `besideFt` past each edge, so on a slope it sits no higher than the downhill bank; where the bank
// is still lower somewhere, it's raised to `leveeFt` above the water, easing back into the land
// across the bank, so the water's always held in. The bank rises from the waterline at the bed's
// slope at its edge, at least `minEdgeSlope`.
const RIVER = { surfaceDrop: 1.5, minDepth: 3, maxDepth: 10, minBankFt: 30, maxBanks: 2, besideFt: 8, leveeFt: 1, minEdgeSlope: 0.3 };
// Biome borders follow rivers loosely, so they get each course simplified to within this: a
// smoothed course has a point every few feet, and every one costs each biome lookup.
const BIOME_RIVER_TOLERANCE_FT = 24;
// Channels follow their course to within this, which looks the same but tests far fewer segments.
const CHANNEL_TOLERANCE_FT = 1;
export function riverReachFt(width) {
  return width / 2 + Math.max(RIVER.minBankFt, width) * RIVER.maxBanks;
}
// Roads: the bed is the ground evened out over `evenFt` either way. Beside it the ground slopes back
// to the land at `sideSlope` (rise over run), over at least minShoulderFt and at most maxShoulderFt.
// The surface is at least `minHalfFt` either side of the middle, so a footpath still covers a cell,
// and its edges wander by `ragged` of that for trails and footpaths, `even` for the rest. Faint and
// disused roads are surfaced in patches, covering about `faint` and `disused` of them, and trees
// grow on disused ones `disusedTrees` as often as around them.
//
// Roads and highways in use are pounded smooth: their bed's evened out over `evenTrafficFt`, and
// the ground's flat `flatFt` past their edges. Each tile lists their middles (tile.roads), for the
// ground to draw their surface and edges sharply (editor/groundMaterial.js), along with any within
// `tileMarginFt` of it; their cells are surfaced in path only `coreFt` inside their edges, for
// the map and far off, and trees keep `clearFt` clear of their edges.
export const ROAD = {
  evenFt: 48,
  sideSlope: 1,
  minShoulderFt: 6,
  maxShoulderFt: 40,
  minHalfFt: CELL_FT * 0.6,
  ragged: 0.35,
  even: 0.08,
  faint: 0.55,
  disused: 0.35,
  disusedTrees: 0.3,
  evenTrafficFt: 96,
  flatFt: 4,
  tileMarginFt: 24,
  coreFt: 4,
  clearFt: 3,
};
const TRAFFIC = ["highway", "road"];
export function roadReachFt(width) {
  return Math.max(width / 2, ROAD.minHalfFt) + ROAD.maxShoulderFt;
}
const STEEP = 0.7; // rise over run that turns into rock
// Waterfalls: where a river's surface drops at least `minDropFt` from one PROFILE_STEP to the
// next, carrying on while each step still drops `keepDropFt`, and falls at least `minSteep` times
// as far as it runs (steeper than that is a fall; gentler, rapids). A plunge pool `widths` river widths
// across (at least minPoolFt) is cut below each, deeper for taller falls, and the water churns
// there as if it fell `churnSlope`.
const FALLS = { minDropFt: 6, keepDropFt: 3, minSteep: 1, widths: 1.2, minPoolFt: 16, depthFt: [3, 14], depthPerDrop: 0.25 };
// Tiles list the rivers within this of them (tile.rivers), for working out the water's flow.
const RIVER_TILE_MARGIN_FT = 24;
const PROFILE_STEP = 16;

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toFt = ([x, z]) => [x * TILE_FT, z * TILE_FT];

// The continent as { land, pins, paths, water, edited }: the land grid (landGrid.js, or what was
// sent a worker of it), the sketch's pins, road paths and water ({ rivers, lakes }, plans/water.md),
// in continent tile units, and the height layers of tiles shaped by hand, by "tx,tz", which lakes
// fill over (waterGround.js). seedKey (the continent's key) seeds the noise.
export function prepareWorld(continent, seedKey) {
  const ctx = prepareShape(continent, seedKey);
  ctx.lakeSites = new Map(); // "gi,gj" -> lake or null, filled as tiles need them
  ctx.bogSites = new Map(); // "gi,gj" -> swamp pool or null, the same way
  ctx.bogs = new Map(); // hollow "x,z" -> swamp pool or null
  const { pins } = continent;
  const rivers = (continent.water?.rivers ?? []).filter((r) => r.points.length >= 2);

  ctx.biomes = prepareBiomes({
    pins: pins
      .filter((p) => p.kind === "biome")
      .map((p) => {
        const [x, z] = toFt(p.at);
        return { x, z, biome: p.biome, tags: p.tags };
      }),
    rivers: rivers.map((r) => simplify(r.points.map(toFt), BIOME_RIVER_TOLERANCE_FT)),
    edges: [],
    seed: ctx.seed,
  });


  // Rivers always descend: the surface follows the lowest ground seen so far from the source.
  ctx.rivers = rivers.map((s) => {
    const points = simplify(s.points.map(toFt), CHANNEL_TOLERANCE_FT);
    const line = makePolyline(points);
    const width = s.width ?? 30;
    // The lowest ground across the channel at each step down it.
    const across = width / 2 + RIVER.besideFt;
    const ground = sampleAlong(line, (x, z, along) => {
      const [ax, az] = pointAt(line, Math.max(0, along - 1));
      const [bx, bz] = pointAt(line, Math.min(line.length, along + 1));
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const [sx, sz] = [-(bz - az) / len, (bx - ax) / len];
      return Math.min(...[-1, -0.5, 0, 0.5, 1].map((k) => land(ctx, x + sx * across * k, z + sz * across * k, ctx.biomes).h));
    });
    let low = Infinity;
    return {
      line,
      points,
      width,
      half: width / 2,
      bank: Math.max(RIVER.minBankFt, width),
      reach: width / 2 + Math.max(RIVER.minBankFt, width) * RIVER.maxBanks,
      depth: clamp(width / 6, RIVER.minDepth, RIVER.maxDepth),
      surface: ground.map((h) => (low = Math.min(low, h)) - RIVER.surfaceDrop),
    };
  });
  ctx.falls = ctx.rivers.flatMap(fallsOf);
  ctx.roads = (continent.paths ?? []).filter((p) => p.route?.points?.length >= 2).map((p) => prepareRoad(p, (x, z) => land(ctx, x, z, ctx.biomes).h));

  // A lake fills the ground's hollows, as the editor's water flow sees the ground.
  const waterAt = waterGround(ctx.heightAt, continent.edited);
  ctx.ponds = (continent.water?.lakes ?? []).flatMap(({ seed, level }) => {
    const { region } = fillLake(waterAt, { seed, level });
    if (!region.length) return [];
    const ft = region.map((polygon) => polygon.map((ring) => ring.map(toFt)));
    const xs = ft.flat(2).map(([x]) => x);
    const zs = ft.flat(2).map(([, z]) => z);
    const reach = PONDS.rimWidthFt;
    const across = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    return [{
      region: ft,
      edges: edgesOf(ft),
      box: [Math.min(...xs) - reach, Math.min(...zs) - reach, Math.max(...xs) + reach, Math.max(...zs) + reach],
      level,
      depth: lerp(...PONDS.depthFt, Math.min(1, across / PONDS.wideFt)),
    }];
  });

  return ctx;
}

// Whether the sea covers a point, from prepareShape's ctx: where the land grid's below sea level.
export function seaAt(ctx, x, z) {
  return ctx.heightAt(x, z) < 0;
}

// The land's shape alone, with no biomes: the land grid (heightAt). prepareWorld builds on it, and
// the editor's heights map draws it with shapeHeight. continent: as for prepareWorld.
export function prepareShape({ land }, seedKey) {
  const grid = LandGrid.from(land);
  return { seed: hashString(seedKey), grid, heightAt: (x, z) => grid.heightAt(x, z), rivers: [] };
}

// The ground from prepareShape: the land grid, raised on land by `relief` ft as much as the
// biomes' detail is there, and the sea floor under the sea. No crags, rivers or anything else the
// biomes bring, beyond the relief given.
export function shapeHeight(ctx, x, z, relief = 0) {
  const base = ctx.heightAt(x, z);
  return base < 0 ? base : base + relief * smoothstep(0, SHORE_FT, base);
}

// The ground roads are routed over (editor/roads.js), from prepareWorld's ctx: the broad shape with
// the biomes' hills and ridges, leaving out the crags and smaller bumps a road's cut and fill
// smooths away. `water` is "sea", "lake" (the biomes' lakes and the sketch's) or null; rivers
// aren't counted, since roads cross them.
export function routeGround(ctx, x, z) {
  const h = shapeHeight(ctx, x, z, biomeRelief(ctx, x, z, climateAt(ctx.biomes, x, z).profile));
  if (seaAt(ctx, x, z)) return { h, water: "sea" };
  const out = { h, water: NaN, lake: false };
  lakes(ctx, out, x, z);
  for (const p of ctx.ponds) pond(out, x, z, p);
  return { h, water: out.lake ? "lake" : null };
}

// A biome profile's hills and rocky ridges at a point, in ft: the broad strokes of the land's
// detail, without crags, facets, ledges or small bumps. Ridges are ridged noise squared, so their
// crests are sharp and the ground between them opens out.
export function biomeRelief(ctx, x, z, { amp, rough }) {
  let h = fbm(x, z, ctx.seed, { wavelength: BASE.hillWavelength, octaves: 3 }) * amp;
  if (rough > 0) h += (1 - Math.abs(fbm(x, z, ctx.seed ^ 0x3c6ef372, { wavelength: BASE.roughWavelength, octaves: 3 }))) ** 2 * rough;
  return h;
}

// One tile's layers. tx and tz are continent tile coordinates.
export function generateTile(ctx, tx, tz) {
  const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
  const biomes = biomesNear(ctx.biomes, [x0, z0, x0 + TILE_FT, z0 + TILE_FT]);

  // One extra cell on each side, so slopes at the tile edge see their neighbours.
  const N = CELLS + 2;
  const samples = new Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      samples[j * N + i] = sample(ctx, x0 + (i - 0.5) * CELL_FT, z0 + (j - 0.5) * CELL_FT, biomes);
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
      // Nothing grows on roads in use.
      layers.clutter[k] = s.road?.traffic ? 0 : Math.min(255, Math.round(s.climate.profile.clutter * 100));
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
  // A waterfall belongs to the tile its lip is in.
  const inTile = ([x, , z]) => x >= x0 && x < x0 + TILE_FT && z >= z0 && z < z0 + TILE_FT;
  const round = (v) => Math.round(v * 10) / 10;
  tile.falls = ctx.falls.filter((f) => inTile(f.top)).map((f) => ({ top: f.top.map(round), bottom: f.bottom.map(round), width: f.width, pool: round(f.pool) }));
  tile.roads = roadsNear(ctx.roads, x0, z0);
  tile.rivers = riversNear(ctx.rivers, x0, z0);
  plantTrees(ctx, tile, (i, j) => samples[(j + 1) * N + (i + 1)]);
  // Objects keep off roads, by the cell they stand in.
  const onRoad = ([x, z]) => samples[(Math.floor((z - z0) / CELL_FT) + 1) * N + Math.floor((x - x0) / CELL_FT) + 1]?.road;
  tile.objects = scatterObjects(tile).filter((o) => !onRoad(o.at));
  return tile;
}

// The water over tiles whose ground was shaped by hand, which bodies don't carve (plans/water.md):
// each cell gets the water generating would give it (the sea, rivers, lakes, the biomes' pools)
// where its ground is below that water. Still water also fills hollows dug beside it, across the
// tiles given. tiles: [{ coords: [tx, tz], height }], height as a tile's layer. Returns, per tile,
// { water, kinds }: water as a tile's layer, and each cell's kind ("sea" or "fresh") or null.
export function waterOver(ctx, tiles) {
  const out = tiles.map(() => ({ water: new Float32Array(CELLS * CELLS).fill(NaN), kinds: new Array(CELLS * CELLS).fill(null) }));
  const index = new Map(tiles.map((t, n) => [t.coords.join(","), n]));
  const still = [];
  tiles.forEach(({ coords: [tx, tz], height }, n) => {
    const [x0, z0] = [tx * TILE_FT, tz * TILE_FT];
    const biomes = biomesNear(ctx.biomes, [x0, z0, x0 + TILE_FT, z0 + TILE_FT]);
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const s = sample(ctx, x0 + (i + 0.5) * CELL_FT, z0 + (j + 0.5) * CELL_FT, biomes);
        const k = j * CELLS + i;
        if (!(height[k] < s.water)) continue;
        out[n].water[k] = s.water;
        out[n].kinds[k] = s.sea ? "sea" : "fresh";
        if (!s.river) still.push([tx * CELLS + i, tz * CELLS + j]);
      }
    }
  });
  const at = (ci, cj) => {
    const n = index.get(`${Math.floor(ci / CELLS)},${Math.floor(cj / CELLS)}`);
    return n === undefined ? null : { n, k: (cj - tiles[n].coords[1] * CELLS) * CELLS + ci - tiles[n].coords[0] * CELLS };
  };
  for (let q = 0; q < still.length; q++) {
    const [ci, cj] = still[q];
    const { n, k } = at(ci, cj);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = at(ci + di, cj + dj);
      if (!next || !Number.isNaN(out[next.n].water[next.k]) || !(tiles[next.n].height[next.k] < out[n].water[k])) continue;
      out[next.n].water[next.k] = out[n].water[k];
      out[next.n].kinds[next.k] = out[n].kinds[k];
      still.push([ci + di, cj + dj]);
    }
  }
  return out;
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
      if (s.road && !(s.road.disused && roll(6) < ROAD.disusedTrees)) continue;
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

// Ground before rivers, pools and ravines: the sea floor where the land grid's below sea level,
// and elsewhere the grid with the biomes' hills and crags. Returns { h, base, t, shore, land,
// climate }, where base is the grid's height, t grows from 0 at sea level to 1 at SHORE_FT, for
// features that keep off the shore, and shore says whether low land is near the sea.
function land(ctx, x, z, biomes) {
  const climate = climateAt(biomes, x, z);
  const base = ctx.heightAt(x, z);
  if (base < 0) return { h: seaFloor(ctx, x, z, base), base, t: 0, land: false, climate };

  const { rough } = climate.profile;
  const d = CRAG.probeFt;
  const steep = Math.hypot(ctx.heightAt(x + d, z) - ctx.heightAt(x - d, z), ctx.heightAt(x, z + d) - ctx.heightAt(x, z - d)) / (2 * d);
  let h = base + biomeRelief(ctx, x, z, climate.profile);
  const crag = rough * 0.5 + steep * CRAG.perSlope;
  if (crag > 0) h += (1 - Math.abs(fbm(x, z, ctx.seed ^ 0x1b873593, { wavelength: CRAG.wavelength, octaves: 3 }))) ** 2 * crag;
  FACETS.forEach(({ wavelength, share }, n) => {
    if (rough > 0) h += facets(x, z, ctx.seed ^ (0x5bd1e995 + n), wavelength) * rough * share;
  });
  if (climate.profile.cliffs > 0) h = ledges(ctx, h, x, z, climate.profile.cliffs);
  const swell = JITTER.swellFt * smoothstep(0, JITTER.swellFullAt, base);
  h += fbm(x, z, ctx.seed ^ 0x3c6ef373, { wavelength: JITTER.swellWavelength, octaves: 2 }) * swell;
  h += fbm(x, z, ctx.seed ^ 0x6a09e667, { wavelength: JITTER.wavelength, octaves: 2 }) * JITTER.ft;
  const { pools } = climate.profile;
  // Turned, so the noise's lattice doesn't line the dents up north-south and east-west.
  if (pools > 0) h -= BOG.dentFt * pools * smoothstep(BOG.dentFrom, BOG.dentFull, fbm(x * 0.8 - z * 0.6, x * 0.6 + z * 0.8, ctx.seed ^ 0x51ab3c, { wavelength: BOG.dentWavelength, octaves: 2 }));

  const t = smoothstep(0, SHORE_FT, base);
  const shore = t < 1 && [0, 1, 2, 3, 4, 5, 6, 7].some((k) => ctx.heightAt(x + Math.cos(k * 0.785) * BEACH.reachFt, z + Math.sin(k * 0.785) * BEACH.reachFt) < 0);
  return { h: Math.max(Math.min(base, 0.5), base + (h - base) * t), base, t, shore, land: true, climate };
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

// The sea floor: the land grid, with bumps that grow in away from the shore.
function seaFloor(ctx, x, z, base) {
  const bumps = fbm(x, z, ctx.seed ^ 0x2545f491, { wavelength: 250 }) * SEA.bumps * smoothstep(0, SEA.fadeFt, -base);
  return Math.min(SEA.shallowFt, base + bumps);
}

function sample(ctx, x, z, biomes) {
  const ground = land(ctx, x, z, biomes);
  if (ground.land) roadAt(ctx.roads, ground, x, z, ctx.seed);
  const out = { road: ground.road ?? null, paved: Boolean(ground.paved), h: ground.h, water: NaN, sea: false, river: false, bank: false, pool: false, lake: false, land: ground.land, shore: ground.shore, climate: ground.climate };
  const { pools, ravines } = ground.climate.profile;
  if (pools > 0 && ground.t > 0) bogs(ctx, out, x, z);
  if (ravines > 0 && ground.t > 0) ravine(ctx, out, x, z, ravines * ground.t);
  if (ground.land) lakes(ctx, out, x, z);
  for (const p of ctx.ponds) pond(out, x, z, p);
  const { banks, bed } = ground.climate.profile;
  let levee = -Infinity; // how high the banks of rivers here must be to hold their water
  for (const r of ctx.rivers) {
    if (!nearBounds(r.line, x, z, r.reach)) continue;
    const n = nearest(r.line, x, z);
    const bank = r.bank * Math.min(RIVER.maxBanks, banks);
    if (n.dist >= r.half + bank) continue;
    const surface = profileAt(r.surface, n.along);
    const depth = Math.min(RIVER.maxDepth, r.depth * bed);
    if (n.dist < r.half) {
      const t = n.dist / r.half;
      out.h = Math.min(out.h, surface - depth * (1 - t * t));
      if (!(out.water >= surface)) out.water = surface;
      out.river = true;
    } else {
      // The bank keeps rising at the bed's slope through the waterline, up to the levee, so the
      // shore falls right on the river's edge rather than on whichever cells are inside it.
      const e = n.dist - r.half;
      const lip = surface + Math.min(RIVER.leveeFt, e * Math.max(RIVER.minEdgeSlope, (2 * depth) / r.half));
      const t = smoothstep(0, 1, e / bank);
      levee = Math.max(levee, lerp(lip, out.h, t));
      out.h = Math.min(out.h, lerp(lip, out.h, t));
      if (n.dist < r.half + bank * 0.6) out.bank = true;
    }
  }
  if (Number.isNaN(out.water)) out.h = Math.max(out.h, levee);
  plunge(ctx, out, x, z);
  // The sea covers the sea floor. Land carved below sea level stays dry.
  if (!out.land && Number.isNaN(out.water)) {
    out.water = 0;
    out.sea = true;
  }
  return out;
}

// A road path's line and bed (see ROAD), and how its surface looks. path: { tags, width, route:
// { points } } with points in tiles; groundAt(x, z) is the ground's height before the road.
export function prepareRoad(path, groundAt) {
  const tags = new Set(path.tags ?? []);
  // Roads and highways in use; plain paths from before kinds count as roads.
  const kind = TRAFFIC.find((k) => tags.has(k)) ?? (["trail", "footpath"].some((k) => tags.has(k)) ? null : "road");
  const traffic = Boolean(kind) && !tags.has("faint") && !tags.has("disused");
  const points = path.route.points.map(toFt);
  const line = makePolyline(points);
  const ground = sampleAlong(line, groundAt);
  const even = Math.round((traffic ? ROAD.evenTrafficFt : ROAD.evenFt) / PROFILE_STEP);
  const bed = ground.map((_, i) => {
    const near = ground.slice(Math.max(0, i - even), i + even + 1);
    return near.reduce((sum, h) => sum + h, 0) / near.length;
  });
  // Held to the grade cap both ways, so every step between neighbours is.
  const climb = gradeCap(path.width) * PROFILE_STEP;
  for (let i = 1; i < bed.length; i++) bed[i] = clamp(bed[i], bed[i - 1] - climb, bed[i - 1] + climb);
  for (let i = bed.length - 2; i >= 0; i--) bed[i] = clamp(bed[i], bed[i + 1] - climb, bed[i + 1] + climb);
  const half = Math.max(path.width / 2, ROAD.minHalfFt);
  return {
    line,
    points: simplify(points, 0.5),
    bed,
    half,
    traffic: traffic && kind,
    flat: half + (traffic ? ROAD.flatFt : 0),
    reach: half + ROAD.maxShoulderFt,
    ragged: tags.has("trail") || tags.has("footpath") ? ROAD.ragged : ROAD.even,
    cover: (tags.has("faint") ? ROAD.faint : 1) * (tags.has("disused") ? ROAD.disused : 1),
    disused: tags.has("disused"),
  };
}

// Digs the ground down to the roads' beds or builds it up, sloping back to the land beside them,
// and marks where they're surfaced (ground.paved) and kept clear of trees (ground.road). `roads`
// are prepareRoad's; `seed` sets how ragged edges and patches wander.
export function roadAt(roads, ground, x, z, seed) {
  for (const r of roads) {
    if (!nearBounds(r.line, x, z, r.reach)) continue;
    const n = nearest(r.line, x, z);
    if (n.dist >= r.reach) continue;
    const bed = profileAt(r.bed, n.along);
    if (n.dist <= r.flat) {
      ground.h = bed;
    } else {
      const shoulder = clamp(Math.abs(ground.h - bed) / ROAD.sideSlope, ROAD.minShoulderFt, ROAD.maxShoulderFt);
      ground.h = lerp(bed, ground.h, smoothstep(0, 1, (n.dist - r.flat) / shoulder));
    }
    if (r.traffic) {
      if (n.dist < r.half + ROAD.clearFt) ground.road = r;
      if (n.dist < Math.max(r.half - ROAD.coreFt, ROAD.minHalfFt)) ground.paved = true;
      continue;
    }
    const edge = r.half * (1 + r.ragged * fbm(x, z, seed ^ 0x2f6b1a37, { wavelength: 30, octaves: 2 }));
    if (n.dist >= edge) continue;
    const patch = r.cover >= 1 || (fbm(x, z, seed ^ 0x4c1d2e93, { wavelength: 20, octaves: 2 }) + 1) / 2 < r.cover;
    if (patch) [ground.road, ground.paved] = [r, true];
  }
}

// The roads and highways in use near a tile, for drawing: { kind, half, segments } with each
// segment [ax, az, bx, bz] in continent ft.
export function roadsNear(roads, x0, z0) {
  const round = (v) => Math.round(v * 10) / 10;
  return roads.flatMap((r) => {
    if (!r.traffic) return [];
    const m = r.half + ROAD.tileMarginFt;
    const segments = [];
    for (let k = 1; k < r.points.length; k++) {
      const [[ax, az], [bx, bz]] = [r.points[k - 1], r.points[k]];
      if (Math.max(ax, bx) < x0 - m || Math.min(ax, bx) > x0 + TILE_FT + m || Math.max(az, bz) < z0 - m || Math.min(az, bz) > z0 + TILE_FT + m) continue;
      segments.push([ax, az, bx, bz].map(round));
    }
    return segments.length ? [{ kind: r.traffic, half: r.half, segments }] : [];
  });
}

// A river's waterfalls, each { top: [x, y, z], bottom: [x, y, z], width, pool, depth }: the lip
// the water leaves and where it lands (ft, y up, on the water's surface), the river's width, and
// the plunge pool's radius and depth.
export function fallsOf(r) {
  const falls = [];
  const s = r.surface;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] - s[i + 1] < FALLS.minDropFt) continue;
    let j = i + 1;
    while (j < s.length - 1 && s[j] - s[j + 1] >= FALLS.keepDropFt) j++;
    const at = (k) => pointAt(r.line, Math.min(r.line.length, k * PROFILE_STEP));
    const [[tx, tz], [bx, bz]] = [at(i), at(j)];
    const drop = s[i] - s[j];
    i = j - 1;
    if (drop < FALLS.minSteep * Math.hypot(bx - tx, bz - tz)) continue;
    falls.push({
      top: [tx, s[i], tz],
      bottom: [bx, s[j], bz],
      width: r.width,
      pool: Math.max(FALLS.minPoolFt, r.width * FALLS.widths) / 2,
      depth: clamp(drop * FALLS.depthPerDrop, ...FALLS.depthFt),
    });
  }
  return falls;
}

// The plunge pools below waterfalls: a bowl cut under the water.
function plunge(ctx, out, x, z) {
  if (Number.isNaN(out.water)) return;
  for (const f of ctx.falls) {
    const d = Math.hypot(x - f.bottom[0], z - f.bottom[2]);
    if (d >= f.pool) continue;
    out.h = Math.min(out.h, f.bottom[1] - f.depth * (1 - (d / f.pool) ** 2));
  }
}

// The rivers near a tile, so a client can work out which way its water runs: { half, segments }
// with each segment [ax, az, bx, bz] in continent ft, running downstream.
export function riversNear(rivers, x0, z0) {
  const round = (v) => Math.round(v * 10) / 10;
  return rivers.flatMap((r) => {
    const m = r.half + RIVER_TILE_MARGIN_FT;
    const segments = [];
    for (let k = 1; k < r.points.length; k++) {
      const [[ax, az], [bx, bz]] = [r.points[k - 1], r.points[k]];
      if (Math.max(ax, bx) < x0 - m || Math.min(ax, bx) > x0 + TILE_FT + m || Math.max(az, bz) < z0 - m || Math.min(az, bz) > z0 + TILE_FT + m) continue;
      segments.push([ax, az, bx, bz].map(round));
    }
    return segments.length ? [{ half: r.half, segments }] : [];
  });
}

// Swamp pools: water over the ground here when it's in a hollow's pool, below its level and
// inside its shore.
function bogs(ctx, out, x, z) {
  const reach = Math.ceil(BOG.reachFt / BOG.gridFt);
  const [gi, gj] = [Math.floor(x / BOG.gridFt), Math.floor(z / BOG.gridFt)];
  for (let dj = -reach; dj <= reach; dj++) {
    for (let di = -reach; di <= reach; di++) {
      const bog = bogSite(ctx, gi + di, gj + dj);
      if (!bog || out.h >= bog.level || out.water >= bog.level) continue;
      const d = Math.hypot(x - bog.x, z - bog.z);
      if (d >= BOG.reachFt) continue;
      // The shore's distance this way, between the two rays either side.
      const a = ((Math.atan2(z - bog.z, x - bog.x) / (2 * Math.PI)) * BOG.rays + BOG.rays) % BOG.rays;
      const k = Math.floor(a);
      const shore = lerp(bog.shore[k], bog.shore[(k + 1) % BOG.rays], a - k);
      if (d > shore) continue;
      out.water = bog.level;
      out.h = Math.min(out.h, bog.level - 0.2);
      out.pool = true;
    }
  }
}

// The swamp pool found by running downhill from the point in grid square (gi, gj), or null.
function bogSite(ctx, gi, gj) {
  const key = `${gi},${gj}`;
  if (ctx.bogSites.has(key)) return ctx.bogSites.get(key);
  ctx.bogSites.set(key, null);
  const roll = (k) => hash2(gi, gj, ctx.seed ^ Math.imul(k + 7, 0x165667b1));
  let [x, z] = [(gi + 0.2 + 0.6 * roll(1)) * BOG.gridFt, (gj + 0.2 + 0.6 * roll(2)) * BOG.gridFt];
  const ground = (px, pz) => land(ctx, px, pz, ctx.biomes);
  const start = ground(x, z);
  if (!(start.climate.profile.pools > 0) || start.t < 1) return null;
  let h = start.h;
  for (let step = BOG.stepFt; step >= 1; ) {
    let best = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const g = ground(x + dx * step, z + dz * step).h;
      if (g < h && (!best || g < best[2])) best = [x + dx * step, z + dz * step, g];
    }
    if (best) [x, z, h] = best;
    else step /= 2;
  }
  const bog = bogAt(ctx, Math.round(x), Math.round(z), ground);
  ctx.bogSites.set(key, bog);
  return bog;
}

// The pool in the hollow at (x, z), or null when it's too shallow to hold one: its level is a
// little under the lowest of the highest points along each ray out, and its shore along each ray
// is where the ground first rises over that level.
function bogAt(ctx, x, z, ground) {
  const key = `${x},${z}`;
  if (ctx.bogs.has(key)) return ctx.bogs.get(key);
  const bottom = ground(x, z).h;
  const rays = Array.from({ length: BOG.rays }, (_, k) => {
    const [dx, dz] = [Math.cos((k / BOG.rays) * 2 * Math.PI), Math.sin((k / BOG.rays) * 2 * Math.PI)];
    const heights = [];
    for (let d = BOG.rayStepFt; d <= BOG.reachFt; d += BOG.rayStepFt) heights.push(ground(x + dx * d, z + dz * d).h);
    return heights;
  });
  const spill = Math.min(...rays.map((heights) => Math.max(...heights)));
  const level = Math.min(spill - BOG.belowFt, bottom + BOG.maxDepthFt);
  let bog = null;
  if (level - bottom >= BOG.minDepthFt) {
    const shore = rays.map((heights) => {
      const out = heights.findIndex((g) => g >= level);
      return (out < 0 ? heights.length : out + 0.5) * BOG.rayStepFt;
    });
    bog = { x, z, level, shore };
  }
  ctx.bogs.set(key, bog);
  return bog;
}

// A sketch lake: flat water inside its outline, and a rim just outside.
function pond(out, x, z, p) {
  const [x0, z0, x1, z1] = p.box;
  if (x < x0 || x > x1 || z < z0 || z > z1) return;
  const shore = distanceToEdges(x, z, p.edges);
  if (pointInRegion(x, z, p.region)) {
    out.water = Number.isNaN(out.water) ? p.level : Math.max(out.water, p.level);
    out.h = Math.min(out.h, p.level - PONDS.shelfFt - p.depth * smoothstep(0, PONDS.slopeFt, shore));
    out.lake = true;
  } else if (shore < PONDS.rimWidthFt) {
    out.h = Math.max(out.h, lerp(p.level + PONDS.rimFt, out.h, shore / PONDS.rimWidthFt));
    out.bank = true;
  }
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
  const reach = r * (1 + LAKES.wobble) + LAKES.damFt;
  const around = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => land(ctx, x + dx, z + dz, ctx.biomes));
  const heights = around.map((g) => g.h);
  if (!around.every((g) => g.t >= 1)) return null;
  if (![[reach, 0], [-reach, 0], [0, reach], [0, -reach]].every(([dx, dz]) => ctx.heightAt(x + dx, z + dz) >= SHORE_FT)) return null;
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
  return Array.from({ length: count }, (_, i) => {
    const along = Math.min(line.length, i * PROFILE_STEP);
    return fn(...pointAt(line, along), along);
  });
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
  if (s.paved) return T.path;
  if (slope > s.climate.profile.steep) return T.rock;
  if (s.bank) return T.shore;
  const { biome, second, weight } = s.climate;
  const here = BIOMES[hash2(ci, cj, ctx.seed ^ 0x2545f491) < weight ? biome : second];
  if (s.h < 2.5 + BASE.shoreHeight && s.shore && BEACH.biomes.has(here)) return T.sand;
  if (s.h < 0) return T.mud;
  const n = fbm(ci * CELL_FT, cj * CELL_FT, ctx.seed ^ 0x6a09e667, { wavelength: 60, octaves: 3 });
  if (here === "swamp") return n > 0.25 ? T.moss : n > 0.05 ? T.mud : T.grass;
  if (here === "rocky") return n > 0.15 ? T.rock : n > -0.25 ? T.dirt : T.grass;
  return n > (here === "forest" ? 0.6 : 0.5) ? T.dirt : T.grass;
}
