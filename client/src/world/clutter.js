// Ground clutter (plans/design.md, "Ground clutter"): small walk-through plants and stones. Nothing
// is stored: each cell's clutter comes from the tile's layers and a hash of the cell, so it's the
// same every time and the game client can work it out too. Anything that blocks movement is an
// object, not clutter.
//
// A kind is one or more parts, each a simple shape (drawn by the 3D view) with a range of colors.
// Every instance gets its own size, turn and colors from those ranges. Rules say which kinds grow
// where, by biome and by the cell's ground and water.
//
// Positions are feet in continent space.

import { TILE_FT } from "./constants.js";
import { fbm, hash2 } from "./noise.js";
import { slabSpanAt } from "./slabs.js";
import { parseTree } from "./trees.js";

// Color ranges are [[h0, h1], [s0, s1], [l0, l1]] in HSL, 0-1. A part with several picks one.
const GREEN = [[0.2, 0.27], [0.35, 0.55], [0.28, 0.4]];
const DARK_GREEN = [[0.25, 0.33], [0.35, 0.5], [0.18, 0.28]];
const STRAW = [[0.1, 0.14], [0.3, 0.45], [0.5, 0.62]];
const GREY = [[0.08, 0.12], [0.03, 0.1], [0.38, 0.55]];
const BROWN = [[0.06, 0.1], [0.3, 0.5], [0.2, 0.32]];
const PALE = [[0.1, 0.14], [0.15, 0.3], [0.75, 0.88]];
const CAVE_ROCK = [[0.07, 0.11], [0.05, 0.12], [0.3, 0.45]];

// size: [min, max] in feet, the kind's overall height (or width, for flat kinds; frond length,
// for ferns, which stand about 0.6 of that). lie: lies along
// the ground's slope instead of standing upright. A part's chance is the share of instances that
// have it.
export const CLUTTER = {
  grass: { size: [0.8, 1.6], parts: [{ shape: "tuft", colors: [GREEN] }] },
  shadeGrass: { size: [0.6, 1.2], parts: [{ shape: "tuft", colors: [DARK_GREEN] }] },
  dryGrass: { size: [0.6, 1.3], parts: [{ shape: "tuft", colors: [STRAW] }] },
  flowers: {
    size: [0.6, 1.1],
    parts: [
      { shape: "stems", colors: [GREEN] },
      { shape: "blooms", colors: [[[0, 1], [0, 0.05], [0.9, 0.97]], [[0.13, 0.16], [0.8, 0.95], [0.55, 0.65]], [[0.74, 0.8], [0.45, 0.6], [0.55, 0.68]]] },
    ],
  },
  pebble: { size: [0.2, 0.5], parts: [{ shape: "pebble", colors: [GREY, BROWN] }] },
  stone: { size: [0.33, 1], parts: [{ shape: "stone", colors: [GREY] }] },
  bush: { size: [1.5, 2.8], parts: [{ shape: "bush", colors: [DARK_GREEN] }] },
  fern: { size: [1.5, 3.5], parts: [{ shape: "fern", colors: [[[0.26, 0.32], [0.4, 0.6], [0.22, 0.32]]] }] },
  swampFern: { size: [3, 6.5], parts: [{ shape: "fern", colors: [[[0.22, 0.3], [0.3, 0.5], [0.28, 0.38]]] }] },
  mushrooms: {
    size: [0.3, 0.7],
    parts: [
      { shape: "stalks", colors: [PALE] },
      { shape: "caps", colors: [[[0.07, 0.1], [0.35, 0.5], [0.45, 0.6]], [[0, 0.02], [0.6, 0.75], [0.4, 0.5]], [[0.1, 0.13], [0.1, 0.2], [0.85, 0.92]]] },
    ],
  },
  paleMushrooms: { size: [0.3, 0.6], parts: [{ shape: "stalks", colors: [PALE] }, { shape: "caps", colors: [PALE] }] },
  litter: { size: [1.5, 3], lie: true, parts: [{ shape: "patch", colors: [[[0.05, 0.1], [0.45, 0.65], [0.25, 0.4]]] }] },
  twig: { size: [1, 2.2], parts: [{ shape: "twig", colors: [BROWN] }] },
  // Round cave mouths (create/mouthClutter.js): rock jutting from the hill face and the mouth's
  // walls, and vines, in loops hanging from the mouth's roof or strands hanging down it.
  crag: { size: [0.8, 2.6], parts: [{ shape: "crag", colors: [GREY, CAVE_ROCK] }] },
  vineLoop: { size: [3, 7], parts: [{ shape: "vineLoop", colors: [DARK_GREEN, GREEN] }] },
  vine: { size: [4, 11], parts: [{ shape: "vine", colors: [DARK_GREEN, GREEN] }] },
  thistle: {
    size: [1.2, 2],
    parts: [
      { shape: "thistle", colors: [[[0.22, 0.3], [0.1, 0.2], [0.4, 0.5]]] },
      { shape: "thistleDots", colors: [[[0.78, 0.83], [0.5, 0.7], [0.45, 0.6]]] },
    ],
  },
  reeds: {
    size: [3, 5.5],
    parts: [
      { shape: "reeds", colors: [[[0.18, 0.25], [0.3, 0.45], [0.3, 0.42]]] },
      { shape: "cattails", chance: 0.5, colors: [[[0.06, 0.08], [0.45, 0.6], [0.2, 0.28]]] },
    ],
  },
  lily: {
    size: [1.2, 2.2],
    parts: [
      { shape: "lily", colors: [[[0.25, 0.32], [0.4, 0.55], [0.28, 0.38]]] },
      { shape: "lilyFlower", chance: 0.15, colors: [[[0, 1], [0, 0.05], [0.92, 0.97]], [[0.95, 1], [0.4, 0.6], [0.8, 0.88]]] },
    ],
  },
  shell: { size: [0.25, 0.5], parts: [{ shape: "shell", colors: [PALE, [[0.03, 0.08], [0.3, 0.5], [0.7, 0.8]]] }] },
  driftwood: { size: [2, 4.5], parts: [{ shape: "log", colors: [[[0.08, 0.12], [0.1, 0.2], [0.55, 0.68]]] }] },
  lichen: { size: [0.8, 2], lie: true, parts: [{ shape: "patch", colors: [[[0.15, 0.22], [0.25, 0.45], [0.5, 0.65]], [[0.1, 0.13], [0.4, 0.6], [0.5, 0.6]]] }] },
  seaweed: { size: [2.5, 6], parts: [{ shape: "weed", colors: [[[0.12, 0.18], [0.4, 0.6], [0.2, 0.3]]] }] },
  waterweed: { size: [1, 2.5], parts: [{ shape: "weed", colors: [[[0.24, 0.32], [0.45, 0.65], [0.25, 0.35]]] }] },
};

// Where clutter grows: `at` names a kind of cell (see placeOf), `per` is the expected count per
// cell, `biomes` limits a rule to those biomes, and `patches` gathers it into patches covering
// about that share of the ground (`per` is then the count inside a patch).
const RULES = [
  { kind: "grass", at: "ground", biomes: ["plains"], per: 3 },
  { kind: "flowers", at: "ground", biomes: ["plains"], per: 0.8, patches: 0.25 },
  { kind: "pebble", at: "ground", biomes: ["plains"], per: 0.12 },
  { kind: "bush", at: "ground", biomes: ["plains"], per: 0.02 },

  { kind: "fern", at: "ground", biomes: ["forest"], per: 0.6, patches: 0.5 },
  { kind: "shadeGrass", at: "ground", biomes: ["forest"], per: 1 },
  { kind: "mushrooms", at: "ground", biomes: ["forest"], per: 0.04 },
  { kind: "litter", at: "ground", biomes: ["forest"], per: 0.5, patches: 0.4 },
  { kind: "twig", at: "ground", biomes: ["forest"], per: 0.15 },

  { kind: "pebble", at: "ground", biomes: ["rocky"], per: 1.2 },
  { kind: "pebble", at: "flatRock", per: 1.5 },
  { kind: "stone", at: "ground", biomes: ["rocky"], per: 0.3 },
  { kind: "stone", at: "flatRock", per: 0.4 },
  { kind: "dryGrass", at: "ground", biomes: ["rocky"], per: 0.6 },
  { kind: "thistle", at: "ground", biomes: ["rocky"], per: 0.05 },

  { kind: "swampFern", at: "ground", biomes: ["swamp"], per: 0.5, patches: 0.5 },
  { kind: "paleMushrooms", at: "ground", biomes: ["swamp"], per: 0.08 },
  { kind: "shadeGrass", at: "ground", biomes: ["swamp"], per: 0.8 },

  { kind: "lichen", at: "rockFace", per: 0.8 },
  { kind: "shell", at: "sand", per: 0.06 },
  { kind: "driftwood", at: "sand", per: 0.008 },
  { kind: "pebble", at: "shore", per: 0.5 },
  { kind: "reeds", at: "freshBank", per: 1.5 },
  { kind: "reeds", at: "freshShallows", per: 1.2 },
  { kind: "lily", at: "pond", biomes: ["swamp"], per: 0.5, patches: 0.5 },
  { kind: "lily", at: "pond", per: 0.12, patches: 0.3 },
  { kind: "waterweed", at: "freshBed", per: 0.8, patches: 0.4 },
  { kind: "seaweed", at: "seaBed", per: 0.6, patches: 0.35 },
];

const GROUND = new Set(["grass", "dirt", "moss", "mud"]);
const STEEP = 0.7; // rise over run where rock counts as a face
const PATCH_FT = 60;

// One tile's clutter: [{ kind, x, z, y, yaw, scale, normal, colors: [[r, g, b] per part, or null
// where the part is left out] }], colors 0-1. tileAt(tx, tz) finds loaded tiles, for heights at the
// tile's edge and the slabs (slabs.js) around it: none grows where a slab's within its height over
// it. density scales every count (graphics tiers).
export function clutterForTile(tile, tileAt, { density = 1 } = {}) {
  const [tx, tz] = tile.coords;
  const n = tile.cells;
  const ft = tile.cellFt;
  const { height, water } = tile.layers;
  const seed = tile.generator?.seed ?? 0;
  const biomes = tile.palettes.biome ?? [];
  const waterKinds = tile.palettes.water;
  const kindAt = (k) => (Number.isNaN(water[k]) ? null : waterKinds && tile.layers.waterKind ? waterKinds[tile.layers.waterKind[k]] : water[k] === 0 ? "sea" : "fresh");
  const h = (i, j) => height[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const out = [];
  // Slabs reach from their own tiles into the ones beside them.
  const slabs = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) slabs.push(...((dx || dz ? tileAt(tx + dx, tz + dz) : tile)?.slabs ?? []));
  const covered = (x, z, y, tall) =>
    slabs.some((slab) => {
      const span = slabSpanAt(slab, x, z);
      return span && span[1] >= y && span[0] <= y + tall;
    });

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const gi = tx * n + i;
      const gj = tz * n + j;
      const terrain = tile.palettes.terrain[tile.layers.terrain[k]];
      if (parseTree(terrain)) continue;
      const gx = (h(i + 1, j) - h(i - 1, j)) / (2 * ft);
      const gz = (h(i, j + 1) - h(i, j - 1)) / (2 * ft);
      const places = placeOf({
        terrain,
        water: kindAt(k),
        depth: water[k] - height[k],
        slope: Math.hypot(gx, gz),
        freshNear: [k - 1, k + 1, k - n, k + n].some((q) => q >= 0 && q < n * n && kindAt(q) === "fresh"),
      });
      if (!places.size) continue;
      const biome = biomes[tile.layers.biome[k]];
      const amount = density * (tile.layers.clutter ? tile.layers.clutter[k] / 100 : 1);
      const normal = normalize([-gx, 1, -gz]);

      RULES.forEach((rule, r) => {
        if (!places.has(rule.at) || (rule.biomes && !rule.biomes.includes(biome))) return;
        let per = rule.per * amount;
        if (rule.patches) {
          const p = fbm(gi * ft, gj * ft, seed ^ Math.imul(r + 1, 0x632be5ab), { wavelength: PATCH_FT, octaves: 2 });
          per *= smooth((p - (0.5 - rule.patches)) * 8);
        }
        const roll = (m, q) => hash2(gi, gj, seed ^ Math.imul(r * 1024 + m * 32 + q + 1, 0x2545f491));
        const count = Math.floor(per) + (roll(0, 0) < per % 1 ? 1 : 0);
        for (let m = 0; m < count; m++) {
          const x = (gi + roll(m, 1)) * ft;
          const z = (gj + roll(m, 2)) * ft;
          const spec = CLUTTER[rule.kind];
          const onWater = rule.at === "pond";
          const underwater = rule.at === "seaBed" || rule.at === "freshBed";
          const size = spec.size[0] + (spec.size[1] - spec.size[0]) * roll(m, 4);
          const y = onWater ? water[k] : (meshHeightAt(tileAt, x, z) ?? height[k]);
          if (slabs.length && covered(x, z, y, size)) continue;
          out.push({
            kind: rule.kind,
            x,
            z,
            y,
            yaw: roll(m, 3) * Math.PI * 2,
            scale: underwater ? Math.min(size, (water[k] - height[k]) * 0.85) : size,
            normal: spec.lie && !onWater ? normal : [0, 1, 0],
            colors: spec.parts.map((part, p) => (part.chance !== undefined && roll(m, 5 + p * 4) >= part.chance ? null : colorIn(part.colors, (s) => roll(m, 6 + p * 4 + s)))),
          });
        }
      });
    }
  }
  return out;
}

// The kinds of place a cell is, for rules' `at`.
function placeOf({ terrain, water, depth, slope, freshNear }) {
  const places = new Set();
  if (water === "sea") {
    if (depth > 2 && depth < 40) places.add("seaBed");
  } else if (water === "fresh") {
    if (depth < 2.5) places.add("freshShallows");
    if (depth > 0.5 && depth < 6) places.add("pond");
    if (depth > 1.5) places.add("freshBed");
  } else {
    if (GROUND.has(terrain)) places.add("ground");
    if (terrain === "sand") places.add("sand");
    if (terrain === "shore") places.add("shore");
    if (terrain === "rock") places.add(slope > STEEP ? "rockFace" : "flatRock");
    if (freshNear && terrain !== "rock" && terrain !== "path") places.add("freshBank");
  }
  return places;
}

// The ground's height at (x, z) as the 3D view's terrain mesh draws it: triangles between cell
// centers, split the same way. Null where no tile is loaded. tileAt(tx, tz) -> decoded tile.
export function meshHeightAt(tileAt, x, z) {
  const any = tileAt(Math.floor(x / TILE_FT), Math.floor(z / TILE_FT));
  if (!any) return null;
  const ft = any.cellFt;
  const n = any.cells;
  const u = x / ft - 0.5;
  const v = z / ft - 0.5;
  const ci = Math.floor(u);
  const cj = Math.floor(v);
  const at = (gi, gj) => {
    const t = tileAt(Math.floor(gi / n), Math.floor(gj / n)) ?? any;
    const [tx, tz] = t.coords;
    const i = Math.min(n - 1, Math.max(0, gi - tx * n));
    const j = Math.min(n - 1, Math.max(0, gj - tz * n));
    return t.layers.height[j * n + i];
  };
  const fu = u - ci;
  const fv = v - cj;
  const h0 = at(ci, cj);
  const h1 = at(ci + 1, cj);
  const h2 = at(ci, cj + 1);
  const h3 = at(ci + 1, cj + 1);
  // Each square is split along the diagonal from (1, 0) to (0, 1).
  if (fu + fv <= 1) return h0 + (h1 - h0) * fu + (h2 - h0) * fv;
  return h3 + (h2 - h3) * (1 - fu) + (h1 - h3) * (1 - fv);
}

export function colorIn(choices, roll) {
  const [hue, sat, light] = choices[Math.min(choices.length - 1, Math.floor(roll(0) * choices.length))];
  const lerp = ([a, b], t) => a + (b - a) * t;
  return hslToRgb(lerp(hue, roll(1)), lerp(sat, roll(2)), lerp(light, roll(3)));
}

function hslToRgb(hue, s, l) {
  const f = (m) => {
    const k = (m + hue * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function normalize([x, y, z]) {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

function smooth(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
