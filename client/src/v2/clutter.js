import { CLUTTER, colorIn } from "../world/clutter.js";
import { fbm, hash2 } from "../world/noise.js";
import { BIOME_NAMES } from "./biomes.js";
import { STEEP_DEG } from "./look.js";
import { CELL_FT, TILE_FT } from "./sizes.js";
import { WATER_TYPES } from "./water.js";

// Clutter by the water (reeds, pebbles, stones, lilies and water weed) and on dry ground, by biome,
// as world/clutter.js's kinds, worked out where it's drawn for each cell of a tile from its ground
// and water, never stored, so it's the same every time. Each rule puts `per` of a kind in each cell
// of a kind of place (placeOf), gathered into patches covering about `patches` of it where it says,
// in `biomes` where it says.

const RULES = [
  { kind: "reeds", at: "stillEdge", per: 1.4, patches: 0.6, grows: true },
  { kind: "reeds", at: "runningEdge", per: 0.5, patches: 0.35, grows: true },
  { kind: "pebble", at: "bank", per: 1.5 },
  { kind: "stone", at: "bank", per: 0.35 },
  { kind: "pebble", at: "shore", per: 0.4 },
  { kind: "pebble", at: "runningShallows", per: 1 },
  { kind: "stone", at: "runningShallows", per: 0.3 },
  { kind: "lily", at: "stillSurface", per: 0.3, patches: 0.45, grows: true },
  { kind: "lily", at: "stillSurface", biomes: ["swamp"], per: 0.5, patches: 0.5 },
  { kind: "waterweed", at: "stillBed", per: 0.5, patches: 0.4, grows: true },
];
// Where nothing with `grows` grows by the water.
const BARREN = new Set(["snowfield", "frozen tundra", "glacier", "salt flats", "volcanic waste", "corrupted waste", "crystal forest", "snowy forest"]);

// What grows on each biome's dry ground that isn't too steep, [kind, per, patches].
const GROUND = {
  plains: [["grass", 1.5], ["flowers", 0.5, 0.25], ["pebble", 0.1], ["bush", 0.02]],
  forest: [["fern", 0.5, 0.5], ["shadeGrass", 0.8], ["mushrooms", 0.04], ["litter", 0.4, 0.4], ["twig", 0.15]],
  rocky: [["pebble", 0.8], ["stone", 0.25], ["dryGrass", 0.5], ["thistle", 0.05]],
  swamp: [["swampFern", 0.5, 0.5], ["paleMushrooms", 0.08], ["shadeGrass", 0.8]],
  "autumn forest": [["goldLeaves", 1, 0.5], ["goldGrass", 0.7], ["fern", 0.12, 0.3], ["twig", 0.15], ["mushrooms", 0.04]],
  "giant woods": [["bigFern", 0.35, 0.55], ["fern", 0.5, 0.5], ["shadeGrass", 0.5], ["twig", 0.15], ["mushrooms", 0.05]],
  taiga: [["coolGrass", 0.5, 0.5], ["bush", 0.03], ["fern", 0.12, 0.3], ["pebble", 0.15], ["twig", 0.12], ["mushrooms", 0.03]],
  "blossom valley": [["softGrass", 1.6], ["petals", 0.6, 0.45], ["pinkFlowers", 0.4, 0.3], ["pebble", 0.05]],
  "bamboo grove": [["shoots", 0.5, 0.5], ["fern", 0.35, 0.45], ["softGrass", 0.5], ["pebble", 0.08], ["stone", 0.04]],
  "snowy forest": [["snowClump", 0.35, 0.5], ["twig", 0.06], ["snowStone", 0.03], ["frostGrass", 0.06, 0.2]],
  highlands: [["heather", 0.9, 0.55], ["coolGrass", 1], ["bracken", 0.18, 0.3], ["gorse", 0.04, 0.2], ["stone", 0.08], ["pebble", 0.2]],
  savanna: [["dryGrass", 1.6], ["sandGrass", 0.5, 0.5], ["scrub", 0.03], ["pebble", 0.08]],
  "red canyon": [["redStone", 0.25], ["dryGrass", 0.2, 0.3], ["scrub", 0.04], ["pebble", 0.25]],
  "sand desert": [["sandStone", 0.04], ["sandGrass", 0.05, 0.2]],
  "salt flats": [["saltCrust", 0.4, 0.5], ["pebble", 0.03]],
  jungle: [["jungleGrass", 1], ["bigFern", 0.4, 0.55], ["fern", 0.5, 0.5], ["brightFlowers", 0.1, 0.2], ["mushrooms", 0.04]],
  "primeval valley": [["bigFern", 0.5, 0.55], ["brightGrass", 1], ["brightFlowers", 0.2, 0.3], ["stone", 0.05]],
  "tropical coast": [["brightGrass", 0.9, 0.55], ["brightFlowers", 0.08, 0.2], ["shell", 0.04], ["sandGrass", 0.15, 0.3]],
  "sandy beach": [["sandGrass", 0.15, 0.3], ["shell", 0.2], ["driftwood", 0.015], ["pebble", 0.06], ["seaweed", 0.02, 0.2]],
  snowfield: [["snowClump", 0.2, 0.4], ["snowStone", 0.05], ["frostGrass", 0.03, 0.2]],
  "frozen tundra": [["frostGrass", 0.8, 0.55], ["snowClump", 0.3, 0.45], ["lichen", 0.2, 0.3], ["stone", 0.08], ["pebble", 0.2]],
  glacier: [["iceShard", 0.08, 0.3], ["snowClump", 0.1, 0.4]],
  mangrove: [["mudGrass", 0.5, 0.5], ["swampFern", 0.25, 0.45], ["twig", 0.1]],
  "fungal marsh": [["glowGrass", 0.7, 0.55], ["glowCaps", 0.5, 0.5], ["swampFern", 0.15, 0.35]],
  "haunted woods": [["grimGrass", 0.7, 0.55], ["twig", 0.25], ["paleMushrooms", 0.08], ["stone", 0.04]],
  "plague lands": [["sickGrass", 1, 0.55], ["sickCaps", 0.1, 0.3], ["twig", 0.1], ["pebble", 0.1]],
  "volcanic waste": [["ashPatch", 0.25, 0.45], ["cinderStone", 0.3], ["ember", 0.08, 0.25]],
  "corrupted waste": [["thornPlant", 0.12, 0.35], ["wineStone", 0.2], ["sickGrass", 0.15, 0.25]],
  "enchanted glade": [["silverTuft", 1.2], ["glowFlowers", 0.3, 0.35], ["fern", 0.2, 0.35], ["glowCaps", 0.04]],
  "crystal forest": [["lilacTuft", 0.6, 0.5], ["crystalShard", 0.2, 0.35], ["pebble", 0.1]],
};
// What grows or lies on each biome's shores and banks, as well as what RULES say.
const SHORE = {
  forest: [["fern", 0.3, 0.5], ["twig", 0.2]],
  rocky: [["stone", 0.3], ["dryGrass", 0.3, 0.4]],
  swamp: [["swampFern", 0.4, 0.5], ["paleMushrooms", 0.1]],
  "autumn forest": [["goldLeaves", 0.8, 0.5], ["twig", 0.2]],
  "giant woods": [["bigFern", 0.3, 0.5], ["twig", 0.2]],
  taiga: [["coolGrass", 0.6, 0.5], ["stone", 0.1]],
  "blossom valley": [["petals", 0.5, 0.5], ["softGrass", 1]],
  "bamboo grove": [["shoots", 0.5, 0.5], ["fern", 0.3, 0.4]],
  "snowy forest": [["snowClump", 0.5, 0.5], ["snowStone", 0.1]],
  highlands: [["heather", 0.4, 0.5], ["coolGrass", 0.8], ["stone", 0.2]],
  savanna: [["sandGrass", 0.6, 0.5], ["pebble", 0.1]],
  "red canyon": [["redStone", 0.4], ["dryGrass", 0.2, 0.3]],
  "sand desert": [["brightGrass", 0.6, 0.5], ["sandGrass", 0.4, 0.4]],
  "salt flats": [["saltCrust", 0.8, 0.5]],
  jungle: [["bigFern", 0.4, 0.5], ["jungleGrass", 0.8]],
  "primeval valley": [["bigFern", 0.4, 0.5], ["brightFlowers", 0.2, 0.3]],
  "tropical coast": [["shell", 0.3], ["driftwood", 0.02]],
  "sandy beach": [["shell", 0.4], ["driftwood", 0.03], ["seaweed", 0.05, 0.3]],
  snowfield: [["snowStone", 0.2], ["snowClump", 0.2, 0.4]],
  "frozen tundra": [["frostGrass", 0.6, 0.5], ["stone", 0.15]],
  glacier: [["iceShard", 0.4, 0.5]],
  mangrove: [["mudGrass", 0.8, 0.5], ["twig", 0.2]],
  "fungal marsh": [["glowCaps", 0.7, 0.5], ["glowGrass", 0.6]],
  "haunted woods": [["grimGrass", 0.6, 0.5], ["twig", 0.3]],
  "plague lands": [["sickCaps", 0.3, 0.4], ["sickGrass", 0.5]],
  "volcanic waste": [["cinderStone", 0.6], ["ember", 0.2, 0.3]],
  "corrupted waste": [["wineStone", 0.4], ["thornPlant", 0.15, 0.3]],
  "enchanted glade": [["glowFlowers", 0.5, 0.4], ["silverTuft", 0.6]],
  "crystal forest": [["crystalShard", 0.5, 0.4], ["lilacTuft", 0.4]],
};
// Each rule's own `r` picks its rolls, so they stay as others come and go.
const rulesOf = (table, offset) =>
  Object.fromEntries(Object.entries(table).map(([biome, rules]) => [biome, rules.map(([kind, per, patches], k) => ({ kind, per, patches, r: offset + BIOME_NAMES.indexOf(biome) * 16 + k }))]));
const GROUND_RULES = rulesOf(GROUND, 64);
const SHORE_RULES = rulesOf(SHORE, 1024);

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

// Which way is up off the ground at (x, z), for what lies along it.
function groundNormal(heightAt, x, z) {
  const [dx, dz] = [heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)];
  const length = Math.hypot(dx, 2, dz);
  return [-dx / length, 2 / length, -dz / length];
}

// Tile (tx, tz)'s clutter, as world/clutter.js's clutterForTile gives it: [{ kind, x, z, y, yaw,
// scale, normal, colors }]. cellAt(i, j) gives cell (i, j)'s { height, slope, biome, water } (water
// as placeOf has it, or null where there's none near), and heightAt(x, z) the ground's.
export function tileClutter(tx, tz, cellAt, heightAt) {
  const out = [];
  const n = TILE_FT / CELL_FT;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cell = cellAt(i, j);
      const [gi, gj] = [tx * n + i, tz * n + j];
      const biome = BIOME_NAMES[cell.biome];
      const add = (rule, r) => {
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
            normal: spec.lie ? groundNormal(heightAt, x, z) : [0, 1, 0],
            colors: spec.parts.map((part, p) => (part.chance !== undefined && roll(m, 5 + p * 4) >= part.chance ? null : colorIn(part.colors, (s) => roll(m, 6 + p * 4 + s)))),
          });
        }
      };
      if (!cell.water?.wet && cell.slope < STEEP_DEG) GROUND_RULES[biome]?.forEach((rule) => add(rule, rule.r));
      if (!cell.water) continue;
      const places = placeOf(cell.height, cell.slope, cell.water);
      RULES.forEach((rule, r) => {
        if (!places.has(rule.at) || (rule.biomes && !rule.biomes.includes(biome)) || (rule.grows && BARREN.has(biome))) return;
        add(rule, r);
      });
      if (places.has("shore") || places.has("bank")) SHORE_RULES[biome]?.forEach((rule) => add(rule, rule.r));
    }
  }
  return out;
}
