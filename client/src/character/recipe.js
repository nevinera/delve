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
// - hair: a HAIR style; beard: a BEARD style; jewelry: a list of JEWELRY.
// - colors: { skin, hair, eyes, primary, secondary, metal }, each "#rrggbb" or a list to pick
//   from. primary is the shirt or tunic, secondary the trousers; boots and belt are darker shades
//   of those.

export const HAIR = ["bald", "short", "long", "ponytail", "braids", "mohawk", "afro"];
export const BEARD = ["none", "goatee", "handlebar", "full", "long"];
export const JEWELRY = ["earrings", "necklace"];

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
  colors: {
    skin: "#e0b48c",
    hair: "#4a3020",
    eyes: "#3a5a7a",
    primary: "#7a3b2e",
    secondary: "#4a4038",
    metal: "#d4b050",
  },
};

// A look with every choice made: the recipe's settings over the defaults, ranges and lists picked
// from by `random` (returning 0-1).
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
  const look = { ...DEFAULT_LOOK, jewelry: [...DEFAULT_LOOK.jewelry], colors: { ...DEFAULT_LOOK.colors } };
  for (const [key, value] of Object.entries(recipe)) {
    if (key === "colors") {
      for (const [part, color] of Object.entries(value)) look.colors[part] = pick(color);
    } else if (key === "jewelry") {
      look.jewelry = value.filter((j) => JEWELRY.includes(j));
    } else {
      look[key] = pick(value);
    }
  }
  if (!HAIR.includes(look.hair)) look.hair = DEFAULT_LOOK.hair;
  if (!BEARD.includes(look.beard)) look.beard = DEFAULT_LOOK.beard;
  return look;
}

// The look saved by the character builder page, which walk mode uses too, or the default.
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
