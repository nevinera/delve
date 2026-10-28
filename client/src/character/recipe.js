import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_TYPES } from "./armor.js";
import { HELD, OFFHANDS, WEAPONS } from "./weapons.js";

// Character recipes: how a kind of character looks, as plain JSON, so a world can describe its
// enemies' looks and the client builds their models (body.js). A recipe gives each setting either a
// value or a choice: [low, high] picks a number between, and a list of strings picks one of them.
// Each spawn of an enemy resolves its kind's recipe with its own seed, so a band of bandits look
// related without looking alike. A player's appearance is a recipe with every choice made.
//
// Settings:
// - body: the skeleton and body plan; only "humanoid" so far.
// - height: in feet, to the top of the head.
// - build: 0 slight to 1 heavy, the thickness of the trunk and limbs.
// - limbs: 0 thin to 1 thick, the limbs on top of build.
// - shoulders, waist, hips, jaw: 0 narrow to 1 broad.
// - bust: 0 to 1.
// - hair: a HAIR style; beard: a BEARD style; jewelry: a list of JEWELRY; face: a list of FACE
//   markings and wear.
// - weapon: one of weapons.js's WEAPONS, held in hand.
// - offhand: one of weapons.js's OFFHANDS, a shield, orb or second weapon; none with a
//   two-handed weapon.
// - sheathed: true to put the weapon and off-hand item away, at the hips and across the back.
// - armor: { slot: { type, colors: [main, trim] } } for armor.js's ARMOR_SLOTS and ARMOR_TYPES;
//   type and each color can be a list to pick from.
// - colors: { skin, hair, eyes, primary, secondary, metal, steel, wood, paint }, each "#rrggbb" or
//   a list to pick from. primary is the shirt or tunic, secondary the trousers; boots and belt are
//   darker shades of those. metal is jewelry, fittings and glasses, steel blades, wood hafts and
//   staves, paint warpaint.

export const HAIR = ["bald", "short", "receding", "spiky", "topknot", "bun", "ponytail", "pigtails", "bob", "mullet", "long", "braids", "dreadlocks", "mohawk", "afro"];
export const BEARD = ["none", "goatee", "handlebar", "full", "long"];
export const JEWELRY = ["earrings", "necklace"];
export const FACE = ["glasses", "sideburns", "scar", "eyepatch", "warpaint"];

export const DEFAULT_LOOK = {
  body: "humanoid",
  height: 6,
  build: 0.5,
  limbs: 0.5,
  shoulders: 0.5,
  waist: 0.5,
  hips: 0.5,
  jaw: 0.5,
  bust: 0,
  hair: "short",
  beard: "none",
  jewelry: [],
  face: [],
  weapon: "none",
  offhand: "none",
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
  },
};

// A look with every choice made: the recipe's settings over the defaults, ranges and lists picked
// from by `random` (returning 0-1). Settings it doesn't know, and values that don't fit, are
// dropped for the defaults, so recipes saved by older or newer versions still load.
export function resolveRecipe(recipe = {}, random = Math.random) {
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
        look.armor[slot] = { type, colors: [0, 1].map((i) => [pick(list(piece.colors)[i])].find(isColor) ?? ARMOR_COLORS[type][i]) };
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
  if (!WEAPONS.includes(look.weapon)) look.weapon = DEFAULT_LOOK.weapon;
  if (!OFFHANDS.includes(look.offhand) || HELD[look.weapon]?.twoHanded) look.offhand = DEFAULT_LOOK.offhand;
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
      hair: HAIR,
      beard: chance(0.5) ? "none" : BEARD,
      jewelry: some(JEWELRY, 0.25),
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
export const GEAR = ["weapon", "offhand", "sheathed", "armor"];

// A look without its gear, as a character saves it.
export function appearance(look) {
  return Object.fromEntries(Object.entries(look).filter(([key]) => !GEAR.includes(key)));
}
