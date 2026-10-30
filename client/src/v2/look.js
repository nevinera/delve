import { fbm, hash2 } from "../world/noise.js";
import { SEA_LEVEL_FT } from "./sizes.js";

// What the ground looks like, worked out where it's drawn from its biome (biomes.js) and its shape,
// never stored: its color and the pattern drawn over it up close (editor/groundMaterial.js). Ground
// is one of these classes, by its slope and height:
// - shore: lower than SHORE_FT over sea level, the beach, and the sea floor under the water;
// - steep: steeper than STEEP_DEG, too steep to walk;
// - slope: steeper than SLOPE_DEG;
// - flat: the rest.
// Each biome gives each class two looks, the second in patches covering about `patches` of it,
// where noise is highest, and every look's color varies a little in noise.

export const STEEP_DEG = 50;
const SLOPE_DEG = 22;
const SHORE_FT = 3;
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
  moss: ["moss", [95, 122, 58]],
  litter: ["litter", [107, 90, 58]],
};

// Each biome's classes: [look, patch look, how much is patches], in BIOME_NAMES' order.
const BIOMES = [
  // plains
  { flat: ["grass", "meadow", 0.3], slope: ["grass", "dirt", 0.45], steep: ["rock", "rock", 0], shore: ["sand", "sand", 0] },
  // forest
  { flat: ["litter", "moss", 0.4], slope: ["dirt", "litter", 0.35], steep: ["rock", "rock", 0], shore: ["sand", "dirt", 0.2] },
  // rocky
  { flat: ["scree", "gravel", 0.45], slope: ["rock", "scree", 0.25], steep: ["rock", "rock", 0], shore: ["gravel", "rock", 0.3] },
  // swamp
  { flat: ["mud", "moss", 0.45], slope: ["mud", "grass", 0.4], steep: ["rock", "rock", 0], shore: ["mud", "mud", 0] },
];

// The patterns looks use, in the order kinds() gives them.
export const PATTERNS = [...new Set(Object.values(LOOKS).map(([pattern]) => pattern))];
const PATTERN = Object.fromEntries(Object.entries(LOOKS).map(([name, [pattern]]) => [name, PATTERNS.indexOf(pattern)]));

// Patch noise, sampled, lowest first, so past(share) is the value `share` of it is higher than.
const SAMPLES = Float32Array.from({ length: 4096 }, (_, k) => fbm((k % 64) * 61.3, Math.floor(k / 64) * 57.7, SEED, { wavelength: PATCH_FT })).sort();
const past = (share) => SAMPLES[Math.min(SAMPLES.length - 1, Math.floor((1 - share) * SAMPLES.length))];

// The ground's class, by its slope (degrees) and height (ft).
export function groundClass(slopeDeg, heightFt) {
  if (heightFt < SEA_LEVEL_FT + SHORE_FT) return "shore";
  if (slopeDeg >= STEEP_DEG) return "steep";
  return slopeDeg >= SLOPE_DEG ? "slope" : "flat";
}

// The look of ground of biome `biome` (an index into BIOME_NAMES) at (x, z): { pattern, an index
// into PATTERNS, and rgb, sRGB bytes }.
export function look(biome, slopeDeg, heightFt, x, z) {
  const [first, patch, share] = (BIOMES[biome] ?? BIOMES[0])[groundClass(slopeDeg, heightFt)];
  const name = share && fbm(x, z, SEED, { wavelength: PATCH_FT }) > past(share) ? patch : first;
  const shade = 1 + VARY * (2 * fbm(x, z, SEED + 1, { wavelength: VARY_FT }) - 1) + 0.5 * VARY * (2 * hash2(Math.floor(x / 4), Math.floor(z / 4), SEED + 2) - 1);
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
  const shade = 1 + VARY * (2 * fbm(x, z, SEED + 1, { wavelength: VARY_FT }) - 1);
  return { pattern: PATTERNS.indexOf(found[0]), rgb: found[1].map((v) => Math.max(0, Math.min(255, Math.round(v * shade)))) };
}
