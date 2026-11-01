import { ARMOR_COLORS, ARMOR_SLOTS, ARMOR_STYLES, ARMOR_TYPES } from "./armor.js";
import { FLESH_KINDS, HORN_KINDS, MUZZLE_KINDS } from "./body.js";
import { ARM_PAIRS, LOWER_KINDS, TAIL_KINDS, WING_KINDS } from "./extras.js";
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
  snake: {
    height: [5, 7],
    build: [0.4, 0.7],
    colors: { skin: ["#6a6a3a", "#4a5a3a", "#7a5a3a"], secondary: ["#d8c890", "#c8b880"], hair: ["#2a2418", "#3a2a1a", "#5a3a20"], eyes: ["#e0c020", "#d07020"] },
  },
  cobra: {
    height: [6, 8],
    build: [0.3, 0.6],
    colors: { skin: ["#5a4a2a", "#3a3a30", "#7a6a3a"], secondary: ["#e0d0a0", "#d0c090"], hair: ["#1a1814", "#e0d0a0"], eyes: ["#e04020", "#e0c020"] },
  },
  shark: {
    height: [10, 14],
    build: [0.4, 0.7],
    colors: { skin: ["#5a6a78", "#6a7280", "#4a5a6a"], secondary: ["#e8e8e0", "#d8dcd8"], hair: ["#4a5a68", "#5a6470"], eyes: ["#101014"] },
  },
  barracuda: {
    height: [5, 7],
    build: [0.3, 0.6],
    colors: { skin: ["#6a7a88", "#7a8890", "#5a7078"], secondary: ["#e0e4e8", "#d0d8dc"], hair: ["#5a6a70", "#c8b850"], eyes: ["#d0c040", "#c0c8d0"] },
  },
  stingray: {
    height: [5, 8],
    build: [0.4, 0.7],
    colors: { skin: ["#6a5a48", "#5a5040", "#4a4a40"], secondary: ["#e0d8c8", "#d8d0c0"], hair: ["#3a3028", "#8a7a5a"], eyes: ["#d0a030", "#202020"] },
  },
  bat: {
    height: [8, 12],
    build: [0.3, 0.7],
    colors: { skin: ["#4a3a30", "#3a3030", "#5a4a3a", "#2a2428"], secondary: ["#3a2a28", "#4a3430", "#2a2020"], hair: ["#1a1414", "#2a2020"], eyes: ["#d03020", "#e0c040", "#101010"] },
  },
  spider: {
    height: [3.5, 5],
    build: [0.4, 0.8],
    limbs: [0.3, 0.6],
    colors: { skin: ["#2a2420", "#3a3028", "#4a3a2a", "#1a1a1a"], secondary: ["#a03020", "#c0a040", "#6a6a6a"], hair: ["#5a4a3a", "#2a2a2a"], eyes: ["#d02020", "#40d040"] },
  },
  scorpion: {
    height: [4, 5.5],
    build: [0.4, 0.8],
    limbs: [0.4, 0.7],
    colors: { skin: ["#7a5a2a", "#3a2a20", "#8a6a3a", "#2a2a30"], secondary: ["#c08030", "#d0a040"], hair: ["#2a1a10", "#1a1414"], eyes: ["#101010", "#c03020"] },
  },
  beetle: {
    height: [3.5, 4.5],
    build: [0.5, 0.8],
    limbs: [0.5, 0.8],
    colors: { skin: ["#1a1a1a", "#2a2018"], secondary: ["#2a5a3a", "#3a2a5a", "#5a3a1a", "#1a3a5a"], hair: ["#2a2420", "#3a3028"], eyes: ["#c0a020", "#d04020"] },
  },
  wisp: {
    height: [4, 6],
    build: [0.4, 0.8],
    colors: { skin: ["#7ad0ff", "#a0ffb0", "#c0a0ff", "#ffd070"], eyes: ["#ffffff", "#f0fff0"] },
  },
  slime: {
    height: [2.5, 4],
    build: [0.4, 0.8],
    colors: { skin: ["#5ab04a", "#4a8ac0", "#c04a4a", "#9a5ac0", "#c0b04a"], eyes: ["#101010", "#2a2a2a"] },
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
  tauros: {
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
  amphen: {
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
  georite: {
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
  furite: {
    height: [8, 9],
    build: [0.4, 0.6],
    limbs: [0.4, 0.6],
    lower: "vortex",
    flesh: "fire",
    hair: "spiky",
    mouth: "grin",
    colors: { skin: "#ff8020", hair: "#ffc040", primary: "#ff8020", secondary: "#ff6010", eyes: "#fff0a0" },
  },
  aquite: {
    height: [8, 9.5],
    build: [0.6, 0.85],
    limbs: [0.6, 0.8],
    lower: "vortex",
    flesh: "water",
    hair: "bald",
    colors: { skin: "#3a7ab0", primary: "#3a7ab0", secondary: "#3a7ab0", eyes: "#e0f8ff" },
  },
  aerite: {
    height: [8, 9],
    build: [0.3, 0.5],
    limbs: [0.3, 0.5],
    lower: "vortex",
    flesh: "air",
    hair: "bald",
    colors: { skin: "#d0dae8", primary: "#d0dae8", secondary: "#d0dae8", eyes: "#80c0ff" },
  },
  boric: {
    unarmed: "claw",
    height: [5.4, 6.2],
    build: [0.6, 0.85],
    limbs: [0.55, 0.75],
    shoulders: [0.65, 0.9],
    waist: [0.6, 0.85],
    legs: [0.3, 0.4],
    head: [0.5, 0.6],
    ears: "pointed",
    muzzle: "boar",
    tusks: ["small", "large"],
    tail: "tuft",
    flesh: "fur",
    hair: ["mohawk", "mohawk", "spiky"],
    colors: { skin: ["#7a5a40", "#6a4a38", "#8a6a50", "#5a4030"], hair: ["#2a1c14", "#3a2a1a", "#1b1310"], eyes: ["#c02a1a", "#d0a020"], primary: ["#6b5a3a", "#5a4a3a"], secondary: ["#4a4038", "#5a4030"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "savage", armor: { shoulders: { type: "leather", style: "savage" } }, weight: 3 },
      { weapon: "axe", weaponStyle: "savage", offhand: "shield", offhandStyle: "savage", armor: { chest: { type: "leather", style: "savage" } }, weight: 2 },
      { weapon: "bow", weaponStyle: "crude", armor: { chest: { type: "leather", style: "tattered" } } },
      { weapon: "staff", weaponStyle: "savage", armor: { head: { type: "leather", style: "savage" }, chest: { type: "cloth", style: "savage" } } },
    ],
  },
  ursol: {
    unarmed: "claw",
    height: [7, 8],
    build: [0.8, 1],
    limbs: [0.7, 0.9],
    shoulders: [0.8, 1],
    waist: [0.8, 1],
    hips: [0.7, 0.9],
    legs: [0.3, 0.4],
    head: [0.5, 0.6],
    ears: "bear",
    muzzle: "bear",
    flesh: "fur",
    hair: "short",
    colors: { skin: ["#6a4a30", "#5a3e28", "#8a6a48", "#3a2a20"], hair: ["#4a3020", "#3a2818", "#6a5038"], eyes: ["#2a1a10", "#d0a020"], primary: ["#5a6a3a", "#6b5a3a"], secondary: ["#4a4038", "#5a4030"] },
    loadouts: [
      { weight: 2 },
      { weapon: "maul", weaponStyle: "savage", armor: { shoulders: { type: "leather", style: "savage" } }, weight: 2 },
      { weapon: "staff", weaponStyle: "savage", armor: { chest: { type: "cloth", style: "savage" } } },
    ],
  },
  trog: {
    height: [4.6, 5.2],
    build: [0.7, 0.9],
    limbs: [0.7, 0.9],
    shoulders: [0.85, 1],
    waist: [0.7, 0.9],
    arms: [0.8, 0.9],
    legs: [0.2, 0.3],
    head: [0.45, 0.55],
    jaw: [0.8, 1],
    ears: "pointed",
    nose: "broad",
    hair: ["bald", "bald", "mohawk"],
    mouth: ["frown", "grin"],
    colors: { skin: ["#7a7a72", "#6a6a66", "#8a8478", "#5a5e5a"], hair: ["#2a2a2a", "#4a4038"], eyes: ["#e0c040", "#d04020"], primary: ["#5a4a3a"], secondary: ["#4a4038", "#3a3430"] },
    loadouts: [
      { weapon: "mace", weaponStyle: "crude", armor: { legs: { type: "leather", style: "tattered" } }, weight: 3 },
      { weapon: "maul", weaponStyle: "crude", weight: 2 },
      { weapon: "thrown", weaponStyle: "crude" },
    ],
  },
  homari: {
    unarmed: "claw",
    height: [6.2, 7],
    build: [0.5, 0.7],
    limbs: [0.5, 0.7],
    shoulders: [0.6, 0.8],
    legs: [0.35, 0.45],
    head: [0.45, 0.55],
    flesh: "shell",
    hands: "pincers",
    horns: "antennae",
    tail: "reptile",
    hair: "bald",
    mouth: "thin",
    colors: { skin: ["#a83a2a", "#3a5a6a", "#8a4a2a", "#4a6a5a"], eyes: ["#101010", "#202020"], primary: ["#6a3a2a", "#3a4a5a"], secondary: ["#5a3a2a", "#3a4a4a"] },
  },
  tyrshaug: {
    unarmed: "claw",
    height: [6, 6.8],
    build: [0.4, 0.6],
    limbs: [0.4, 0.55],
    shoulders: [0.55, 0.75],
    lower: "hocked",
    ears: "pointed",
    horns: "ram",
    tail: "thin",
    hair: ["short", "long", "mohawk"],
    beard: ["goatee", "goatee", "none"],
    mouth: ["grin", "smirk"],
    colors: { skin: ["#a05a4a", "#7a4a6a", "#b07a5a", "#6a3a3a"], hair: ["#2a1c14", "#1b1310", "#5a2a2a"], eyes: ["#e0c040", "#d03020"], primary: ["#5a2a3a", "#3a2a2a"], secondary: ["#3a2a20", "#4a3020", "#2a2020"], horn: ["#3a3028", "#5a4a3a"] },
    loadouts: [
      { weapon: "dagger", weaponStyle: "savage", offhand: "dagger", offhandStyle: "savage", weight: 2 },
      { weapon: "staff", weaponStyle: "savage", armor: { chest: { type: "cloth", style: "savage" } }, weight: 2 },
      { weapon: "bow", weaponStyle: "savage" },
    ],
  },
  drakel: {
    unarmed: "claw",
    height: [6.6, 7.6],
    build: [0.55, 0.75],
    limbs: [0.5, 0.7],
    shoulders: [0.7, 0.9],
    head: [0.5, 0.6],
    muzzle: "reptile",
    horns: "swept",
    wings: "bat",
    tail: "reptile",
    flesh: "shell",
    hair: "bald",
    colors: { skin: ["#8a2a1e", "#2a2a30", "#2a4a7a", "#3a6a34", "#9a6a2a"], eyes: ["#f0c020", "#e06020"], primary: ["#3a2a2a", "#5a4a3a"], secondary: ["#3a3430"], horn: ["#d8ccb0", "#3a3430"] },
    loadouts: [
      { weapon: "sword", weaponStyle: "fine", offhand: "shield", offhandStyle: "fine", armor: { chest: { type: "plate" }, shoulders: { type: "plate" } }, weight: 2 },
      { weapon: "polearm", weaponStyle: "fine", armor: { chest: { type: "chain" } }, weight: 2 },
      { weapon: "greatsword", weaponStyle: "fine", armor: { shoulders: { type: "plate" } } },
    ],
  },
  abomination: {
    unarmed: "claw",
    height: [9, 10],
    build: [0.95, 1],
    limbs: [0.85, 1],
    shoulders: [0.9, 1],
    waist: [0.95, 1],
    hips: [0.8, 1],
    arms: [0.6, 0.75],
    legs: [0.2, 0.3],
    head: [0.2, 0.3],
    jaw: [0.6, 0.9],
    flesh: "stitched",
    lowerArms: "pair",
    hair: "bald",
    mouth: ["grin", "frown"],
    colors: { skin: ["#a8b098", "#9a9aa8", "#b0a890", "#8a9a8a"], eyes: ["#e0e0a0", "#c0d040"], primary: ["#5a5048", "#4a4a4a"], secondary: ["#4a4038", "#3a3a3a"] },
    loadouts: [
      { weapon: "axe", weaponStyle: "crude", offhand: "axe", offhandStyle: "crude", weight: 2 },
      { weapon: "maul", weaponStyle: "crude" },
      { weight: 1 },
    ],
  },
  ghoul: {
    unarmed: "claw",
    gait: "shamble",
    flesh: "rotting",
    height: [5.4, 6],
    build: [0.05, 0.2],
    limbs: [0.05, 0.2],
    waist: [0.1, 0.3],
    arms: [0.75, 0.9],
    head: [0.45, 0.55],
    jaw: [0.3, 0.5],
    ears: "pointed",
    hair: ["bald", "bald", "long"],
    mouth: "grin",
    colors: { skin: ["#7a8a8a", "#8a8a7a", "#6a7a7a"], hair: ["#3a3430", "#5a5048"], eyes: ["#e0e040", "#e04020"], primary: ["#4a4a42", "#5a4a40"], secondary: ["#3a3430"] },
  },
  mummy: {
    unarmed: "claw",
    gait: "shamble",
    flesh: "wrapped",
    height: [5.8, 6.4],
    build: [0.2, 0.35],
    limbs: [0.2, 0.35],
    hair: "bald",
    mouth: "thin",
    colors: { skin: ["#d0c4a0", "#c0b490", "#b8a888"], primary: ["#c8bc98", "#b8ac88"], secondary: ["#c0b490"], eyes: ["#40c0f0", "#e0c040", "#40e080"] },
  },
  lich: {
    unarmed: "claw",
    height: [6.6, 7.4],
    build: [0.1, 0.2],
    limbs: [0.2, 0.3],
    waist: [0.1, 0.2],
    flesh: "bone",
    lower: "vortex",
    hair: "bald",
    weapon: "staff",
    weaponStyle: "fine",
    jewelry: ["crown"],
    armor: { chest: { type: "cloth", style: ["fine", "tattered"] }, shoulders: { type: "plate", style: "fine" } },
    colors: { skin: ["#d8d0b8", "#c8c0a8"], paint: ["#a03030", "#4040a0", "#30a060"], metal: ["#d4b050", "#c8ccd0"], primary: ["#3a2a4a", "#2a3a4a", "#1a1a2a"], secondary: ["#3a2a4a"], eyes: ["#40c0f0", "#a040f0"], wood: ["#3a3030", "#d8d0b8"] },
  },
  banshee: {
    unarmed: "claw",
    height: [5.6, 6.2],
    build: [0.1, 0.25],
    limbs: [0.1, 0.25],
    bust: [0.3, 0.5],
    lower: "vortex",
    flesh: "spirit",
    hair: ["long", "long", "dreadlocks"],
    mouth: ["full", "neutral"],
    colors: { skin: ["#a8c8d8", "#b8d8c8", "#c8c8e0"], hair: ["#d8e8f0", "#c0d0e0"], primary: ["#a0b8c8", "#b0c0d0"], secondary: ["#a0b8c8"], eyes: ["#e0f8ff", "#80c0ff"] },
  },
  ghost: {
    unarmed: "claw",
    height: [5.6, 6.4],
    build: [0.3, 0.6],
    lower: "vortex",
    flesh: "spirit",
    hair: ["short", "bald", "long", "receding"],
    beard: ["none", "none", "full"],
    mouth: ["frown", "neutral"],
    colors: { skin: ["#a8b8c8", "#b0c8c0"], hair: ["#d8e0e8"], primary: ["#98a8b8", "#a8b8b0"], secondary: ["#98a8b8"], eyes: ["#e0f8ff"] },
    loadouts: [{ weight: 3 }, { weapon: "sword", weaponStyle: "fine", armor: { chest: { type: "chain", style: "tattered" } } }],
  },
  deepshaug: {
    unarmed: "claw",
    height: [8, 9],
    build: [0.6, 0.85],
    limbs: [0.5, 0.7],
    shoulders: [0.85, 1],
    arms: [0.75, 0.85],
    head: [0.3, 0.4],
    lower: "vortex",
    flesh: "shadow",
    hair: "bald",
    mouth: "neutral",
    colors: { skin: "#2a1a3a", primary: "#2a1a3a", secondary: "#2a1a3a", eyes: ["#f0e0ff", "#ffe080"] },
  },
  smoulder: {
    height: [7.5, 8.5],
    build: [0.6, 0.8],
    limbs: [0.6, 0.8],
    shoulders: [0.75, 0.95],
    head: [0.4, 0.5],
    flesh: "molten",
    hair: "spiky",
    mouth: "grin",
    colors: { skin: ["#4a3028", "#3a2824"], hair: ["#ff8020", "#ffc040"], eyes: ["#fff0a0"], primary: ["#3a2a24"], secondary: ["#3a2a24"] },
    loadouts: [
      { weapon: "maul", weaponStyle: "savage", armor: { chest: { type: "plate", style: "savage", colors: ["#2a2420", "#a04020"] }, shoulders: { type: "plate", style: "savage", colors: ["#2a2420", "#a04020"] } }, weight: 2 },
      { weapon: "greatsword", weaponStyle: "savage", armor: { chest: { type: "plate", style: "savage", colors: ["#2a2420", "#a04020"] }, head: { type: "plate", style: "savage", colors: ["#2a2420", "#a04020"] } } },
    ],
  },
  treant: {
    height: [14, 18],
    build: [0.7, 0.9],
    limbs: [0.8, 1],
    shoulders: [0.7, 0.9],
    arms: [0.8, 0.9],
    legs: [0.3, 0.4],
    head: [0.3, 0.4],
    flesh: "bark",
    hair: "branches",
    mouth: "frown",
    colors: { skin: ["#5a4030", "#6a5038", "#4a3a2a"], hair: ["#4a3a2a", "#5a4030"], primary: ["#5a4030", "#4a3a2a"], secondary: ["#4a3a2a"], eyes: ["#c0e060", "#e0c040"], leaf: ["#4a7a3a", "#5a8a3a", "#8a6a2a", "#3a6a3a"] },
  },
  dryad: {
    height: [7, 7.6],
    build: [0.15, 0.3],
    limbs: [0.15, 0.3],
    shoulders: [0.3, 0.45],
    bust: [0.3, 0.6],
    lower: "horse",
    ears: "pointed",
    horns: ["none", "none", "antlers"],
    hair: "leaves",
    mouth: ["full", "smile", "neutral"],
    colors: { skin: ["#8aa86a", "#a0b880", "#c0a080", "#7a9a6a"], hair: ["#4a7a3a", "#6a9a3a", "#8a7a2a"], eyes: ["#e0c040", "#80e060"], primary: ["#5a7a3a", "#6a5a3a"], secondary: ["#9a6a40", "#8a5a34", "#a07a50"], horn: ["#6a5038"] },
    loadouts: [
      { weapon: "bow", weaponStyle: "fine", weight: 2 },
      { weapon: "staff", weaponStyle: "fine", colors: { wood: "#5a4030" } },
      { weapon: "polearm", weaponStyle: "fine" },
    ],
  },
  succubus: {
    unarmed: "claw",
    height: [6, 6.6],
    build: [0.2, 0.35],
    limbs: [0.2, 0.35],
    waist: [0.1, 0.25],
    hips: [0.6, 0.8],
    bust: [0.5, 0.8],
    rear: [0.5, 0.8],
    ears: "pointed",
    horns: ["swept", "ram"],
    wings: "bat",
    tail: "thin",
    hair: ["long", "ponytail", "bob"],
    mouth: ["smirk", "full"],
    colors: { skin: ["#a04a6a", "#7a3a7a", "#c06a6a", "#5a3a6a"], hair: ["#1a1018", "#f0e0d0", "#6a1a2a"], eyes: ["#f0d040", "#e04040"], primary: ["#2a1a2a", "#5a1a2a"], secondary: ["#2a1a2a"], horn: ["#2a2020", "#4a3a40"] },
    loadouts: [{ weapon: "dagger", weaponStyle: "fine", armor: { chest: { type: "leather", colors: ["#2a1a2a", "#a04040"] } }, weight: 2 }, { weapon: "wand", weaponStyle: "fine" }],
  },
  hivelord: {
    unarmed: "claw",
    height: [8, 9.5],
    build: [0.5, 0.7],
    limbs: [0.4, 0.6],
    shoulders: [0.7, 0.9],
    waist: [0.1, 0.3],
    head: [0.5, 0.6],
    muzzle: "insect",
    horns: "antennae",
    lowerArms: "pair",
    flesh: "chitin",
    hair: "bald",
    colors: { skin: ["#8a7040", "#5a4a30", "#3a3a2a", "#7a5a2a"], eyes: ["#40c0a0", "#c04020", "#e0c040"], primary: ["#6a5a30", "#4a3a2a"], secondary: ["#5a4a30"], horn: ["#2a2018", "#3a2a20"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "savage", armor: { shoulders: { type: "plate", style: "savage", colors: ["#c0a040", "#5a3a20"] } }, weight: 2 },
      { weapon: "sword", weaponStyle: "savage", offhand: "sword", offhandStyle: "savage" },
      { weapon: "staff", weaponStyle: "fine" },
    ],
  },
  cindershaug: {
    unarmed: "claw",
    height: [10, 12],
    build: [0.95, 1],
    limbs: [0.95, 1],
    shoulders: [0.95, 1],
    waist: [0.8, 1],
    arms: [0.8, 0.9],
    legs: [0.2, 0.3],
    head: [0.2, 0.3],
    jaw: [0.8, 1],
    flesh: "molten",
    horns: ["none", "small"],
    hair: "bald",
    mouth: "grin",
    colors: { skin: ["#3a3430", "#4a3a30", "#2a2a2a"], primary: ["#3a3430"], secondary: ["#3a3430"], eyes: ["#a0ff40", "#fff0a0"], horn: ["#2a2a2a"] },
  },
  golem: {
    height: [10, 12],
    build: [0.95, 1],
    limbs: [0.95, 1],
    shoulders: [0.95, 1],
    waist: [0.9, 1],
    arms: [0.75, 0.85],
    legs: [0.25, 0.35],
    head: [0.15, 0.25],
    jaw: [0.9, 1],
    flesh: "stone",
    hair: "bald",
    mouth: "thin",
    colors: { skin: ["#8a8a88", "#9a9488", "#7a7a80"], primary: ["#8a8a88", "#7a7a80"], secondary: ["#7a7a7a"], eyes: ["#40c0f0", "#f0a020"] },
  },
  mycosi: {
    height: [4.6, 5.6],
    build: [0.3, 0.5],
    limbs: [0.25, 0.45],
    legs: [0.3, 0.4],
    head: [0.55, 0.65],
    flesh: "fungal",
    hair: "cap",
    mouth: ["neutral", "smile", "frown"],
    colors: { skin: ["#e0d8c0", "#d8ccb0", "#c8c0a8"], hair: ["#a03a2a", "#8a5a30", "#c08a40", "#6a4a7a"], eyes: ["#101010", "#2a2a2a"], primary: ["#d8ccb0"], secondary: ["#c8c0a8"] },
    loadouts: [
      { weapon: "staff", weaponStyle: "crude", weight: 2 },
      { weapon: "mace", weaponStyle: "crude", offhand: "shield", offhandStyle: "crude" },
      { weight: 1 },
    ],
  },
  drakesh: {
    unarmed: "claw",
    height: [8.5, 9.5],
    build: [0.55, 0.75],
    limbs: [0.5, 0.7],
    shoulders: [0.7, 0.9],
    head: [0.5, 0.6],
    lower: "drake",
    muzzle: "reptile",
    horns: "swept",
    wings: ["bat", "none"],
    flesh: "shell",
    hair: "bald",
    colors: { skin: ["#8a2a1e", "#2a2a30", "#2a4a7a", "#3a6a34", "#9a6a2a"], eyes: ["#f0c020", "#e06020"], primary: ["#3a2a2a", "#5a4a3a"], secondary: ["#3a3430"], horn: ["#d8ccb0", "#3a3430"] },
    loadouts: [
      { weapon: "polearm", weaponStyle: "fine", armor: { chest: { type: "plate" }, shoulders: { type: "plate" } }, weight: 2 },
      { weapon: "greataxe", weaponStyle: "fine", armor: { shoulders: { type: "plate" } }, weight: 2 },
      { weapon: "sword", weaponStyle: "fine", offhand: "shield", offhandStyle: "fine", armor: { chest: { type: "chain" } } },
    ],
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
  elephant: {
    height: [11, 13],
    build: [0.4, 0.7],
    colors: { skin: ["#8a8580", "#7a756e", "#9a8a80"], hair: ["#6a655e", "#5a554e"], secondary: ["#6a655e"], eyes: ["#2a2018"] },
  },
  crocodile: {
    height: [1.3, 1.5],
    build: [0.5, 0.7],
    colors: { skin: ["#3a4a2a", "#4a4a30"], hair: ["#2a3420", "#2a2e20"], secondary: ["#b0a878", "#a09868"], eyes: ["#c8a020"] },
  },
  hyena: {
    height: [2.9, 3.3],
    build: [0.4, 0.6],
    colors: { skin: ["#a08a60", "#b09a6a", "#8a7a58"], hair: ["#3a2a1a", "#2a2018"], secondary: ["#2a2018"], eyes: ["#c8a040", "#a07030"] },
  },
  lion: {
    height: [3.6, 4.2],
    build: [0.45, 0.7],
    colors: { skin: ["#c89a58", "#b88a4a", "#d0a868"], hair: ["#7a4a20", "#5a3418", "#a06a30"], secondary: ["#3a2a20"], eyes: ["#c8a040", "#b09030"] },
  },
  tiger: {
    height: [3.4, 4],
    build: [0.45, 0.7],
    colors: { skin: ["#d07a2a", "#c86a20", "#e0e0d8"], hair: ["#1a1410", "#2a1a10"], secondary: ["#3a2a20"], eyes: ["#c8a040", "#80b0d0"] },
  },
  deshaug: {
    height: [3.8, 4.4],
    build: [0.5, 0.75],
    flesh: "fire",
    colors: { skin: ["#5a2a1e", "#4a2420", "#3a2a2a"], hair: ["#2a1a14", "#1a1410"], secondary: ["#ff8020"], eyes: ["#a0ff40", "#fff0a0"] },
  },
  coalhound: {
    height: [4, 4.6],
    build: [0.55, 0.8],
    flesh: "molten",
    colors: { skin: ["#3a3430", "#2a2624", "#4a3a30"], hair: ["#1a1614", "#2a2420"], secondary: ["#ff8020"], eyes: ["#ffc040", "#ff6020"] },
  },
  rhino: {
    height: [5.5, 6.5],
    build: [0.5, 0.8],
    colors: { skin: ["#8a8580", "#7a756e", "#6a6560"], hair: ["#6a655e"], secondary: ["#a8a094", "#9a9488"], eyes: ["#2a2018"] },
  },
  hippo: {
    height: [4.6, 5.4],
    build: [0.6, 0.9],
    colors: { skin: ["#7a6a70", "#6a5a62", "#8a7068"], hair: ["#5a4a50"], secondary: ["#c09090", "#b08880"], eyes: ["#2a2018"] },
  },
  mammoth: {
    height: [12, 14],
    build: [0.5, 0.8],
    colors: { skin: ["#5a3e28", "#4a3020", "#6a4a30"], hair: ["#4a3020", "#3a2618", "#6a4a2a"], secondary: ["#3a2a20"], eyes: ["#2a2018"] },
  },
  deer: {
    height: [4.3, 4.8],
    build: [0.3, 0.5],
    colors: { skin: ["#a06a3a", "#9a6a40", "#8a5a34"], hair: ["#6a4426", "#5a3a22"], eyes: ["#1a1010"] },
  },
  goat: {
    height: [3.1, 3.5],
    build: [0.35, 0.55],
    colors: { skin: ["#e0d8c8", "#8a6a4a", "#3a3028", "#c0b098"], hair: ["#a09080", "#5a4a3a", "#2a2420"], eyes: ["#c8a040"] },
  },
  sheep: {
    height: [3, 3.4],
    build: [0.5, 0.7],
    colors: { skin: ["#3a3028", "#e0d8c8", "#2a2420"], hair: ["#e8e0d0", "#d8d0c0", "#f0ece0", "#4a4038"], eyes: ["#c8a040"] },
  },
  cow: {
    height: [5, 5.6],
    build: [0.5, 0.75],
    colors: { skin: ["#e8e0d0", "#e0d8c8", "#a06a3a"], hair: ["#2a2420", "#1a1614", "#6a4028"], secondary: ["#d8a8a0"], eyes: ["#1a1010"] },
  },
  turtle: {
    height: [1.4, 1.8],
    build: [0.4, 0.6],
    colors: { skin: ["#6a7a4a", "#5a6a3a", "#7a7a5a"], hair: ["#4a5a2a", "#5a4a2a", "#3a4a3a"], secondary: ["#c8c090", "#b0b080"], eyes: ["#1a1010", "#c8a020"] },
  },
  tortoise: {
    height: [2.8, 3.4],
    build: [0.5, 0.7],
    colors: { skin: ["#8a7a5a", "#7a6a50"], hair: ["#6a5030", "#5a4a30", "#7a6040"], secondary: ["#c0a878"], eyes: ["#1a1010"] },
  },
  gorilla: {
    height: [4.6, 5.2],
    build: [0.5, 0.8],
    colors: { skin: ["#2a2624", "#3a3230", "#1e1c1a"], hair: ["#4a4440", "#8a8480", "#1a1816"], secondary: ["#3a3432"], eyes: ["#2a1a10"] },
  },
  owlbear: {
    height: [4.4, 5],
    build: [0.5, 0.8],
    colors: { skin: ["#6a5038", "#5a4430", "#7a6a50"], hair: ["#8a7050", "#a08868", "#5a4a3a"], secondary: ["#d8b850", "#c8a040"], eyes: ["#f0c020", "#e08020"] },
  },
  myoxa: {
    height: [4.8, 5.6],
    build: [0.6, 0.9],
    flesh: "fungal",
    colors: { skin: ["#d8ccb0", "#c8c0a8", "#a8a090"], hair: ["#a03a2a", "#8a5a30", "#6a4a7a", "#c08a40"], secondary: ["#8a8070"], eyes: ["#101010", "#e0c040"] },
  },
  crab: {
    height: [2.5, 3.5],
    build: [0.5, 0.8],
    limbs: [0.5, 0.8],
    colors: { skin: ["#b04a2a", "#8a3a2a", "#4a6a7a", "#7a5a3a"], secondary: ["#e0c8a0", "#d8b890"], hair: ["#2a1a14", "#e0d0b0"], eyes: ["#101010"] },
  },
  ant: {
    height: [2.5, 3.2],
    build: [0.4, 0.7],
    limbs: [0.4, 0.6],
    colors: { skin: ["#3a1a14", "#1a1414", "#8a3a1a"], secondary: ["#5a2a1a", "#2a2020"], hair: ["#2a1410", "#1a1010"], eyes: ["#101010", "#2a2a2a"] },
  },
  hivari: {
    height: [5, 6],
    build: [0.5, 0.8],
    limbs: [0.5, 0.8],
    colors: { skin: ["#8a7040", "#5a4a30", "#3a3a2a"], secondary: ["#c0a040", "#6a3a6a", "#3a6a5a"], hair: ["#2a2018", "#3a2a20"], eyes: ["#40c0a0", "#c04020"] },
  },
  wasp: {
    height: [4, 5],
    build: [0.4, 0.7],
    limbs: [0.4, 0.6],
    colors: { skin: ["#1a1614", "#2a2018"], secondary: ["#e0b020", "#d09a20", "#c04020"], hair: ["#1a1410"], eyes: ["#2a1a10", "#802020"] },
  },
  centipede: {
    height: [1.4, 2],
    build: [0.4, 0.7],
    colors: { skin: ["#7a3a1a", "#5a2a1a", "#3a2a20", "#8a6a2a"], secondary: ["#c08040", "#b07030"], hair: ["#2a1a10", "#e0a040"], eyes: ["#101010"] },
  },
  duneshk: {
    height: [18, 24],
    build: [0.4, 0.7],
    colors: { skin: ["#b09060", "#a08050", "#c0a070"], secondary: ["#d8c090", "#e0c8a0"], hair: ["#8a6a40"], eyes: ["#101010"] },
  },
  eel: {
    height: [1.2, 1.6],
    build: [0.4, 0.7],
    colors: { skin: ["#3a4a3a", "#4a4a30", "#2a3a4a"], secondary: ["#a0a070", "#c0b080"], hair: ["#2a3428", "#3a3a28"], eyes: ["#e0c040", "#101010"] },
  },
  coatl: {
    height: [5, 6],
    build: [0.3, 0.6],
    colors: { skin: ["#2a8a5a", "#3a7a8a", "#4a9a4a"], secondary: ["#e0c040", "#e0a040"], hair: ["#c03030", "#3050c0", "#e0a020"], eyes: ["#e0c020", "#101010"] },
  },
  piranha: {
    height: [1.2, 1.8],
    build: [0.5, 0.8],
    colors: { skin: ["#6a7078", "#5a6068", "#7a7a70"], secondary: ["#c03a2a", "#d05a30"], hair: ["#5a5a60", "#3a3a40"], eyes: ["#e0a020", "#d03020"] },
  },
  seaturtle: {
    height: [6, 8],
    build: [0.5, 0.8],
    colors: { skin: ["#5a6a3a", "#6a5a3a", "#4a5a4a"], secondary: ["#d8c890", "#e0d0a0"], hair: ["#4a4a2a", "#5a4a2a"], eyes: ["#101010"] },
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
  for (const [key, options] of Object.entries({ muzzle: MUZZLE, horns: HORNS, tail: TAIL, wings: WINGS, flesh: FLESH, gait: GAIT, unarmed: UNARMED, lower: LOWER, hands: HANDS, lowerArms: LOWER_ARMS })) {
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
