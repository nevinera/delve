import { CLUTTER, colorIn } from "../world/clutter.js";
import { fbm, hash2 } from "../world/noise.js";
import { BIOME_NAMES } from "./biomes.js";
import { STEEP_DEG } from "./look.js";
import { CELL_FT, TILE_FT } from "./sizes.js";
import { WATER_TYPES } from "./water.js";

// Clutter by the water: reeds, pebbles, stones, lilies and water weed, as world/clutter.js's kinds,
// worked out where it's drawn for each cell of a tile from its ground and water, never stored, so
// it's the same every time. Each rule puts `per` of a kind in each cell of a kind of place (placeOf),
// gathered into patches covering about `patches` of it where it says, in `biomes` where it says.

const RULES = [
  { kind: "reeds", at: "stillEdge", per: 1.4, patches: 0.6 },
  { kind: "reeds", at: "runningEdge", per: 0.5, patches: 0.35 },
  { kind: "pebble", at: "bank", per: 1.5 },
  { kind: "stone", at: "bank", per: 0.35 },
  { kind: "pebble", at: "shore", per: 0.4 },
  { kind: "pebble", at: "runningShallows", per: 1 },
  { kind: "stone", at: "runningShallows", per: 0.3 },
  { kind: "lily", at: "stillSurface", per: 0.3, patches: 0.45 },
  { kind: "lily", at: "stillSurface", biomes: ["swamp"], per: 0.5, patches: 0.5 },
  { kind: "waterweed", at: "stillBed", per: 0.5, patches: 0.4 },
];
const EDGE_FT = 1; // how far over the water, or under it, its edge reaches
const SHALLOW_FT = 2; // how deep running water's shallows are
const LILY_FT = [0.5, 6]; // how deep water lilies float on
const WEED_FT = 1.5; // how deep water weed starts
const PATCH_FT = 60;
const SEED = 0x636c7574;
const SEA = WATER_TYPES.indexOf("sea");

// The kinds of place a cell is, for rules' `at`, from its `height` and `slope` (degrees) and its
// water as look.js's groundClass has it, with `level` the near water's where it's dry.
export function placeOf(height, slope, water) {
  const places = new Set();
  if (!water || slope >= STEEP_DEG || water.type === SEA) return places;
  if (water.wet) {
    const depth = water.level - height;
    if (water.running) {
      if (depth < SHALLOW_FT) places.add("runningShallows");
      if (depth < EDGE_FT) places.add("runningEdge");
    } else {
      if (depth < EDGE_FT) places.add("stillEdge");
      if (depth > LILY_FT[0] && depth < LILY_FT[1]) places.add("stillSurface");
      if (depth > WEED_FT) places.add("stillBed");
    }
    return places;
  }
  const over = height - water.level;
  if (over > 3) return places;
  places.add(water.running ? "bank" : "shore");
  if (over < EDGE_FT) places.add(water.running ? "runningEdge" : "stillEdge");
  return places;
}

// Tile (tx, tz)'s clutter by the water, as world/clutter.js's clutterForTile gives it: [{ kind, x,
// z, y, yaw, scale, normal, colors }]. cellAt(i, j) gives cell (i, j)'s { height, slope, biome,
// water } (water as placeOf has it, or null where there's none near), and heightAt(x, z) the ground's.
export function waterClutter(tx, tz, cellAt, heightAt) {
  const out = [];
  const n = TILE_FT / CELL_FT;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cell = cellAt(i, j);
      if (!cell.water) continue;
      const places = placeOf(cell.height, cell.slope, cell.water);
      if (!places.size) continue;
      const [gi, gj] = [tx * n + i, tz * n + j];
      RULES.forEach((rule, r) => {
        if (!places.has(rule.at) || (rule.biomes && !rule.biomes.includes(BIOME_NAMES[cell.biome]))) return;
        let per = rule.per;
        if (rule.patches) {
          const p = fbm(gi * CELL_FT, gj * CELL_FT, SEED ^ Math.imul(r + 1, 0x632be5ab), { wavelength: PATCH_FT, octaves: 2 });
          per *= Math.max(0, Math.min(1, (p - (0.5 - rule.patches)) * 8));
        }
        const roll = (m, q) => hash2(gi, gj, SEED ^ Math.imul(r * 1024 + m * 32 + q + 1, 0x2545f491));
        const count = Math.floor(per) + (roll(0, 0) < per % 1 ? 1 : 0);
        const spec = CLUTTER[rule.kind];
        for (let m = 0; m < count; m++) {
          const [x, z] = [(gi + roll(m, 1)) * CELL_FT, (gj + roll(m, 2)) * CELL_FT];
          const floats = rule.kind === "lily";
          out.push({
            kind: rule.kind,
            x,
            z,
            y: floats ? cell.water.level : heightAt(x, z),
            yaw: roll(m, 3) * Math.PI * 2,
            scale: spec.size[0] + (spec.size[1] - spec.size[0]) * roll(m, 4),
            normal: [0, 1, 0],
            colors: spec.parts.map((part, p) => (part.chance !== undefined && roll(m, 5 + p * 4) >= part.chance ? null : colorIn(part.colors, (s) => roll(m, 6 + p * 4 + s)))),
          });
        }
      });
    }
  }
  return out;
}
