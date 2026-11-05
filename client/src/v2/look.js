import { fbm, hash2 } from "../world/noise.js";
import { COURSE_TYPES } from "./courses.js";
import { WATER_TYPES } from "./water.js";

// What the ground looks like, worked out where it's drawn from its biome (biomes.js) and its shape,
// never stored: its color and the pattern drawn over it up close (render/groundMaterial.js). Ground
// is one of these classes, by its slope and height and the water (water.js) on or near it:
// - bed: under water, its look by the water's type (BEDS);
// - steep: steeper than STEEP_DEG, too steep to walk;
// - bank: near running water (a course's), lower than SHORE_FT over it;
// - shore: near other water, lower than SHORE_FT over it;
// - slope: steeper than SLOPE_DEG;
// - flat: the rest.
// Each biome gives each class two looks, the second in patches covering about `patches` of it,
// where noise is highest, and every look's color varies a little in noise. Banks and shores are
// darker, wet, just over the water.

export const STEEP_DEG = 50;
const SLOPE_DEG = 22;
const SHORE_FT = 3;
const WET_FT = 1; // how far over the water banks and shores look wet
const WET_DARK = 0.7; // how dark, at the water, as a share of their color
const PATCH_FT = 90; // how wide patches are
const VARY = 0.08; // how far colors vary, up or down
const VARY_FT = 40;
const SEED = 0x6c6f6f6b;

// A look's pattern and color, sRGB bytes.
const LOOKS = {
  grass: ["grass", [111, 154, 62]],
  meadow: ["grass", [136, 160, 70]],
  dirt: ["dirt", [138, 115, 80]],
  sand: ["sand", [200, 180, 128]],
  rock: ["rock", [138, 133, 128]],
  gravel: ["rock", [158, 150, 138]],
  scree: ["dirt", [128, 120, 108]],
  mud: ["mud", [94, 82, 56]],
  silt: ["mud", [124, 112, 86]],
  moss: ["moss", [95, 122, 58]],
  litter: ["litter", [107, 90, 58]],
  fallenGold: ["litter", [152, 106, 50]],
  rustGrass: ["grass", [158, 134, 62]],
  deepLitter: ["litter", [78, 84, 46]],
  deepMoss: ["moss", [70, 102, 50]],
  needles: ["litter", [96, 74, 52]],
  coolMoss: ["moss", [84, 96, 62]],
  softGrass: ["grass", [140, 176, 86]],
  fallenPink: ["grass", [204, 164, 174]],
  jadeMoss: ["moss", [104, 136, 72]],
  heather: ["grass", [112, 90, 102]],
  peat: ["mud", [70, 58, 44]],
  moorGrass: ["grass", [120, 130, 72]],
  grayStone: ["rock", [120, 120, 118]],
  straw: ["grass", [178, 158, 84]],
  baked: ["dirt", [166, 126, 80]],
  redRock: ["rock", [176, 92, 56]],
  redDirt: ["dirt", [170, 102, 62]],
  redSand: ["sand", [196, 130, 86]],
  paleSand: ["sand", [232, 214, 170]],
  duneSand: ["sand", [214, 178, 118]],
  sandstone: ["rock", [190, 150, 100]],
  salt: ["cracked", [232, 228, 216]],
  grayCrust: ["cracked", [205, 200, 190]],
  jungleFloor: ["litter", [70, 86, 42]],
  jungleMoss: ["moss", [76, 120, 52]],
  jungleMud: ["mud", [90, 76, 46]],
  brightGrass: ["grass", [120, 180, 72]],
  snow: ["snow", [235, 240, 245]],
  blueSnow: ["snow", [210, 222, 235]],
  deadTurf: ["grass", [140, 134, 92]],
  ice: ["ice", [186, 220, 238]],
  deepIce: ["ice", [130, 186, 220]],
  blackMud: ["mud", [72, 62, 44]],
  tealMoss: ["moss", [60, 86, 90]],
  tealMud: ["mud", [50, 66, 70]],
  glowMoss: ["moss", [50, 130, 124]],
  grimLitter: ["litter", [62, 62, 58]],
  grimMoss: ["moss", [60, 72, 58]],
  blackRock: ["rock", [70, 68, 68]],
  sickDirt: ["dirt", [120, 112, 62]],
  sickMud: ["mud", [100, 100, 50]],
  sickGrass: ["grass", [130, 130, 62]],
  ash: ["ash", [72, 70, 70]],
  cinder: ["ash", [48, 46, 48]],
  basalt: ["rock", [50, 46, 46]],
  scorched: ["dirt", [86, 60, 48]],
  redCrust: ["cracked", [120, 60, 56]],
  venomDirt: ["dirt", [96, 114, 52]],
  wineRock: ["rock", [110, 56, 60]],
  silverGrass: ["grass", [126, 150, 166]],
  duskMoss: ["moss", [90, 100, 140]],
  duskLitter: ["litter", [90, 90, 130]],
  lilacDirt: ["dirt", [120, 106, 150]],
  lilacRock: ["rock", [136, 116, 176]],
};

// Each biome's classes: [look, patch look, how much is patches], in BIOME_NAMES' order.
const BIOMES = [
  // plains
  { flat: ["grass", "meadow", 0.3], slope: ["grass", "dirt", 0.45], steep: ["rock", "rock", 0], shore: ["sand", "sand", 0], bank: ["dirt", "gravel", 0.4] },
  // forest
  { flat: ["litter", "moss", 0.4], slope: ["dirt", "litter", 0.35], steep: ["rock", "rock", 0], shore: ["sand", "dirt", 0.2], bank: ["dirt", "moss", 0.3] },
  // rocky
  { flat: ["scree", "gravel", 0.45], slope: ["rock", "scree", 0.25], steep: ["rock", "rock", 0], shore: ["gravel", "rock", 0.3], bank: ["gravel", "rock", 0.35] },
  // swamp
  { flat: ["mud", "moss", 0.45], slope: ["mud", "grass", 0.4], steep: ["rock", "rock", 0], shore: ["mud", "mud", 0], bank: ["mud", "moss", 0.3] },
  // autumn forest
  { flat: ["fallenGold", "rustGrass", 0.35], slope: ["dirt", "fallenGold", 0.4], steep: ["rock", "rock", 0], shore: ["sand", "dirt", 0.2], bank: ["dirt", "fallenGold", 0.3] },
  // giant woods
  { flat: ["deepLitter", "deepMoss", 0.45], slope: ["dirt", "deepLitter", 0.4], steep: ["grayStone", "rock", 0.3], shore: ["silt", "dirt", 0.3], bank: ["dirt", "deepMoss", 0.4] },
  // taiga
  { flat: ["needles", "coolMoss", 0.35], slope: ["dirt", "needles", 0.4], steep: ["grayStone", "rock", 0.3], shore: ["gravel", "dirt", 0.3], bank: ["gravel", "coolMoss", 0.3] },
  // blossom valley
  { flat: ["softGrass", "fallenPink", 0.3], slope: ["softGrass", "dirt", 0.3], steep: ["rock", "rock", 0], shore: ["sand", "softGrass", 0.2], bank: ["softGrass", "gravel", 0.35] },
  // bamboo grove
  { flat: ["jadeMoss", "litter", 0.35], slope: ["jadeMoss", "dirt", 0.35], steep: ["grayStone", "rock", 0.25], shore: ["silt", "jadeMoss", 0.3], bank: ["jadeMoss", "gravel", 0.3] },
  // snowy forest
  { flat: ["snow", "blueSnow", 0.3], slope: ["snow", "needles", 0.15], steep: ["grayStone", "blueSnow", 0.15], shore: ["snow", "gravel", 0.3], bank: ["snow", "gravel", 0.4] },
  // highlands
  { flat: ["moorGrass", "heather", 0.45], slope: ["moorGrass", "peat", 0.3], steep: ["grayStone", "rock", 0.4], shore: ["peat", "gravel", 0.4], bank: ["peat", "gravel", 0.5] },
  // savanna
  { flat: ["straw", "baked", 0.3], slope: ["baked", "straw", 0.4], steep: ["sandstone", "rock", 0.3], shore: ["baked", "sand", 0.3], bank: ["baked", "gravel", 0.3] },
  // red canyon
  { flat: ["redDirt", "redSand", 0.4], slope: ["redDirt", "redRock", 0.3], steep: ["redRock", "sandstone", 0.2], shore: ["redSand", "redDirt", 0.3], bank: ["redSand", "gravel", 0.3] },
  // sand desert
  { flat: ["duneSand", "paleSand", 0.3], slope: ["duneSand", "sandstone", 0.15], steep: ["sandstone", "sandstone", 0], shore: ["paleSand", "duneSand", 0.3], bank: ["paleSand", "gravel", 0.3] },
  // salt flats
  { flat: ["salt", "grayCrust", 0.35], slope: ["grayCrust", "baked", 0.3], steep: ["sandstone", "grayStone", 0.3], shore: ["salt", "silt", 0.25], bank: ["grayCrust", "gravel", 0.3] },
  // jungle
  { flat: ["jungleFloor", "jungleMoss", 0.45], slope: ["jungleMud", "jungleFloor", 0.4], steep: ["rock", "jungleMoss", 0.25], shore: ["jungleMud", "sand", 0.25], bank: ["jungleMud", "jungleMoss", 0.35] },
  // primeval valley
  { flat: ["brightGrass", "jungleMoss", 0.4], slope: ["jungleMoss", "jungleMud", 0.35], steep: ["redRock", "rock", 0.4], shore: ["jungleMud", "sand", 0.3], bank: ["jungleMud", "gravel", 0.3] },
  // tropical coast
  { flat: ["brightGrass", "paleSand", 0.35], slope: ["brightGrass", "sand", 0.3], steep: ["sandstone", "rock", 0.3], shore: ["paleSand", "paleSand", 0], bank: ["paleSand", "gravel", 0.3] },
  // sandy beach
  { flat: ["paleSand", "sand", 0.3], slope: ["sand", "paleSand", 0.3], steep: ["sandstone", "rock", 0.3], shore: ["paleSand", "sand", 0.2], bank: ["sand", "gravel", 0.3] },
  // snowfield
  { flat: ["snow", "blueSnow", 0.25], slope: ["snow", "blueSnow", 0.35], steep: ["grayStone", "blueSnow", 0.25], shore: ["blueSnow", "snow", 0.3], bank: ["blueSnow", "gravel", 0.3] },
  // frozen tundra
  { flat: ["deadTurf", "snow", 0.45], slope: ["deadTurf", "scree", 0.35], steep: ["grayStone", "rock", 0.3], shore: ["gravel", "snow", 0.4], bank: ["gravel", "deadTurf", 0.3] },
  // glacier
  { flat: ["snow", "ice", 0.45], slope: ["ice", "blueSnow", 0.35], steep: ["deepIce", "ice", 0.3], shore: ["ice", "snow", 0.3], bank: ["ice", "gravel", 0.2] },
  // mangrove
  { flat: ["blackMud", "jungleMoss", 0.3], slope: ["blackMud", "jungleFloor", 0.35], steep: ["rock", "blackMud", 0.25], shore: ["blackMud", "blackMud", 0], bank: ["blackMud", "silt", 0.3] },
  // fungal marsh
  { flat: ["tealMoss", "glowMoss", 0.2], slope: ["tealMud", "tealMoss", 0.4], steep: ["blackRock", "tealMoss", 0.25], shore: ["tealMud", "tealMud", 0], bank: ["tealMud", "glowMoss", 0.2] },
  // haunted woods
  { flat: ["grimLitter", "grimMoss", 0.35], slope: ["grimLitter", "scree", 0.25], steep: ["blackRock", "rock", 0.3], shore: ["blackMud", "grimLitter", 0.3], bank: ["blackMud", "gravel", 0.2] },
  // plague lands
  { flat: ["sickGrass", "sickDirt", 0.45], slope: ["sickDirt", "sickMud", 0.35], steep: ["grayStone", "sickDirt", 0.2], shore: ["sickMud", "sickMud", 0], bank: ["sickMud", "gravel", 0.2] },
  // volcanic waste
  { flat: ["ash", "cinder", 0.4], slope: ["cinder", "scorched", 0.35], steep: ["basalt", "basalt", 0], shore: ["cinder", "basalt", 0.3], bank: ["cinder", "basalt", 0.3] },
  // corrupted waste
  { flat: ["redCrust", "venomDirt", 0.25], slope: ["redCrust", "scorched", 0.35], steep: ["wineRock", "blackRock", 0.25], shore: ["scorched", "venomDirt", 0.25], bank: ["scorched", "venomDirt", 0.25] },
  // enchanted glade
  { flat: ["silverGrass", "duskMoss", 0.35], slope: ["silverGrass", "duskLitter", 0.3], steep: ["grayStone", "duskMoss", 0.25], shore: ["duskMoss", "sand", 0.2], bank: ["duskMoss", "gravel", 0.3] },
  // crystal forest
  { flat: ["lilacDirt", "duskLitter", 0.35], slope: ["lilacDirt", "lilacRock", 0.3], steep: ["lilacRock", "rock", 0.25], shore: ["lilacDirt", "gravel", 0.3], bank: ["lilacDirt", "lilacRock", 0.3] },
];

// The bed under each of WATER_TYPES, as biomes' classes are.
const BEDS = { sea: ["sand", "sand", 0], lake: ["silt", "mud", 0.25], pond: ["silt", "mud", 0.3], swamp: ["mud", "mud", 0], river: ["gravel", "sand", 0.3], stream: ["gravel", "scree", 0.35] };
const BED = WATER_TYPES.map((type) => BEDS[type]);
// Which of WATER_TYPES run.
export const RUNNING = WATER_TYPES.map((type) => COURSE_TYPES.includes(type));

// The patterns looks use, in the order kinds() gives them.
export const PATTERNS = [...new Set(Object.values(LOOKS).map(([pattern]) => pattern))];
const PATTERN = Object.fromEntries(Object.entries(LOOKS).map(([name, [pattern]]) => [name, PATTERNS.indexOf(pattern)]));

// Patch noise, sampled, lowest first, so past(share) is the value `share` of it is higher than.
const SAMPLES = Float32Array.from({ length: 4096 }, (_, k) => fbm((k % 64) * 61.3, Math.floor(k / 64) * 57.7, SEED, { wavelength: PATCH_FT })).sort();
const past = (share) => SAMPLES[Math.min(SAMPLES.length - 1, Math.floor((1 - share) * SAMPLES.length))];

// The ground's class, by its slope (degrees) and height (ft), and `water`: null where there's none
// near, else { wet, whether it's under water, level, the water's there or the highest near, type,
// an index into WATER_TYPES, where it's wet, and running, whether running water's near }.
export function groundClass(slopeDeg, heightFt, water = null) {
  if (water?.wet) return "bed";
  if (slopeDeg >= STEEP_DEG) return "steep";
  if (water && heightFt < water.level + SHORE_FT) return water.running ? "bank" : "shore";
  return slopeDeg >= SLOPE_DEG ? "slope" : "flat";
}

// The look of ground of biome `biome` (an index into BIOME_NAMES) at (x, z), with `water` as
// groundClass has it: { pattern, an index into PATTERNS, and rgb, sRGB bytes }.
export function look(biome, slopeDeg, heightFt, x, z, water = null) {
  const kind = groundClass(slopeDeg, heightFt, water);
  const [first, patch, share] = kind === "bed" ? (BED[water.type] ?? BEDS.lake) : (BIOMES[biome] ?? BIOMES[0])[kind];
  const name = share && fbm(x, z, SEED, { wavelength: PATCH_FT }) > past(share) ? patch : first;
  let shade = 1 + VARY * fbm(x, z, SEED + 1, { wavelength: VARY_FT }) + 0.5 * VARY * (2 * hash2(Math.floor(x / 4), Math.floor(z / 4), SEED + 2) - 1);
  if (kind === "bank" || kind === "shore") shade *= WET_DARK + (1 - WET_DARK) * Math.min(1, Math.max(0, (heightFt - water.level) / WET_FT));
  const rgb = LOOKS[name][1].map((v) => Math.max(0, Math.min(255, Math.round(v * shade))));
  return { pattern: PATTERN[name], rgb };
}

// How steep a square is, in degrees, from its corners' heights and how wide it is.
export function slopeOf(nw, ne, sw, se, width) {
  const dx = (ne - nw + se - sw) / 2;
  const dz = (sw - nw + se - ne) / 2;
  return (Math.atan(Math.hypot(dx, dz) / width) * 180) / Math.PI;
}

// The look of ground painted by hand with `name` (one of LOOKS, or a pattern) at (x, z), as
// look() gives it, or null for a name with no look.
export function painted(name, x, z) {
  const found = LOOKS[name] ?? Object.values(LOOKS).find(([pattern]) => pattern === name);
  if (!found) return null;
  const shade = 1 + VARY * fbm(x, z, SEED + 1, { wavelength: VARY_FT });
  return { pattern: PATTERNS.indexOf(found[0]), rgb: found[1].map((v) => Math.max(0, Math.min(255, Math.round(v * shade)))) };
}
