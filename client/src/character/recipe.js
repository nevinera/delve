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

// The look saved by the character builder page, which walk mode uses too, or the default.
// Saved looks and recipes load through resolveRecipe, so a recipe saved before a setting existed
// takes its default, and one naming a choice since removed falls back to the default too.
const SAVED = "characterBuilder.look";

export function savedLook() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED));
    if (saved) return resolveRecipe(saved);
  } catch {
    // Falls back to the default.
  }
  return resolveRecipe();
}

export function saveLook(look) {
  try {
    localStorage.setItem(SAVED, JSON.stringify(look));
  } catch {
    // Not saved; the look still shows.
  }
}

// Characters saved by name on the builder page, in this browser: { name: look }.
const NAMED = "characterBuilder.saved";

export function namedLooks() {
  try {
    const saved = JSON.parse(localStorage.getItem(NAMED));
    if (saved && typeof saved === "object") return saved;
  } catch {
    // None saved, or unreadable.
  }
  return {};
}

// Saves a look by name, or forgets the name when look is null. False when it couldn't be saved.
export function nameLook(name, look) {
  const saved = namedLooks();
  if (look) saved[name] = look;
  else delete saved[name];
  try {
    localStorage.setItem(NAMED, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}
