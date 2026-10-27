// Objects (plans/design.md, "Objects"): things on the ground that block movement, like boulders,
// logs and stumps. Unlike ground clutter they're stored, in the tile manifest's `objects` list,
// so they can be moved, turned, resized or deleted. Generating a tile scatters them by its biomes;
// regenerating replaces them, edits included.
//
// An object is { id, type, at: [x, z], yaw, scale, colors, footprint, height }: at is continent
// feet, yaw radians about up (three.js's rotation.y), scale the type's size in feet, colors one
// [r, g, b] (0-1) per part. footprint and height (the blocking shape and how tall it stands) are
// worked out from the type when placed, so the game server never needs the types.

import { shapeOf } from "./builtObjects.js";
import { CELL_FT, TILE_FT } from "./constants.js";
import { KIT_OBJECTS } from "./kitObjects.js";
import { hash2 } from "./noise.js";
import { parseTree } from "./trees.js";

const GREY = [[0.07, 0.12], [0.03, 0.1], [0.4, 0.55]];
const DARK_GREY = [[0.07, 0.12], [0.04, 0.1], [0.3, 0.42]];
const BARK = [[0.06, 0.1], [0.3, 0.45], [0.2, 0.3]];
const ROTTEN = [[0.07, 0.12], [0.2, 0.35], [0.15, 0.24]];
const BLEACHED = [[0.08, 0.12], [0.08, 0.18], [0.6, 0.72]];
const BUSH = [[0.24, 0.32], [0.35, 0.5], [0.2, 0.3]];
const MOSS = [[0.2, 0.26], [0.4, 0.55], [0.3, 0.4]];

// size: [min, max] feet, what scale means for the type (its height, or its length for logs).
// footprint: the blocking shape for scale 1, one of { circle: r }, { capsule: [r, half] } (along
// the object's own x) or { rect: [w, d] } (w along its x). height: how tall it stands, for scale 1.
// parts: a shape each (objectMeshes.js) and the color ranges to pick from, HSL 0-1.
// kit: instead of parts' shapes, a built object made of pieces (kitObjects.js), unitFt of its feet
// to one of the type's; its first part's color tints the whole of it.
export const OBJECT_TYPES = {
  boulder: { size: [3, 8], footprint: { circle: 0.45 }, height: 0.8, parts: [{ shape: "boulder", colors: [GREY] }] },
  outcrop: { size: [2.5, 4], footprint: { rect: [2.6, 1.6] }, height: 1, parts: [{ shape: "outcrop", colors: [GREY] }] },
  bush: { size: [3, 5], footprint: { circle: 0.42 }, height: 0.95, parts: [{ shape: "bush", colors: [BUSH] }] },
  fence: { size: [3.5, 4.5], footprint: { rect: [2.6, 0.2] }, height: 1, kit: KIT_OBJECTS.fence, unitFt: 4, parts: [{ colors: [BLEACHED] }] },
  log: { size: [25, 50], footprint: { capsule: [0.1, 0.5] }, height: 0.2, kit: KIT_OBJECTS.log, unitFt: 30, parts: [{ colors: [BARK] }] },
  stump: { size: [3, 6], footprint: { circle: 0.8 }, height: 1, parts: [{ shape: "stump", colors: [BARK] }] },
  mossyBoulder: { size: [3, 6], footprint: { circle: 0.45 }, height: 0.85, parts: [{ shape: "boulder", colors: [DARK_GREY] }, { shape: "mossCap", colors: [MOSS] }] },
  thicket: { size: [4, 6], footprint: { circle: 0.7 }, height: 0.95, parts: [{ shape: "thicket", colors: [BUSH] }] },
  uprooted: { size: [60, 110], footprint: { capsule: [0.045, 0.5] }, height: 0.24, parts: [{ shape: "trunk", colors: [BARK] }, { shape: "roots", colors: [[[0.06, 0.09], [0.25, 0.4], [0.18, 0.26]]] }] },
  rock: { size: [4, 15], footprint: { circle: 0.45 }, height: 0.8, parts: [{ shape: "rock", colors: [GREY] }] },
  spire: { size: [10, 25], footprint: { circle: 0.15 }, height: 1, parts: [{ shape: "spire", colors: [GREY] }] },
  rubble: { size: [4, 8], footprint: { circle: 0.5 }, height: 0.35, parts: [{ shape: "rubble", colors: [GREY] }] },
  deadStump: { size: [3, 6], footprint: { circle: 0.8 }, height: 1, parts: [{ shape: "stump", colors: [BLEACHED] }] },
  rottingLog: { size: [20, 45], footprint: { capsule: [0.1, 0.5] }, height: 0.2, sink: 0.3, kit: KIT_OBJECTS.log, unitFt: 30, parts: [{ colors: [ROTTEN] }] },
  hollowStump: { size: [4, 7], footprint: { circle: 0.8 }, height: 1, parts: [{ shape: "hollowStump", colors: [ROTTEN] }] },
  rootTangle: { size: [4, 7], footprint: { circle: 0.55 }, height: 0.7, parts: [{ shape: "rootArches", colors: [ROTTEN] }] },
  hummock: { size: [2, 3.5], footprint: { circle: 1.1 }, height: 1, parts: [{ shape: "hummock", colors: [MOSS] }] },
  driftLog: { size: [15, 35], footprint: { capsule: [0.07, 0.5] }, height: 0.14, kit: KIT_OBJECTS.driftLog, unitFt: 30, parts: [{ colors: [BLEACHED] }] },
};

// Built objects (builtObjects.js) are types too, named "built:<id>". For them scale is a factor, 1
// being as built, and colors are their parameters' colors (paletteColors), absent for the defaults.
// The world's built objects are registered here with setBuiltObjects.
export const BUILT_PREFIX = "built:";
export const BUILT_SCALES = [0.25, 4];
const built = new Map(); // id -> { object, footprint, height }

export function setBuiltObjects(objects) {
  built.clear();
  for (const object of objects) built.set(object.id, { object, ...shapeOf(object) });
}

// The built object a type names, or undefined.
export function builtOf(type) {
  return type?.startsWith(BUILT_PREFIX) ? built.get(type.slice(BUILT_PREFIX.length))?.object : undefined;
}

// What a type is, as OBJECT_TYPES gives it, for built objects too: { size, footprint, height,
// built }. Undefined for a type that isn't known.
export function specOf(type) {
  if (!type?.startsWith(BUILT_PREFIX)) return OBJECT_TYPES[type];
  const b = built.get(type.slice(BUILT_PREFIX.length));
  return b && { size: BUILT_SCALES, footprint: b.footprint, height: b.height, built: b.object, sink: 0 };
}

// Where objects scatter: `at` names a kind of cell (see placeOf), `per` is the chance per cell,
// and `biomes` limits a rule to those biomes. `wet` lets a type lie in shallow water.
const RULES = [
  { type: "boulder", at: "ground", biomes: ["plains"], per: 0.0008 },
  { type: "outcrop", at: "ground", biomes: ["plains"], per: 0.0003 },
  { type: "bush", at: "ground", biomes: ["plains"], per: 0.004 },
  { type: "fence", at: "ground", biomes: ["plains"], per: 0.0001 },

  { type: "log", at: "ground", biomes: ["forest"], per: 0.003 },
  { type: "stump", at: "ground", biomes: ["forest"], per: 0.004 },
  { type: "mossyBoulder", at: "ground", biomes: ["forest"], per: 0.001 },
  { type: "thicket", at: "ground", biomes: ["forest"], per: 0.002 },
  { type: "uprooted", at: "ground", biomes: ["forest"], per: 0.0003 },

  { type: "rock", at: "ground", biomes: ["rocky"], per: 0.006 },
  { type: "rock", at: "flatRock", per: 0.004 },
  { type: "spire", at: "ground", biomes: ["rocky"], per: 0.0004 },
  { type: "rubble", at: "ground", biomes: ["rocky"], per: 0.0015 },
  { type: "deadStump", at: "ground", biomes: ["rocky"], per: 0.001 },

  { type: "rottingLog", at: "ground", biomes: ["swamp"], per: 0.003 },
  { type: "rottingLog", at: "shallows", biomes: ["swamp"], per: 0.004 },
  { type: "hollowStump", at: "ground", biomes: ["swamp"], per: 0.0015 },
  { type: "rootTangle", at: "ground", biomes: ["swamp"], per: 0.0015 },
  { type: "hummock", at: "ground", biomes: ["swamp"], per: 0.002 },

  { type: "driftLog", at: "sand", per: 0.0015 },
  { type: "boulder", at: "sand", per: 0.001 },
  { type: "rock", at: "belowCliff", per: 0.01 },
];

const GROUND = new Set(["grass", "dirt", "moss", "mud"]);
const STEEP = 0.7;
const MAX_SLOPE = 0.45; // objects keep off ground steeper than this
const GAP_FT = 2; // between objects

// Scatters objects over a generated tile, keeping them off trees, deep water, steep ground and
// each other. Returns the list for tile.objects.
export function scatterObjects(tile) {
  const [tx, tz] = tile.coords;
  const n = tile.cells;
  const seed = tile.generator?.seed ?? 0;
  const { height, water } = tile.layers;
  const biomes = tile.palettes.biome ?? [];
  const terrainAt = (i, j) => tile.palettes.terrain[tile.layers.terrain[j * n + i]];
  const h = (i, j) => height[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const slopeAt = (i, j) => Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * CELL_FT);
  const placed = [];

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const terrain = terrainAt(i, j);
      if (parseTree(terrain)) continue;
      const wet = !Number.isNaN(water[k]);
      const depth = water[k] - height[k];
      const slope = slopeAt(i, j);
      const places = placeOf({ terrain, wet, depth, slope, cliffNear: () => nearSteepRock(tile, i, j, slopeAt) });
      if (!places.size) continue;
      const biome = biomes[tile.layers.biome[k]];
      const gi = tx * n + i;
      const gj = tz * n + j;
      RULES.forEach((rule, r) => {
        if (!places.has(rule.at) || (rule.biomes && !rule.biomes.includes(biome))) return;
        const roll = (q) => hash2(gi, gj, seed ^ Math.imul(r * 16 + q + 1, 0x7feb352d));
        if (roll(0) >= rule.per) return;
        const type = OBJECT_TYPES[rule.type];
        const scale = type.size[0] + (type.size[1] - type.size[0]) * roll(1);
        const object = makeObject(rule.type, [(gi + roll(2)) * CELL_FT, (gj + roll(3)) * CELL_FT], roll(4) * Math.PI * 2, scale, (q) => roll(5 + q));
        if (fits(tile, object, placed, rule.at === "shallows")) placed.push({ ...object, id: `${tx}.${tz}.${placed.length}` });
      });
    }
  }
  return placed;
}

// A new object of `type`, its colors picked by roll(q) in [0, 1).
export function makeObject(type, at, yaw, scale, roll = Math.random) {
  const spec = specOf(type);
  if (spec.built) return { id: null, type, at, yaw, scale, footprint: footprintOf(type, scale), height: spec.height * scale };
  return {
    id: null,
    type,
    at,
    yaw,
    scale,
    colors: spec.parts.map((part, p) => colorIn(part.colors, (s) => roll(p * 4 + s))),
    footprint: footprintOf(type, scale),
    height: spec.height * scale,
  };
}

// The type's blocking shape at a scale, in feet.
export function footprintOf(type, scale) {
  const { footprint } = specOf(type);
  if (footprint.circle) return { circle: footprint.circle * scale };
  if (footprint.capsule) return { capsule: footprint.capsule.map((v) => v * scale) };
  return { rect: footprint.rect.map((v) => v * scale) };
}

// How far the footprint reaches from the object's middle.
export function reachOf({ footprint }) {
  if (footprint.circle) return footprint.circle;
  if (footprint.capsule) return footprint.capsule[0] + footprint.capsule[1];
  return Math.hypot(footprint.rect[0], footprint.rect[1]) / 2;
}

// Whether a circle of `radius` at (x, z) overlaps the object's footprint.
export function blocks(object, x, z, radius = 0) {
  const dx = x - object.at[0];
  const dz = z - object.at[1];
  if (Math.hypot(dx, dz) > reachOf(object) + radius) return false;
  const { footprint } = object;
  if (footprint.circle) return Math.hypot(dx, dz) < footprint.circle + radius;
  // Into the object's own axes.
  const c = Math.cos(object.yaw);
  const s = Math.sin(object.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  if (footprint.capsule) {
    const [r, half] = footprint.capsule;
    return Math.hypot(lx - Math.max(-half, Math.min(half, lx)), lz) < r + radius;
  }
  const [w, d] = footprint.rect;
  return Math.abs(lx) < w / 2 + radius && Math.abs(lz) < d / 2 + radius;
}

// The tile whose objects list an object at continent feet [x, z] belongs in.
export function tileOf([x, z]) {
  return [Math.floor(x / TILE_FT), Math.floor(z / TILE_FT)];
}

// Whether an object can go here: every cell under it dry (or shallow, when `shallow` is allowed),
// treeless and not steep, and clear of the objects already placed.
function fits(tile, object, placed, shallow) {
  const n = tile.cells;
  const [tx, tz] = tile.coords;
  const reach = reachOf(object);
  const [x, z] = object.at;
  for (let gz = Math.floor((z - reach) / CELL_FT); gz <= Math.floor((z + reach) / CELL_FT); gz++) {
    for (let gx = Math.floor((x - reach) / CELL_FT); gx <= Math.floor((x + reach) / CELL_FT); gx++) {
      const i = gx - tx * n;
      const j = gz - tz * n;
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (!blocks(object, (gx + 0.5) * CELL_FT, (gz + 0.5) * CELL_FT, CELL_FT * 0.7)) continue;
      const k = j * n + i;
      if (parseTree(tile.palettes.terrain[tile.layers.terrain[k]])) return false;
      const depth = tile.layers.water[k] - tile.layers.height[k];
      if (!Number.isNaN(depth) && !(shallow && depth < 2.5)) return false;
    }
  }
  return placed.every((other) => Math.hypot(other.at[0] - x, other.at[1] - z) > reachOf(other) + reach + GAP_FT);
}

function placeOf({ terrain, wet, depth, slope, cliffNear }) {
  const places = new Set();
  if (wet) {
    if (depth < 2.5) places.add("shallows");
    return places;
  }
  if (slope > MAX_SLOPE) return places;
  if (GROUND.has(terrain)) places.add("ground");
  if (terrain === "sand") places.add("sand");
  if (terrain === "rock") places.add("flatRock");
  if ((GROUND.has(terrain) || terrain === "rock") && cliffNear()) places.add("belowCliff");
  return places;
}

// Whether steep rock lies within two cells.
function nearSteepRock(tile, i, j, slopeAt) {
  const n = tile.cells;
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const [a, b] = [i + di, j + dj];
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      if (tile.palettes.terrain[tile.layers.terrain[b * n + a]] === "rock" && slopeAt(a, b) > STEEP) return true;
    }
  }
  return false;
}

function colorIn(choices, roll) {
  const [hue, sat, light] = choices[Math.min(choices.length - 1, Math.floor(roll(0) * choices.length))];
  const lerp = ([a, b], t) => a + (b - a) * t;
  const [hh, s, l] = [lerp(hue, roll(1)), lerp(sat, roll(2)), lerp(light, roll(3))];
  const f = (m) => {
    const k = (m + hh * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}
