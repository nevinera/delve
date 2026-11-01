import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_STYLES, ARMOR_TYPES } from "./armor.js";
import { HORN_KINDS, MUZZLE_KINDS } from "./body.js";
import { LOWER_KINDS, TAIL_KINDS, WING_KINDS } from "./extras.js";
import { HELD, OFFHANDS, WEAPON_STYLES, WEAPONS } from "./weapons.js";

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
// - ears: an EARS shape; nose: a NOSE shape; tusks: a TUSKS size.
// - muzzle: a snout over the nose and mouth (MUZZLE): canine, reptile or bovine.
// - horns: a HORNS shape; tail: a TAIL shape; wings: bat or feather (WINGS).
// - gait: how it stands and moves, normal or shamble (a zombie's).
// - unarmed: how it fights with nothing in hand, punch or claw (tearing with its hands).
// - flesh: living, rotting (mottled and sore) or bone (a skeleton: thin limbs, ribs, sockets), or
//   an element's: stone, fire, water or air.
// - lower: what stands below the waist: legs, or a horse's body (in the secondary color), a
//   serpent's tail or a whirl down to a point.
// - bust: 0 to 1.
// - rear: 0 flat to 1 full.
// - hair: a HAIR style; beard: a BEARD style; mouth: a MOUTH style; jewelry: a list of JEWELRY; face: a list of FACE
//   markings and wear.
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
//   staves, paint warpaint, horn horns.

export const HAIR = ["bald", "short", "receding", "spiky", "topknot", "bun", "ponytail", "pigtails", "bob", "mullet", "long", "braids", "dreadlocks", "mohawk", "afro"];
export const BEARD = ["none", "goatee", "handlebar", "full", "long"];
export const MOUTH = ["neutral", "thin", "smile", "grin", "smirk", "frown", "full"];
export const JEWELRY = ["earrings", "necklace"];
export const FACE = ["glasses", "sideburns", "scar", "eyepatch", "warpaint"];
export const EARS = ["round", "pointed", "long"];
export const NOSE = ["human", "long", "broad"];
export const TUSKS = ["none", "small", "large"];
export const MUZZLE = MUZZLE_KINDS;
export const HORNS = HORN_KINDS;
export const TAIL = TAIL_KINDS;
export const WINGS = WING_KINDS;
export const FLESH = ["living", "rotting", "bone", "stone", "fire", "water", "air"];
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
  },
};

// The creatures' bodies, as recipes under a recipe with that body: each picks its own look from
// these, so no two goblins are quite alike. A world's creature recipe changes what it likes.
export const BODY_LOOKS = {
  goblin: {
    height: [3.3, 3.9],
    build: [0.25, 0.5],
    limbs: [0.2, 0.4],
    shoulders: [0.3, 0.5],
    arms: [0.75, 0.85],
    legs: [0.2, 0.3],
    head: [0.8, 0.9],
    jaw: [0.3, 0.6],
    ears: "long",
    nose: "long",
    hair: ["bald", "bald", "spiky", "topknot"],
    mouth: ["grin", "frown", "smirk"],
    colors: { skin: ["#6a8a3a", "#7a9a40", "#5a7a34", "#8a9a4a"], hair: ["#1b1310", "#2a1c14"], eyes: ["#d0a020", "#c06020"], primary: ["#6b5a3a", "#5a4a3a", "#7a3b2e"], secondary: ["#4a4038", "#3a3430"] },
    loadouts: [
      { weapon: "dagger", weaponStyle: "crude", armor: { chest: { type: "leather", style: "tattered" }, feet: { type: "cloth", style: "tattered" } }, weight: 3 },
      { weapon: "sword", weaponStyle: "crude", offhand: "shield", offhandStyle: "crude", armor: { chest: { type: "leather", style: "tattered" }, head: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "bow", weaponStyle: "crude", armor: { chest: { type: "cloth", style: "tattered" } }, weight: 2 },
      { weapon: "staff", weaponStyle: "savage", armor: { chest: { type: "cloth", style: "savage" }, head: { type: "cloth", style: "savage" } } },
    ],
  },
  troll: {
    height: [8, 9],
    build: [0.75, 0.95],
    limbs: [0.6, 0.8],
    shoulders: [0.8, 1],
    waist: [0.6, 0.8],
    arms: [0.8, 0.9],
    legs: [0.35, 0.45],
    head: [0.2, 0.3],
    jaw: [0.8, 1],
    ears: "pointed",
    nose: "broad",
    tusks: "large",
    hair: ["mohawk", "bald", "spiky"],
    mouth: ["frown", "neutral"],
    colors: { skin: ["#4a7a8a", "#5a8a7a", "#6a8a9a"], hair: ["#c05a2a", "#d03030", "#1b1310"], eyes: ["#d03020", "#e0c040"], primary: ["#5a4a3a", "#6b5a3a"], secondary: ["#4a4038", "#3a3430"] },
    loadouts: [
      { weapon: "maul", weaponStyle: "savage", armor: { shoulders: { type: "leather", style: "savage" }, legs: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "greataxe", weaponStyle: "savage", armor: { chest: { type: "plate", style: "savage" }, shoulders: { type: "plate", style: "savage" } } },
      { weapon: "mace", weaponStyle: "crude", offhand: "shield", offhandStyle: "savage", armor: { chest: { type: "chain", style: "tattered" } } },
    ],
  },
  dragon: {
    height: [13, 16],
    build: [0.4, 0.7],
    colors: { skin: ["#8a2a1e", "#3a6a34", "#2a2a30", "#9a6a2a"], secondary: ["#c8a070", "#b09060"], hair: ["#e0d6b8", "#3a3430"], eyes: ["#f0c020", "#e06020"] },
  },
  wyvern: {
    height: [9, 11],
    build: [0.3, 0.6],
    colors: { skin: ["#4a5a2a", "#5a4a30", "#3a4a4a"], secondary: ["#a09060", "#8a7a5a"], hair: ["#d8ccb0", "#2a2420"], eyes: ["#e0d020", "#c04020"] },
  },
  orc: {
    height: [6.2, 7],
    build: [0.65, 0.9],
    limbs: [0.6, 0.8],
    shoulders: [0.7, 0.95],
    jaw: [0.7, 1],
    head: [0.45, 0.6],
    ears: "pointed",
    nose: "broad",
    tusks: ["small", "large"],
    hair: ["mohawk", "topknot", "bald", "braids"],
    mouth: ["frown", "neutral"],
    colors: { skin: ["#5a7a3a", "#6a7a40", "#7a6a50", "#4a6a3a"], hair: ["#1b1310", "#2a1c14"], eyes: ["#c02a1a", "#d0a020"], primary: ["#5a4a3a", "#6b3a2a"], secondary: ["#3a3430", "#4a4038"] },
    loadouts: [
      { weapon: "axe", weaponStyle: "savage", offhand: "shield", offhandStyle: "savage", armor: { chest: { type: "plate", style: "savage" }, shoulders: { type: "plate", style: "savage" } }, weight: 2 },
      { weapon: "greataxe", weaponStyle: "savage", armor: { chest: { type: "leather", style: "savage" }, shoulders: { type: "leather", style: "savage" } }, weight: 2 },
      { weapon: "sword", weaponStyle: "crude", offhand: "axe", offhandStyle: "crude", armor: { chest: { type: "chain", style: "tattered" } } },
      { weapon: "staff", weaponStyle: "savage", armor: { chest: { type: "cloth", style: "savage" }, head: { type: "leather", style: "savage" } } },
    ],
  },
  ogre: {
    unarmed: "claw",
    height: [9, 10.5],
    build: [0.9, 1],
    limbs: [0.85, 1],
    shoulders: [0.85, 1],
    waist: [0.9, 1],
    hips: [0.8, 1],
    arms: [0.6, 0.75],
    legs: [0.2, 0.3],
    head: [0.3, 0.4],
    jaw: [0.9, 1],
    ears: "round",
    nose: "broad",
    tusks: ["small", "none"],
    hair: ["bald", "bald", "topknot"],
    mouth: ["frown", "grin"],
    colors: { skin: ["#a08a6a", "#8a9a6a", "#9a7a6a"], hair: ["#2a1c14", "#4a3020"], eyes: ["#d0a020"], primary: ["#5a4a3a", "#6b5a3a"], secondary: ["#4a4038", "#3a3430"] },
    loadouts: [
      { weapon: "maul", weaponStyle: "crude", armor: { legs: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "mace", weaponStyle: "savage", armor: { chest: { type: "leather", style: "tattered" }, shoulders: { type: "leather", style: "savage" } } },
    ],
  },
  kobold: {
    unarmed: "claw",
    height: [2.8, 3.4],
    build: [0.25, 0.45],
    limbs: [0.2, 0.35],
    head: [0.6, 0.75],
    legs: [0.3, 0.4],
    ears: "round",
    muzzle: "reptile",
    horns: "small",
    tail: "reptile",
    hair: "bald",
    colors: { skin: ["#9a5a3a", "#8a6a3a", "#7a4a3a"], eyes: ["#e0c040", "#d06020"], primary: ["#6b5a3a", "#5a4a3a"], secondary: ["#4a4038"], horn: ["#d8ccb0", "#b0a080"] },
    loadouts: [
      { weapon: "dagger", weaponStyle: "crude", armor: { chest: { type: "cloth", style: "tattered" } }, weight: 2 },
      { weapon: "polearm", weaponStyle: "crude", armor: { head: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "thrown", weaponStyle: "crude" },
    ],
  },
  gnoll: {
    unarmed: "claw",
    height: [6.8, 7.6],
    build: [0.45, 0.65],
    limbs: [0.4, 0.6],
    shoulders: [0.65, 0.85],
    arms: [0.7, 0.8],
    head: [0.5, 0.6],
    ears: "pointed",
    muzzle: "canine",
    tail: "bushy",
    hair: ["mohawk", "mohawk", "short"],
    colors: { skin: ["#a08050", "#8a7a5a", "#b09060"], hair: ["#3a2a1a", "#2a2018"], eyes: ["#e0c040", "#c04020"], primary: ["#6b5a3a", "#5a4a3a"], secondary: ["#4a4038"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "savage", armor: { chest: { type: "leather", style: "savage" } }, weight: 2 },
      { weapon: "bow", weaponStyle: "crude", armor: { chest: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "axe", weaponStyle: "savage", offhand: "shield", offhandStyle: "crude", armor: { shoulders: { type: "leather", style: "savage" } } },
    ],
  },
  lizardfolk: {
    unarmed: "claw",
    height: [6, 7],
    build: [0.45, 0.65],
    limbs: [0.45, 0.6],
    head: [0.5, 0.6],
    ears: "round",
    muzzle: "reptile",
    tail: "reptile",
    hair: "bald",
    colors: { skin: ["#4a7a4a", "#3a6a5a", "#6a7a3a"], eyes: ["#e0c040", "#e06020"], primary: ["#6b5a3a", "#3a5a4a"], secondary: ["#4a4038"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "crude", offhand: "none", weight: 2 },
      { weapon: "mace", weaponStyle: "crude", offhand: "shield", offhandStyle: "crude", armor: { chest: { type: "leather", style: "tattered" } }, weight: 2 },
      { weapon: "thrown", weaponStyle: "crude" },
    ],
  },
  minotaur: {
    unarmed: "claw",
    height: [8.5, 9.5],
    build: [0.8, 1],
    limbs: [0.75, 0.95],
    shoulders: [0.9, 1],
    waist: [0.6, 0.75],
    head: [0.55, 0.65],
    ears: "round",
    muzzle: "bovine",
    horns: "bull",
    tail: "tuft",
    hair: ["short"],
    colors: { skin: ["#5a3a2a", "#3a2a22", "#7a5a3a"], hair: ["#2a1c14", "#1b1310"], eyes: ["#c02a1a"], primary: ["#5a4a3a"], secondary: ["#4a4038", "#5a3a2a"], horn: ["#d8ccb0", "#c8b898"] },
    loadouts: [
      { weapon: "greataxe", weaponStyle: "savage", armor: { shoulders: { type: "plate", style: "savage" } }, weight: 3 },
      { weapon: "maul", weaponStyle: "savage", armor: { legs: { type: "leather", style: "tattered" } } },
    ],
  },
  skeleton: {
    unarmed: "claw",
    height: [5.8, 6.2],
    build: [0.1, 0.2],
    limbs: [0.2, 0.3],
    waist: [0.1, 0.2],
    flesh: "bone",
    hair: "bald",
    colors: { skin: ["#d8d0b8", "#c8c0a8"], primary: ["#d0c8b0", "#c8c0a8"], secondary: ["#c8c0a8"], eyes: ["#40c0f0", "#f04020"] },
    loadouts: [
      { weapon: "sword", weaponStyle: "crude", offhand: "shield", offhandStyle: "crude", weight: 2 },
      { weapon: "greatsword", weaponStyle: "crude", armor: { head: { type: "plate", style: "tattered" }, chest: { type: "chain", style: "tattered" } } },
      { weapon: "bow", weaponStyle: "crude" },
      { weapon: "staff", weaponStyle: "savage", armor: { chest: { type: "cloth", style: "tattered" }, head: { type: "cloth", style: "tattered" } } },
    ],
  },
  zombie: {
    height: [5.6, 6.2],
    build: [0.3, 0.55],
    flesh: "rotting",
    gait: "shamble",
    unarmed: "claw",
    hair: ["bald", "receding", "long", "short"],
    mouth: ["grin", "frown"],
    colors: { skin: ["#8a9a7a", "#7a8a6a", "#9a9a8a"], hair: ["#3a3430", "#5a5048"], eyes: ["#e0e0a0", "#c0d040"], primary: ["#5a5a4a", "#4a4a5a", "#6a5a4a"], secondary: ["#3a3a3a", "#4a4038"] },
    loadouts: [{ weight: 3 }, { weapon: "axe", weaponStyle: "crude", armor: { chest: { type: "cloth", style: "tattered" } } }],
  },
  giant: {
    height: [16, 20],
    build: [0.6, 0.85],
    limbs: [0.6, 0.8],
    shoulders: [0.7, 0.9],
    head: [0.35, 0.45],
    jaw: [0.6, 0.9],
    hair: ["long", "braids", "bald"],
    beard: ["full", "long", "none"],
    colors: { skin: ["#b09070", "#8a9aaa", "#c0a080"], hair: ["#5a4a3a", "#c0c0c0", "#8a5a2a"], primary: ["#6b5a3a", "#5a6a7a"], secondary: ["#4a4038"] },
    loadouts: [
      { weapon: "maul", weaponStyle: "crude", armor: { chest: { type: "leather", style: "fine" } }, weight: 2 },
      { weapon: "thrown", weaponStyle: "crude" },
    ],
  },
  harpy: {
    unarmed: "claw",
    height: [5, 5.6],
    build: [0.15, 0.3],
    limbs: [0.15, 0.3],
    bust: [0.2, 0.4],
    ears: "pointed",
    wings: "feather",
    hair: ["long", "dreadlocks", "bun"],
    mouth: ["grin", "smirk"],
    colors: { skin: ["#c8a888", "#a88868", "#d0b8a0"], hair: ["#5a4a3a", "#3a3a4a", "#8a6a4a"], eyes: ["#e0c040"], primary: ["#5a4a3a", "#6a5a4a"], secondary: ["#3a3430"] },
    loadouts: [{ weapon: "fist", weaponStyle: "crude", offhand: "fist", offhandStyle: "crude", weight: 2 }, { weapon: "dagger", weaponStyle: "crude" }],
  },
  gargoyle: {
    unarmed: "claw",
    height: [6, 7],
    build: [0.6, 0.85],
    limbs: [0.6, 0.8],
    head: [0.45, 0.55],
    ears: "pointed",
    horns: ["swept", "ram"],
    wings: "bat",
    tail: "thin",
    hair: "bald",
    mouth: ["grin", "frown"],
    colors: { skin: ["#7a7a7a", "#6a6a72", "#8a8278"], eyes: ["#e04020", "#e0c040"], primary: ["#6a6a6a"], secondary: ["#5a5a5a"], horn: ["#4a4a4a", "#5a5a5a"] },
  },
  imp: {
    unarmed: "claw",
    height: [2.6, 3.2],
    build: [0.2, 0.35],
    limbs: [0.15, 0.3],
    head: [0.75, 0.9],
    ears: "long",
    horns: "small",
    wings: "bat",
    tail: "thin",
    hair: "bald",
    mouth: ["grin", "smirk"],
    colors: { skin: ["#b03a2a", "#a04a3a", "#7a3a6a"], eyes: ["#f0d040"], primary: ["#3a2a2a"], secondary: ["#2a2020"], horn: ["#2a2020", "#4a3a30"] },
    loadouts: [{ weight: 2 }, { weapon: "wand", weaponStyle: "fine" }],
  },
  centaur: {
    height: [8, 8.8],
    build: [0.45, 0.7],
    limbs: [0.45, 0.65],
    shoulders: [0.55, 0.8],
    lower: "horse",
    ears: ["round", "pointed"],
    hair: ["long", "braids", "ponytail", "mohawk"],
    beard: ["none", "none", "full"],
    colors: { skin: ["#c89a70", "#a87a50", "#e0b48c"], hair: ["#3a2a1a", "#6a4a2a", "#1b1310"], primary: ["#6b5a3a", "#5a6a3a"], secondary: ["#7a5a3a", "#5a4030", "#9a8a7a", "#3a3030"] },
    loadouts: [
      { weapon: "bow", weaponStyle: "fine", armor: { chest: { type: "leather" } }, weight: 3 },
      { weapon: "polearm", weaponStyle: "fine", armor: { chest: { type: "chain" }, shoulders: { type: "leather" } }, weight: 2 },
      { weapon: "sword", weaponStyle: "fine", offhand: "shield", offhandStyle: "fine", armor: { chest: { type: "plate" }, head: { type: "plate" } } },
    ],
  },
  naga: {
    height: [7.5, 8.5],
    build: [0.4, 0.6],
    limbs: [0.4, 0.55],
    lower: "serpent",
    ears: ["pointed", "long"],
    hair: ["long", "braids", "dreadlocks"],
    colors: { skin: ["#3a7a6a", "#4a6a8a", "#5a8a5a"], hair: ["#1a3a4a", "#2a4a3a", "#3a2a4a"], eyes: ["#e0c040", "#40e0c0"], primary: ["#3a5a6a", "#4a3a5a"], secondary: ["#3a5a6a"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "fine", armor: { chest: { type: "chain" } }, weight: 2 },
      { weapon: "sword", weaponStyle: "fine", offhand: "sword", offhandStyle: "fine", armor: { shoulders: { type: "plate" } } },
      { weapon: "staff", weaponStyle: "fine", armor: { chest: { type: "cloth" } } },
    ],
  },
  frogman: {
    height: [5, 5.8],
    build: [0.4, 0.65],
    limbs: [0.3, 0.5],
    legs: [0.3, 0.4],
    arms: [0.65, 0.8],
    head: [0.6, 0.7],
    muzzle: "frog",
    hair: "bald",
    unarmed: "claw",
    colors: { skin: ["#5a8a3a", "#4a7a5a", "#7a8a3a", "#3a6a6a"], eyes: ["#e0c040", "#e06020"], primary: ["#5a6a3a", "#4a5a4a"], secondary: ["#5a6a3a", "#3a4a3a"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "crude", weight: 3 },
      { weapon: "thrown", weaponStyle: "crude", weight: 2 },
      { weapon: "dagger", weaponStyle: "crude", offhand: "shield", offhandStyle: "crude", armor: { chest: { type: "leather", style: "tattered" } } },
    ],
  },
  earthElemental: {
    height: [9, 11],
    build: [0.9, 1],
    limbs: [0.9, 1],
    shoulders: [0.9, 1],
    arms: [0.75, 0.85],
    legs: [0.2, 0.3],
    head: [0.2, 0.3],
    flesh: "stone",
    hair: "bald",
    mouth: "frown",
    colors: { skin: ["#7a6a5a", "#6a6a6a", "#8a7a5a"], primary: ["#6a5a4a", "#5a5a5a"], secondary: ["#5a4a3a", "#4a4a4a"], eyes: ["#e0a020", "#60e040"] },
  },
  fireElemental: {
    height: [8, 9],
    build: [0.4, 0.6],
    limbs: [0.4, 0.6],
    lower: "vortex",
    flesh: "fire",
    hair: "spiky",
    mouth: "grin",
    colors: { skin: "#ff8020", hair: "#ffc040", primary: "#ff8020", secondary: "#ff6010", eyes: "#fff0a0" },
  },
  waterElemental: {
    height: [8, 9.5],
    build: [0.6, 0.85],
    limbs: [0.6, 0.8],
    lower: "vortex",
    flesh: "water",
    hair: "bald",
    colors: { skin: "#3a7ab0", primary: "#3a7ab0", secondary: "#3a7ab0", eyes: "#e0f8ff" },
  },
  airElemental: {
    height: [8, 9],
    build: [0.3, 0.5],
    limbs: [0.3, 0.5],
    lower: "vortex",
    flesh: "air",
    hair: "bald",
    colors: { skin: "#d0dae8", primary: "#d0dae8", secondary: "#d0dae8", eyes: "#80c0ff" },
  },
  wolf: {
    height: [2.9, 3.3],
    build: [0.4, 0.6],
    limbs: [0.4, 0.6],
    head: [0.45, 0.55],
    colors: { skin: ["#7a6e60", "#8a8478", "#6a5e52", "#9a948a"], hair: ["#3e3a36", "#4a4038", "#2e2a28"], eyes: ["#c8a040", "#b08030"] },
  },
  panther: {
    height: [2.4, 2.8],
    build: [0.4, 0.6],
    colors: { skin: ["#2a2626", "#c89a50", "#a8885a"], hair: ["#1a1818", "#8a6a3a"], eyes: ["#d0c040", "#90b040"] },
  },
  rat: {
    height: [1.3, 1.6],
    build: [0.5, 0.8],
    colors: { skin: ["#5a524a", "#6a6058", "#4a4440"], hair: ["#3a3430", "#2e2a28"], secondary: ["#c89090", "#b08080"], eyes: ["#d02020", "#1a1010"] },
  },
  bear: {
    height: [4.2, 4.8],
    build: [0.5, 0.8],
    colors: { skin: ["#5a3e28", "#4a3020", "#6a4a30", "#2a2420"], hair: ["#3a2818", "#2a1e14"], eyes: ["#2a1a10"] },
  },
  boar: {
    height: [3, 3.4],
    build: [0.5, 0.8],
    colors: { skin: ["#4a3a30", "#3a302a", "#5a4a3a"], hair: ["#2a2420", "#1e1a18"], secondary: ["#8a6a60", "#7a5a50"], eyes: ["#2a1a10"] },
  },
  stag: {
    height: [5.2, 5.8],
    build: [0.4, 0.6],
    colors: { skin: ["#8a5a34", "#9a6a40", "#7a4e2e"], hair: ["#5a3a22", "#4a3020"], eyes: ["#1a1010"] },
  },
  horse: {
    height: [7, 7.8],
    build: [0.4, 0.6],
    colors: { skin: ["#6a4028", "#3a2a20", "#8a7a6a", "#c8b898", "#2a2420"], hair: ["#1e1a18", "#3a2a20", "#d8d0c0"], eyes: ["#1a1010"] },
  },
  lizard: {
    height: [1.3, 1.6],
    build: [0.4, 0.6],
    colors: { skin: ["#4a6a3a", "#6a6a3a", "#3a5a4a"], hair: ["#2a4a2a", "#4a4a2a"], secondary: ["#c8c090", "#b0b080"], eyes: ["#e0c020", "#d08020"] },
  },
  basilisk: {
    height: [1.9, 2.3],
    build: [0.5, 0.7],
    colors: { skin: ["#3a5a4a", "#4a4a5a"], hair: ["#8a2a2a", "#6a2a4a"], secondary: ["#a8a070"], eyes: ["#f0f040", "#e04020"] },
  },
  crocodile: {
    height: [1.3, 1.5],
    build: [0.5, 0.7],
    colors: { skin: ["#3a4a2a", "#4a4a30"], hair: ["#2a3420", "#2a2e20"], secondary: ["#b0a878", "#a09868"], eyes: ["#c8a020"] },
  },
};

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
  for (const [key, options] of Object.entries({ muzzle: MUZZLE, horns: HORNS, tail: TAIL, wings: WINGS, flesh: FLESH, gait: GAIT, unarmed: UNARMED, lower: LOWER })) {
    if (!options.includes(look[key])) look[key] = DEFAULT_LOOK[key];
  }
  if (!WEAPONS.includes(look.weapon)) look.weapon = DEFAULT_LOOK.weapon;
  if (!OFFHANDS.includes(look.offhand) || HELD[look.weapon]?.twoHanded) look.offhand = DEFAULT_LOOK.offhand;
  if (!WEAPON_STYLES.includes(look.weaponStyle)) look.weaponStyle = DEFAULT_LOOK.weaponStyle;
  if (!WEAPON_STYLES.includes(look.offhandStyle)) look.offhandStyle = DEFAULT_LOOK.offhandStyle;
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
      hair: HAIR,
      beard: chance(0.5) ? "none" : BEARD,
      mouth: MOUTH,
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
export const GEAR = ["weapon", "offhand", "weaponStyle", "offhandStyle", "sheathed", "armor"];

// A look without its gear, as a character saves it.
export function appearance(look) {
  return Object.fromEntries(Object.entries(look).filter(([key]) => !GEAR.includes(key)));
}
