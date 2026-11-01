import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_STYLES, ARMOR_TYPES } from "./armor.js";
import { FLESH_KINDS, HORN_KINDS, MUZZLE_KINDS } from "./body.js";
import { ARM_PAIRS, LOWER_KINDS, TAIL_KINDS, WING_KINDS } from "./extras.js";
import { HELD, OFFHANDS, WEAPON_STYLES, WEAPONS } from "./weapons.js";
import { SHIPPED_BODIES, SHIPPED_LOOKS } from "./bodies.js";

// Character recipes: how a kind of character looks, as plain JSON, so a world can describe its
// enemies' looks and the client builds their models (body.js). A recipe gives each setting either a
// value or a choice: [low, high] picks a number between, and a list of strings picks one of them.
// Each spawn of an enemy resolves its kind's recipe with its own seed, so a band of bandits look
// related without looking alike. A player's appearance is a recipe with every choice made.
//
// Settings:
// - body: the skeleton and body plan: "humanoid" or one of BODY_LOOKS's creatures, whose settings
//   the recipe's own go over. Goblins and trolls are humanoids shaped differently; wolves stand on
//   four legs (quadruped.js), and take only height, build, limbs, head and colors (skin the fur,
//   hair its darker back and tail, eyes).
// - height: in feet, to the top of the head.
// - build: 0 slight to 1 heavy, the thickness of the trunk and limbs.
// - limbs: 0 thin to 1 thick, the limbs on top of build.
// - shoulders, waist, hips, jaw: 0 narrow to 1 broad.
// - arms, legs: 0 short to 1 long, the arms (hands too) and legs, 0.5 as usual.
// - head: 0 small to 1 large, 0.5 as usual.
// - ears: an EARS shape (bear ears are round, on top); nose: a NOSE shape; tusks: a TUSKS size.
// - muzzle: a snout over the nose and mouth (MUZZLE): canine, reptile, bovine, frog, boar, bear,
//   or an insect's mandibles and compound eyes.
// - horns: a HORNS shape (antennae and antlers too); tail: a TAIL shape; wings: bat or feather
//   (WINGS).
// - hands: hands, or a crab's pincers (HANDS).
// - lowerArms: none, or a pair of arms below the first (ARM_PAIRS), which hold nothing.
// - gait: how it stands and moves, normal or shamble (a zombie's).
// - unarmed: how it fights with nothing in hand, punch or claw (tearing with its hands).
// - flesh: living, rotting (mottled and sore), stitched (rotting, sewn together) or bone (a
//   skeleton: thin limbs, ribs, sockets); an element's: stone, fire, water or air; or fur, shell,
//   chitin, wrapped (a mummy's linen), spirit (pale and see-through), shadow (dark and
//   see-through), bark, fungal or molten (dark rock with glowing cracks). Each but living and bone
//   marks every face, clothes too.
// - lower: what stands below the waist: legs, goat's legs on hocks (hocked, in the secondary
//   color), or a horse's body (in the secondary color), a drake's (in the skin), a serpent's tail
//   or a whirl down to a point.
// - bust: 0 to 1.
// - rear: 0 flat to 1 full.
// - hair: a HAIR style (cap is a mushroom's, branches a tree's with leaves in the leaf color, and
//   leaves a crown of them in the hair color); beard: a BEARD style; mouth: a MOUTH style.
// - jewelry: a list of JEWELRY (a crown's gem is the paint color); face: a list of FACE markings
//   and wear.
// - weapon: one of weapons.js's WEAPONS, held in hand.
// - offhand: one of weapons.js's OFFHANDS, a shield, orb or second weapon; none with a
//   two-handed weapon.
// - weaponStyle, offhandStyle: how each is made, one of weapons.js's WEAPON_STYLES.
// - sheathed: true to put the weapon and off-hand item away, at the hips and across the back.
// - armor: { slot: { type, style, colors: [main, trim] } } for armor.js's ARMOR_SLOTS,
//   ARMOR_TYPES and ARMOR_STYLES; type, style and each color can be a list to pick from.
// - loadouts: for a creature, a list of outfits, each spawn wearing one: each has any of weapon,
//   offhand, weaponStyle, offhandStyle, armor and colors, and a `weight` (1 unless given) for how
//   often it's picked. An outfit goes over its body's look, and the recipe's own settings over it.
// - colors: { skin, hair, eyes, primary, secondary, metal, steel, wood, paint, horn }, each "#rrggbb" or
//   a list to pick from. primary is the shirt or tunic, secondary the trousers; boots and belt are
//   darker shades of those. metal is jewelry, fittings and glasses, steel blades, wood hafts and
//   staves, paint warpaint, horn horns, hooves, claws and mandibles, leaf the
//   leaves on branches.

export const HAIR = ["bald", "short", "receding", "spiky", "topknot", "bun", "ponytail", "pigtails", "bob", "mullet", "long", "braids", "dreadlocks", "mohawk", "afro", "cap", "branches", "leaves"];
// What only creatures grow in place of hair.
const CREATURE_HAIR = ["cap", "branches", "leaves"];
export const BEARD = ["none", "goatee", "handlebar", "full", "long"];
export const MOUTH = ["neutral", "thin", "smile", "grin", "smirk", "frown", "full"];
export const JEWELRY = ["earrings", "necklace", "crown"];
export const FACE = ["glasses", "sideburns", "scar", "eyepatch", "warpaint"];
export const EARS = ["round", "pointed", "long", "bear"];
export const NOSE = ["human", "long", "broad"];
export const TUSKS = ["none", "small", "large"];
export const MUZZLE = MUZZLE_KINDS;
export const HORNS = HORN_KINDS;
export const TAIL = TAIL_KINDS;
export const WINGS = WING_KINDS;
export const FLESH = FLESH_KINDS;
export const HANDS = ["hands", "pincers"];
export const LOWER_ARMS = ARM_PAIRS;
export const LOWER = LOWER_KINDS;
export const GAIT = ["normal", "shamble"];
export const UNARMED = ["punch", "claw"];

export const DEFAULT_LOOK = {
  body: "humanoid",
  height: 6,
  build: 0.5,
  limbs: 0.5,
  shoulders: 0.5,
  waist: 0.5,
  hips: 0.5,
  jaw: 0.5,
  arms: 0.5,
  legs: 0.5,
  head: 0.5,
  ears: "round",
  nose: "human",
  tusks: "none",
  muzzle: "none",
  horns: "none",
  tail: "none",
  wings: "none",
  flesh: "living",
  gait: "normal",
  unarmed: "punch",
  lower: "legs",
  hands: "hands",
  lowerArms: "none",
  bust: 0,
  rear: 0.3,
  hair: "short",
  beard: "none",
  mouth: "neutral",
  jewelry: [],
  face: [],
  weapon: "none",
  offhand: "none",
  weaponStyle: "fine",
  offhandStyle: "fine",
  sheathed: false,
  armor: {},
  colors: {
    skin: "#e0b48c",
    hair: "#4a3020",
    eyes: "#3a5a7a",
    primary: "#7a3b2e",
    secondary: "#4a4038",
    metal: "#d4b050",
    steel: "#b8bcc4",
    wood: "#6b4a2a",
    paint: "#2a4a9a",
    horn: "#d8ccb0",
    leaf: "#4a7a3a",
  },
};

// The creatures' bodies, as recipes under a recipe with that body: each picks its own look from
// these, so no two goblins are quite alike. A world's creature recipe changes what it likes.
export const BODY_LOOKS = SHIPPED_LOOKS;

// A look with every choice made: the recipe's settings over its body's (BODY_LOOKS) and the
// defaults, ranges and lists picked from by `random` (returning 0-1). Settings it doesn't know, and
// values that don't fit, are dropped for the defaults, so recipes saved by older or newer versions
// still load.
export function resolveRecipe(own = {}, random = Math.random) {
  const body = BODY_LOOKS[own.body] ?? {};
  const loadouts = [own.loadouts ?? body.loadouts].flat().filter((l) => l && typeof l === "object");
  // One outfit, picked by weight.
  const weight = (l) => (Number.isFinite(l.weight) && l.weight > 0 ? l.weight : 1);
  let at = loadouts.length ? random() * loadouts.reduce((sum, l) => sum + weight(l), 0) : 0;
  const outfit = loadouts.find((l) => (at -= weight(l)) < 0) ?? loadouts.at(-1) ?? {};
  const recipe = { ...body, ...outfit, ...own, colors: { ...body.colors, ...outfit.colors, ...own.colors } };
  const pick = (value) => {
    if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === "number")) {
      return value[0] + (value[1] - value[0]) * random();
    }
    if (Array.isArray(value) && value.length && value.every((v) => typeof v === "string")) {
      return value[Math.floor(random() * value.length) % value.length];
    }
    return value;
  };
  const look = { ...DEFAULT_LOOK, jewelry: [...DEFAULT_LOOK.jewelry], face: [...DEFAULT_LOOK.face], armor: {}, colors: { ...DEFAULT_LOOK.colors } };
  const isColor = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
  const list = (value) => (Array.isArray(value) ? value : []);
  for (const [key, value] of Object.entries(recipe)) {
    if (!(key in DEFAULT_LOOK)) continue;
    if (key === "colors") {
      for (const [part, color] of Object.entries(value ?? {})) {
        const picked = pick(color);
        if (part in DEFAULT_LOOK.colors && isColor(picked)) look.colors[part] = picked;
      }
    } else if (key === "armor") {
      for (const slot of ARMOR_SLOTS) {
        const piece = value?.[slot];
        const type = piece && pick(piece.type);
        if (!ARMOR_TYPES.includes(type)) continue;
        const style = pick(piece.style);
        look.armor[slot] = { type, style: ARMOR_STYLES.includes(style) ? style : "fine", colors: [0, 1].map((i) => [pick(list(piece.colors)[i])].find(isColor) ?? ARMOR_COLORS[type][i]) };
      }
    } else if (key === "jewelry") {
      look.jewelry = list(value).filter((j) => JEWELRY.includes(j));
    } else if (key === "face") {
      look.face = list(value).filter((f) => FACE.includes(f));
    } else {
      const picked = pick(value);
      if (typeof picked === typeof DEFAULT_LOOK[key] && (typeof picked !== "number" || Number.isFinite(picked))) look[key] = picked;
    }
  }
  if (!HAIR.includes(look.hair)) look.hair = DEFAULT_LOOK.hair;
  if (!BEARD.includes(look.beard)) look.beard = DEFAULT_LOOK.beard;
  if (!MOUTH.includes(look.mouth)) look.mouth = DEFAULT_LOOK.mouth;
  if (!EARS.includes(look.ears)) look.ears = DEFAULT_LOOK.ears;
  if (!NOSE.includes(look.nose)) look.nose = DEFAULT_LOOK.nose;
  if (!TUSKS.includes(look.tusks)) look.tusks = DEFAULT_LOOK.tusks;
  for (const [key, options] of Object.entries({ muzzle: MUZZLE, horns: HORNS, tail: TAIL, wings: WINGS, flesh: FLESH, gait: GAIT, unarmed: UNARMED, lower: LOWER, hands: HANDS, lowerArms: LOWER_ARMS })) {
    if (!options.includes(look[key])) look[key] = DEFAULT_LOOK[key];
  }
  if (!WEAPONS.includes(look.weapon)) look.weapon = DEFAULT_LOOK.weapon;
  if (!OFFHANDS.includes(look.offhand) || HELD[look.weapon]?.twoHanded) look.offhand = DEFAULT_LOOK.offhand;
  if (!WEAPON_STYLES.includes(look.weaponStyle)) look.weaponStyle = DEFAULT_LOOK.weaponStyle;
  if (!WEAPON_STYLES.includes(look.offhandStyle)) look.offhandStyle = DEFAULT_LOOK.offhandStyle;
  // A body painted by colorations (bodies.md) wears the one the recipe names, or one picked by
  // weight; the recipe's colors go over its colors by name.
  const colorations = SHIPPED_BODIES[own.body]?.colorations ?? [];
  if (colorations.length) {
    let left = random() * colorations.reduce((sum, c) => sum + weight(c), 0);
    const picked = colorations.find((c) => c.name === own.coloration) ?? colorations.find((c) => (left -= weight(c)) < 0) ?? colorations.at(-1);
    look.coloration = picked.name;
    // The old slot names still reach the colors they painted.
    const renamed = { skin: "coat", hair: "back", secondary: "bare" };
    const paints = Object.entries({ ...outfit.colors, ...own.colors }).filter(([, v]) => isColor(v)).map(([k, v]) => [renamed[k] ?? k, v]);
    if (paints.length) look.paints = Object.fromEntries(paints);
  }
  return look;
}

// The colors a player picks from in the character builder, ten to a row, and a random look's
// colors. Skin runs light to dark. Hair is natural colors first, then dyed ones a passer-by never
// has. CLOTH colors shirts and trousers alike; METAL is jewelry and fittings.
export const SKIN = [
  "#fbe8d8", "#f6e0cc", "#f3d6bd", "#efcfb0", "#e8c2a0", "#e6bc98", "#e0b48c", "#d9a882", "#d1a077", "#c99166",
  "#be8558", "#b07b52", "#a56d48", "#98603e", "#8d5a3a", "#7c4a30", "#6b4029", "#5e3a26", "#4f2f1f", "#3e2418",
];
export const HAIR_COLORS = [
  "#0e0b0a", "#1b1310", "#2a1c14", "#3a2618", "#4a3020", "#5e3c22", "#6e4628", "#8a5a30", "#9a6a3a", "#b07a44",
  "#c8a060", "#d8b878", "#e3cf98", "#ecdcb0", "#8a3018", "#a8401c", "#c05a2a", "#808080", "#b0aca6", "#e6e2da",
  "#d03030", "#e06090", "#a040c0", "#5040c0", "#3070d0", "#20a0b0", "#30a050", "#90c030", "#f0c020", "#f08030",
];
const NATURAL_HAIR = HAIR_COLORS.slice(0, 20);
export const EYES = ["#3a5a7a", "#5a7a9a", "#7a9ab8", "#4a6a3a", "#6a8a4a", "#8a8a4a", "#9a8a5a", "#6b4a2a", "#3a2a1a", "#6a7a7a"];
export const CLOTH = [
  "#7a3b2e", "#9a3a3a", "#6b2a2a", "#c07a30", "#b8a040", "#6b5a3a", "#8a7a5a", "#a08060", "#c8c0a8", "#e8e0d0",
  "#3e5a32", "#6a8a4a", "#2a5a5a", "#3a6a8a", "#2e4a6b", "#5a3a6b", "#7a4a6a", "#5a5a5a", "#4a4038", "#2a2a2a",
];
export const PAINT = ["#2a4a9a", "#2a8a8a", "#3a7a3a", "#c8a020", "#c86020", "#a05030", "#9a2a2a", "#6a2a8a", "#e8e0d0", "#1a1a1a"];
export const METAL = ["#e8c868", "#d4b050", "#b89040", "#a07040", "#b86a40", "#d8a088", "#c8ccd0", "#7a7e84", "#4a4c50", "#2a2826"];

// A random look, for a passer-by: any body, hair and face, ordinary colors, about half the armor
// slots filled, and any weapon.

export function randomLook(random = Math.random) {
  const chance = (p) => random() < p;
  const some = (items, p) => items.filter(() => chance(p));
  return resolveRecipe(
    {
      height: [5.2, 6.6],
      build: [0, 1],
      limbs: [0.2, 0.8],
      shoulders: [0, 1],
      waist: [0, 1],
      hips: [0, 1],
      jaw: [0, 1],
      bust: chance(0.5) ? [0.3, 1] : 0,
      rear: [0, 0.8],
      hair: HAIR.filter((h) => !CREATURE_HAIR.includes(h)),
      beard: chance(0.5) ? "none" : BEARD,
      mouth: MOUTH,
      jewelry: some(JEWELRY.filter((j) => j !== "crown"), 0.25),
      face: some(FACE, 0.12),
      weapon: WEAPONS.filter((w) => w !== "none"),
      offhand: OFFHANDS,
      armor: Object.fromEntries(ARMOR_SLOTS.filter(() => chance(0.5)).map((slot) => [slot, { type: ARMOR_TYPES, colors: [CLOTH, CLOTH] }])),
      colors: { skin: SKIN, hair: NATURAL_HAIR, eyes: EYES, primary: CLOTH, secondary: CLOTH, paint: PAINT },
    },
    random,
  );
}

// The settings a character only tries on in the builder: what it wears and holds comes from what
// it has in each world, so a saved character keeps only its appearance.
export const GEAR = ["weapon", "offhand", "weaponStyle", "offhandStyle", "sheathed", "armor"];

// A look without its gear, as a character saves it.
export function appearance(look) {
  return Object.fromEntries(Object.entries(look).filter(([key]) => !GEAR.includes(key)));
}
