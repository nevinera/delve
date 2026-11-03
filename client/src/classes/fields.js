import { SOUNDS, VISUALS } from "../abilities/stock.js";
import { ARMOR_TYPES } from "../character/armor.js";
import { HELD, OFFHANDS } from "../character/weapons.js";

// What the class editor's forms hold, by the formats in formats.md. Fields that pick a status or a
// resource take their options from the class being edited.

const SCHOOLS = ["physical", "holy", "fire", "nature", "frost", "shadow", "arcane"];
const DISPELS = ["magic", "curse", "poison", "disease", "enrage"];
const CREATURE_TYPES = ["beast", "humanoid", "undead", "elemental", "demon", "dragonkin", "giant", "mechanical", "aberration", "critter"];
const STATS = ["strength", "agility", "intellect", "stamina", "armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating", "attackPower", "spellPower", "maxHealth", "critChance", "critDamage", "haste", "mastery", "versatility", "leech", "avoidance", "dodge", "parry", "block", "movementSpeed", "attackSpeed", "stealth", "detection", "damageDone", "healingDone", "damageTaken", "healingTaken", "threat"];
const WHEN = ["cast", "launch", "impact", "channel"];
const ON = ["caster", "target", "ground"];

const is = (...types) => (value) => types.includes(value.type);
const statusesOf = (made) => () => (made.statuses ?? []).map((s) => [s.id, s.name || s.id]);
const resourcesOf = (made) => () => (made.resources ?? []).map((r) => [r.key, r.name || r.key]);
const main = { key: "colors", type: "words", label: "colors", hint: "[main, trim]: two #rrggbb colors, with commas" };

const conditionFields = (made) => [
  { key: "kind", type: "select", label: "needs", options: [["health", "health"], ["status", "a status"], ["stealthed", "stealth"], ["inCombat", "combat"]] },
  { key: "health", type: "select", options: ["self", "target"], show: (c) => c.kind === "health" },
  { key: "below", type: "number", label: "below %", min: 0, show: (c) => c.kind === "health" },
  { key: "above", type: "number", label: "above %", min: 0, show: (c) => c.kind === "health" },
  { key: "status", type: "select", none: "pick one", options: statusesOf(made), show: (c) => c.kind === "status" },
  { key: "on", type: "select", options: ["self", "target"], show: (c) => c.kind === "status" },
  { key: "yes", type: "check", label: "true", default: true, show: (c) => c.kind === "stealthed" || c.kind === "inCombat" },
];

// A condition as the form edits it, with the `kind` the format leaves implicit.
export function readCondition(condition) {
  if ("health" in condition) return { kind: "health", ...condition };
  if ("status" in condition) return { kind: "status", ...condition };
  const kind = "stealthed" in condition ? "stealthed" : "inCombat" in condition ? "inCombat" : "health";
  return kind === "health" ? { kind, health: "self" } : { kind, yes: condition[kind] };
}

// That back as the format has it.
export function writeCondition({ kind, ...c }) {
  if (kind === "health") return { health: c.health ?? "self", ...(c.below !== undefined ? { below: c.below } : c.above !== undefined ? { above: c.above } : { below: 100 }) };
  if (kind === "status") return { status: c.status ?? "", on: c.on ?? "self" };
  return { [kind]: c.yes ?? true };
}

const effectFields = (made) => [
  { key: "type", type: "select", options: ["damage", "heal", "resource", "status", "interrupt", "taunt", "move", "dispel", "resurrect"] },
  { key: "affects", type: "select", options: ["target", "self", "enemies", "allies"] },
  { key: "around", type: "select", none: "self", options: ["target", "ground"], show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "radius", type: "number", label: "radius ft", min: 0, show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "height", type: "number", label: "height ft", min: 0, hint: "above and below its center, 15 by default", show: (e) => e.type !== "move" && ["enemies", "allies"].includes(e.affects) },
  { key: "cone", type: "number", label: "cone °", min: 0, hint: "a slice in front of you, around yourself only", show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "max", type: "number", label: "at most", min: 1, step: 1, hint: "how many it hits, nearest first", show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "amount", type: "amount", show: is("damage", "heal", "resource") },
  { key: "school", type: "select", none: "the ability's", options: SCHOOLS, show: is("damage") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: is("resource") },
  { key: "status", type: "select", none: "pick one", options: statusesOf(made), show: is("status") },
  { key: "duration", type: "number", label: "duration s", min: 0, hint: "how long it lasts", show: is("status", "taunt") },
  { key: "lockout", type: "number", label: "lockout s", min: 0, show: is("interrupt") },
  { key: "kind", type: "select", options: ["charge", "leap", "knockback", "pull", "blink"], show: is("move") },
  { key: "distance", type: "number", label: "distance ft", min: 0, show: (e) => e.type === "move" && ["knockback", "blink"].includes(e.kind) },
  { key: "speed", type: "number", label: "speed ft/s", min: 0, show: (e) => e.type === "move" && e.kind === "charge" },
  { key: "height", type: "number", label: "arc ft", min: 0, show: (e) => e.type === "move" && ["leap", "knockback"].includes(e.kind) },
  { key: "dispels", type: "multi", label: "removes", options: DISPELS, show: is("dispel") },
  { key: "count", type: "number", label: "how many", min: 1, step: 1, show: is("dispel") },
  { key: "health", type: "number", label: "health %", min: 0, show: is("resurrect") },
];

export const blankEffect = () => ({ type: "damage", affects: "target" });

export const classFields = (made) => [
  { key: "name" },
  { key: "description", type: "area" },
  { key: "colors", type: "group", fields: [{ key: "major", type: "color" }, { key: "minor", type: "color" }] },
  { key: "primaryStats", label: "primary stats", type: "multi", options: ["strength", "agility", "intellect"], hint: "gear rolled for the class uses the first" },
  {
    key: "resources",
    type: "list",
    one: "resource",
    limit: 3,
    blank: () => ({ key: "", name: "", kind: "mana", color: "#4080e0" }),
    fields: [
      { key: "key", hint: "what abilities call it: lowercase letters, digits and _" },
      { key: "name" },
      { key: "kind", type: "select", options: ["mana", "energy", "rage", "points"] },
      { key: "color", type: "color" },
      { key: "max", type: "number", min: 1, step: 1, show: (r) => r.kind === "points" },
      { key: "regen", type: "number", label: "regen /s", min: 0, show: (r) => r.kind === "points" },
      { key: "decay", type: "number", label: "decay /s", min: 0, show: (r) => r.kind === "points" },
    ],
  },
  { key: "armor", type: "list", one: "armor type", blank: () => ({ type: "cloth", level: 1 }), fields: [{ key: "type", type: "select", options: ARMOR_TYPES }, { key: "level", type: "number", min: 1, step: 1 }] },
  { key: "weapons", type: "multi", options: Object.keys(HELD).filter((type) => !["shield", "orb"].includes(type)) },
  { key: "offhands", type: "multi", options: OFFHANDS.filter((type) => type !== "none") },
  { key: "passives", type: "list", one: "passive", blank: () => ({ status: "", level: 1 }), fields: [{ key: "status", type: "select", none: "pick one", options: statusesOf(made) }, { key: "level", type: "number", min: 1, step: 1 }] },
  { key: "mastery", type: "group", fields: [{ key: "name" }, { key: "description", type: "area" }, { key: "status", type: "select", none: "pick one", options: statusesOf(made) }] },
  { key: "startingGear", label: "starting gear", type: "words", hint: "item ids, with commas" },
  { key: "tags", type: "words" },
  { key: "notes", type: "area" },
];

export const abilityFields = (made) => [
  { key: "name" },
  { key: "level", type: "number", min: 1, step: 1 },
  { key: "description", type: "area" },
  { key: "icon" },
  { key: "school", type: "select", none: "none", options: SCHOOLS },
  { key: "target", type: "select", options: ["enemy", "ally", "self", "ground", "none"] },
  { key: "range", type: "distance", show: (a) => a.target !== "self" && a.target !== "none" },
  { key: "minRange", label: "min range", type: "number", min: 0, show: (a) => a.target !== "self" && a.target !== "none" },
  { key: "facing", type: "check", label: "must face", default: true, show: (a) => a.target === "enemy" },
  { key: "castTime", label: "cast s", type: "number", min: 0, hint: "0 is instant" },
  { key: "castWhileMoving", label: "cast moving", type: "check" },
  { key: "channel", type: "group", fields: [{ key: "duration", label: "duration s", type: "number", min: 0 }, { key: "ticks", type: "number", min: 1, step: 1 }] },
  { key: "speed", label: "projectile ft/s", type: "number", min: 0, hint: "leave it out for one that lands at once" },
  { key: "gcd", label: "GCD s", type: "number", min: 0, hint: "1.5 by default, 0 is off it" },
  { key: "gcdHasted", label: "GCD hasted", type: "check", default: true },
  { key: "cooldown", label: "cooldown s", type: "number", min: 0 },
  { key: "charges", type: "number", min: 1, step: 1 },
  { key: "cooldownHasted", label: "cooldown hasted", type: "check" },
  { key: "cost", type: "list", one: "cost", blank: () => ({ resource: "" }), fields: [{ key: "resource", type: "select", none: "pick one", options: resourcesOf(made) }, { key: "amount", type: "number", min: 0 }, { key: "percent", label: "or % of base", type: "number", min: 0 }] },
  { key: "requires", type: "list", one: "condition", blank: () => ({ kind: "health", health: "target" }), read: readCondition, write: writeCondition, fields: conditionFields(made) },
  { key: "creatureTypes", label: "only on", type: "multi", options: CREATURE_TYPES },
  { key: "effects", type: "list", one: "effect", blank: blankEffect, fields: effectFields(made) },
  {
    key: "visuals",
    type: "list",
    one: "visual",
    blank: () => ({ effect: VISUALS[0], when: "impact" }),
    fields: [
      { key: "effect", type: "select", options: VISUALS },
      { key: "when", type: "select", options: WHEN },
      { key: "on", type: "select", none: "by when", options: ON },
      main,
      { key: "scale", type: "number", min: 0 },
    ],
  },
  {
    key: "sounds",
    type: "list",
    one: "sound",
    blank: () => ({ sound: SOUNDS[0], when: "cast" }),
    fields: [
      { key: "sound", type: "select", options: SOUNDS },
      { key: "when", type: "select", options: WHEN },
      { key: "on", type: "select", none: "by when", options: ON },
      { key: "volume", type: "number", min: 0 },
      { key: "pitch", type: "number", min: 0 },
    ],
  },
  { key: "tags", type: "words" },
  { key: "notes", type: "area" },
];

const statusEffectFields = (made) => [
  { key: "type", type: "select", options: ["stat", "periodic", "absorb", "control", "trigger", "stealth", "none"] },
  { key: "stat", type: "select", none: "pick one", options: STATS, show: is("stat") },
  { key: "add", type: "number", show: is("stat") },
  { key: "multiply", type: "number", show: is("stat") },
  { key: "school", type: "select", none: "any", options: SCHOOLS, show: is("stat", "periodic") },
  { key: "every", label: "every s", type: "number", min: 0, show: is("periodic") },
  { key: "does", type: "select", options: ["damage", "heal", "resource"], show: is("periodic") },
  { key: "amount", type: "amount", show: is("periodic", "absorb") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: (e) => e.type === "periodic" && e.does === "resource" },
  { key: "schools", type: "multi", options: SCHOOLS, show: is("absorb") },
  { key: "control", type: "select", options: ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm"], show: is("control") },
  { key: "on", type: "select", options: ["dealDamage", "takeDamage", "heal", "crit", "cast", "dodge", "parry", "block", "healthBelow"], show: is("trigger") },
  { key: "threshold", label: "below %", type: "number", min: 0, show: (e) => e.type === "trigger" && e.on === "healthBelow" },
  { key: "chance", type: "number", min: 0, hint: "0 to 1, 1 by default", show: is("trigger") },
  { key: "cooldown", label: "cooldown s", type: "number", min: 0, show: is("trigger") },
  { key: "effect", type: "group", fields: effectFields(made), show: is("trigger") },
  { key: "when", type: "list", one: "condition", blank: () => ({ kind: "health", health: "self" }), read: readCondition, write: writeCondition, fields: conditionFields(made) },
];

export const statusFields = (made) => [
  { key: "name" },
  { key: "description", type: "area" },
  { key: "icon" },
  { key: "kind", type: "select", options: ["buff", "debuff", "hidden"] },
  { key: "dispel", type: "select", none: "can't be", options: DISPELS },
  { key: "duration", label: "duration s", type: "number", min: 0, hint: "leave it out for one that lasts until removed" },
  { key: "stacking", type: "select", none: "refresh", options: ["replace", "stack"] },
  { key: "maxStacks", label: "max stacks", type: "number", min: 1, step: 1, show: (s) => s.stacking === "stack" },
  { key: "breaksOn", label: "breaks on", type: "multi", options: ["move", "damage", "action"] },
  { key: "pose", type: "select", none: "none", options: ["sit"] },
  { key: "aura", type: "group", fields: [{ key: "effect", type: "select", none: "none", options: VISUALS }, main] },
  { key: "effects", type: "list", one: "effect", blank: () => ({ type: "stat" }), fields: statusEffectFields(made) },
  { key: "notes", type: "area" },
];
