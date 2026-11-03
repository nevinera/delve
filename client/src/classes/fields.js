import { SOUNDS, VISUALS } from "../abilities/stock.js";
import { ARMOR_TYPES } from "../character/armor.js";
import { HELD, OFFHANDS } from "../character/weapons.js";
import { TALENT_TIERS, TALENT_TIER_STEP } from "./classFile.js";

// What the class editor's forms hold, by the formats in formats.md. Fields that pick a status or a
// resource take their options from the class being edited.
const SCHOOLS = ["physical", "holy", "fire", "nature", "frost", "shadow", "arcane"];
const DISPELS = ["magic", "curse", "poison", "disease", "enrage"];
const CREATURE_TYPES = ["beast", "humanoid", "undead", "elemental", "demon", "dragonkin", "giant", "mechanical", "aberration", "critter"];
const STATS = ["strength", "agility", "intellect", "stamina", "armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating", "attackPower", "spellPower", "maxHealth", "critChance", "critDamage", "haste", "mastery", "versatility", "leech", "avoidance", "dodge", "parry", "block", "movementSpeed", "attackSpeed", "stealth", "detection", "damageDone", "healingDone", "damageTaken", "healingTaken", "threat"];
const WHEN = ["cast", "launch", "impact", "channel"];
const ON = ["caster", "target", "ground"];

const is = (...types) => (value) => types.includes(value.type);
const abilitiesOf = (made) => () => (made.abilities ?? []).map((a) => [a.id, a.name || a.id]);
const statusesOf = (made) => () => (made.statuses ?? []).map((s) => [s.id, s.name || s.id]);
const TRIGGERS = ["dealDamage", "takeDamage", "heal", "healed", "overheal", "crit", "nonCrit", "dodge", "parry", "block", "cast", "channelEnd", "spend", "kill", "interrupt", "dispel", "pickup", "healthBelow", "allyHealthBelow", "wouldDie", "statusGained", "statusConsumed", "statusEnds", "dispelled", "holderDies"];
const triggerOn = (...events) => (e) => e.type === "trigger" && events.includes(e.on);
const CHANGES = ["cost", "cooldown", "amount", "absorb", "lockout", "cone", "distance", "limit", "uses", "delay", "cooldownRate", "tickRate", "channelDuration", "channelTicks", "castTime", "charges", "range", "radius", "maxTargets", "duration", "damage", "healing", "critChance", "critDamage", "maxStacks"];
// What a modify can change: the built-in values, and every param the class has named.
const changesOf = (made) => () => {
  const named = [...(made.abilities ?? []), ...(made.statuses ?? [])].flatMap((o) => (o.effects ?? []).map((e) => e.param)).filter(Boolean);
  return [...CHANGES, ...new Set(named)];
};
const unitsOf = (made) => () => (made.units ?? []).map((u) => [u.id, u.name || u.id]);
const resourcesOf = (made) => () => (made.resources ?? []).map((r) => [r.key, r.name || r.key]);
const main = { key: "colors", type: "words", label: "colors", hint: "[main, trim]: two #rrggbb colors, with commas" };

const simpleConditionFields = (made) => [
  { key: "kind", type: "select", label: "needs", options: [["health", "health"], ["status", "a status"], ["stealthed", "stealth"], ["inCombat", "combat"], ["targetIs", "used on"], ["state", "a state"], ["position", "position"], ["since", "time since"], ["resource", "a resource"], ["holders", "units holding"], ["unitsOut", "a unit out"], ["inArea", "in your area"], ["spentAtLeast", "spent at least"], ["targetsHitAtLeast", "hit at least"], ["outcome", "the hit"], ["targetHealthBelowMine", "target under your health"]] },
  { key: "state", type: "select", options: ["casting", "inCombat", "slowed", "airborne", "falling", "controlled", "stunned", "outdoors"], show: (c) => c.kind === "state" },
  { key: "position", type: "select", options: ["behind", "inFront"], show: (c) => c.kind === "position" },
  { key: "since", type: "select", options: ["stealth", "attack", "damageTaken", "kill", "combatStart"], show: (c) => c.kind === "since" },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: (c) => c.kind === "resource" },
  { key: "percent", type: "check", label: "in percent", show: (c) => c.kind === "resource" },
  { key: "holders", label: "of status", type: "select", none: "pick one", options: statusesOf(made), show: (c) => c.kind === "holders" },
  { key: "atLeast", type: "number", label: "at least", min: 0, step: 1, show: (c) => c.kind === "holders" },
  { key: "atMost", type: "number", label: "at most", min: 0, step: 1, show: (c) => c.kind === "holders" },
  { key: "unitsOut", label: "units", type: "multi", options: unitsOf(made), show: (c) => c.kind === "unitsOut" },
  { key: "inArea", label: "of ability", type: "select", none: "pick one", options: abilitiesOf(made), show: (c) => c.kind === "inArea" },
  { key: "spentAtLeast", label: "points", type: "number", min: 0, show: (c) => c.kind === "spentAtLeast" },
  { key: "targetsHitAtLeast", label: "targets", type: "number", min: 1, step: 1, show: (c) => c.kind === "targetsHitAtLeast" },
  { key: "outcome", type: "select", options: ["crit", "survived"], show: (c) => c.kind === "outcome" },
  { key: "targetIs", type: "select", label: "used on", options: ["enemy", "ally", "self", "other", "player", "nonPlayer"], show: (c) => c.kind === "targetIs" },
  { key: "stacks", type: "number", label: "at stacks", min: 1, step: 1, show: (c) => c.kind === "status" },
  { key: "health", type: "select", options: ["self", "target"], show: (c) => c.kind === "health" },
  { key: "below", type: "number", label: "below", min: 0, show: (c) => ["health", "since", "resource"].includes(c.kind) },
  { key: "above", type: "number", label: "above", min: 0, show: (c) => ["health", "since", "resource"].includes(c.kind) },
  { key: "status", type: "select", none: "pick one", options: statusesOf(made), show: (c) => c.kind === "status" },
  { key: "on", type: "select", options: ["self", "target"], show: (c) => c.kind === "status" || c.kind === "state" },
  { key: "yes", type: "check", label: "true", default: true, show: (c) => c.kind === "stealthed" || c.kind === "inCombat" },
];

const perCountField = (made) => ({
  key: "perCount",
  label: "per count of",
  type: "group",
  fields: [
    { key: "statusStacks", label: "stacks of", type: "select", none: "none", options: statusesOf(made) },
    { key: "statusesFromMe", label: "your statuses on the target", type: "check" },
    { key: "statusesOnTarget", label: "of these on the target", type: "multi", options: statusesOf(made) },
    { key: "unitsOut", label: "units out", type: "multi", options: unitsOf(made) },
    { key: "resource", type: "select", none: "none", options: resourcesOf(made) },
    { key: "add", type: "number", hint: "this much per count, not the whole amount again" },
    { key: "max", type: "number", min: 0, hint: "the most it counts" },
  ],
});

const conditionFields = (made) => [
  ...simpleConditionFields(made).map((f) => (f.key === "kind" ? { ...f, options: [...f.options, ["anyOf", "any of"], ["not", "not"]] } : f)),
  { key: "not", type: "list", one: "condition", blank: () => ({ kind: "status", on: "self" }), read: readCondition, write: writeCondition, fields: simpleConditionFields(made), show: (c) => c.kind === "not" },
  { key: "anyOf", type: "list", one: "condition", blank: () => ({ kind: "status", on: "self" }), read: readCondition, write: writeCondition, fields: simpleConditionFields(made), show: (c) => c.kind === "anyOf" },
];

// A condition as the form edits it, with the `kind` the format leaves implicit.
const PLAIN_CONDITIONS = ["state", "position", "since", "resource", "holders", "unitsOut", "inArea", "spentAtLeast", "targetsHitAtLeast", "outcome", "targetHealthBelowMine"];

export function readCondition(condition) {
  if ("health" in condition) return { kind: "health", ...condition };
  if ("status" in condition) return { kind: "status", ...condition };
  if ("anyOf" in condition) return { kind: "anyOf", anyOf: condition.anyOf.map(readCondition) };
  if ("not" in condition) return { kind: "not", not: [readCondition(condition.not)] };
  if ("targetIs" in condition) return { kind: "targetIs", targetIs: condition.targetIs };
  const plain = PLAIN_CONDITIONS.find((key) => key in condition);
  if (plain) return { kind: plain, ...condition };
  const kind = "stealthed" in condition ? "stealthed" : "inCombat" in condition ? "inCombat" : "health";
  return kind === "health" ? { kind, health: "self" } : { kind, yes: condition[kind] };
}

// That back as the format has it.
export function writeCondition({ kind, ...c }) {
  if (kind === "health") return { health: c.health ?? "self", ...(c.below !== undefined ? { below: c.below } : c.above !== undefined ? { above: c.above } : { below: 100 }) };
  if (kind === "status") return { status: c.status ?? "", on: c.on ?? "self", ...(c.stacks !== undefined ? { stacks: c.stacks } : {}) };
  if (kind === "not") return { not: writeCondition(c.not?.[0] ?? { kind: "status" }) };
  if (kind === "targetIs") return { targetIs: c.targetIs ?? "enemy" };
  if (kind === "anyOf") return { anyOf: (c.anyOf ?? []).map(writeCondition) };
  if (kind === "targetHealthBelowMine") return { targetHealthBelowMine: true };
  if (PLAIN_CONDITIONS.includes(kind)) return c;
  return { [kind]: c.yes ?? true };
}

const effectFields = (made, nested = false) => [
  { key: "type", type: "select", options: ["damage", "heal", "resource", "status", "interrupt", "taunt", "move", "dispel", "consume", "cooldown", "summon", "command", "area", "resurrect"] },
  { key: "affects", type: "select", options: ["target", "self", "enemies", "allies"] },
  { key: "around", type: "select", none: "self", options: ["target", "ground"], show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "radius", type: "number", label: "radius ft", min: 0, show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "height", type: "number", label: "height ft", min: 0, hint: "above and below its center, 15 by default", show: (e) => e.type !== "move" && ["enemies", "allies"].includes(e.affects) },
  { key: "cone", type: "number", label: "cone °", min: 0, hint: "a slice in front of you, around yourself only", show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "max", type: "number", label: "at most", min: 1, step: 1, hint: "how many it hits", show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "prefers", type: "select", none: "nearest", options: ["injured", "farthest", "lowestHealth"], show: (e) => e.max !== undefined },
  { key: "amount", type: "amount", show: is("damage", "heal", "resource") },
  { key: "param", label: "named", hint: "a name other things can change this number by", show: is("damage", "heal") },
  { key: "when", type: "list", one: "condition", blank: () => ({ kind: "status", on: "self" }), read: readCondition, write: writeCondition, fields: conditionFields(made) },
  { key: "chance", type: "number", min: 0, hint: "0 to 1, 1 by default" },
  { key: "chancePerSpent", label: "chance per point", type: "number", min: 0 },
  { key: "category", hint: "a word like bleed or disease that stats and triggers can look for", show: is("damage", "heal") },
  { ...perCountField(made), show: is("damage", "heal", "resource", "status") },
  { key: "softCap", label: "soft cap", type: "number", min: 1, step: 1, hint: "past this many hit, they share this many's worth", show: is("damage", "heal") },
  { key: "perTargetHit", label: "per target hit", type: "check", show: is("damage", "heal", "resource", "cooldown") },
  { key: "maxTotal", label: "at most", type: "number", min: 0, show: (e) => Boolean(e.perTargetHit) },
  { key: "exceptTarget", label: "not the target", type: "check", show: (e) => ["enemies", "allies"].includes(e.affects) },
  { key: "school", type: "select", none: "the ability's", options: SCHOOLS, show: is("damage") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: is("resource") },
  { key: "status", type: "select", none: "pick one", options: statusesOf(made), show: is("status", "consume") },
  { key: "stacks", type: "number", min: 1, step: 1, hint: "all of them by default", show: is("consume") },
  { key: "lasts", label: "lasts s", type: "number", min: 0, show: is("area") },
  { key: "every", label: "every s", type: "number", min: 0, show: is("area") },
  { key: "limit", label: "at most out", type: "number", min: 1, step: 1, show: is("area") },
  ...(nested ? [] : [{ key: "effect", label: "each time", type: "group", fields: effectFields(made, true), show: is("area") }]),
  { key: "unit", type: "select", none: "pick one", options: unitsOf(made), show: is("summon") },
  { key: "count", type: "number", min: 1, step: 1, show: is("summon") },
  { key: "lasts", label: "lasts s", type: "number", min: 0, hint: "left out, until it dies or is dismissed", show: is("summon") },
  { key: "max", label: "at most out", type: "number", min: 1, step: 1, show: is("summon") },
  { key: "obeys", type: "check", show: is("summon") },
  { key: "statuses", label: "arrives with", type: "multi", options: statusesOf(made), show: is("summon") },
  { key: "ability", type: "select", none: "pick one", options: abilitiesOf(made), show: is("command") },
  { key: "source", label: "done by", type: "select", none: "the caster", options: ["summons"], show: is("damage", "heal") },
  { key: "units", type: "multi", options: unitsOf(made), show: (e) => e.type === "command" || e.affects === "summons" },
  { key: "abilities", type: "multi", options: abilitiesOf(made), show: is("cooldown") },
  { key: "tag", label: "or tag", show: is("cooldown") },
  { key: "by", label: "seconds off", type: "number", min: 0, show: is("cooldown") },
  { key: "reset", label: "make ready", type: "check", show: is("cooldown") },
  { key: "charges", label: "charges back", type: "number", min: 1, step: 1, show: is("cooldown") },
  { key: "duration", type: "number", label: "duration s", min: 0, hint: "how long it lasts", show: is("status", "taunt") },
  { key: "durationPerSpent", type: "number", label: "s per point spent", min: 0, hint: "more for each point an `all` cost spends", show: is("status") },
  { key: "lockout", type: "number", label: "lockout s", min: 0, show: is("interrupt") },
  { key: "kind", type: "select", options: ["charge", "leap", "knockback", "pull", "blink", "dash", "leapBack", "knockup", "behind"], show: is("move") },
  { key: "to", type: "select", none: "plain", options: ["self", "target", "ground"], show: is("move") },
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
  {
    key: "units",
    type: "list",
    one: "unit",
    blank: () => ({ id: "", name: "" }),
    fields: [
      { key: "id" },
      { key: "name" },
      { key: "power", type: "group", fields: ["attackPower", "spellPower", "health", "armor"].map((key) => ({ key, type: "number", min: 0, hint: "a share of its summoner's" })) },
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
      { key: "autocast", type: "multi", options: abilitiesOf(made) },
    ],
  },
  {
    key: "specializations",
    type: "list",
    one: "specialization",
    blank: () => ({ id: "", name: "" }),
    fields: [
      { key: "id" },
      { key: "name" },
      { key: "description" },
      { key: "status", type: "select", none: "none", options: statusesOf(made) },
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
    ],
  },
  {
    key: "talents",
    type: "group",
    fields: TALENT_TIERS.map((level) => ({
      key: String(level),
      label: `level ${level}`,
      type: "list",
      one: "talent",
      blank: () => ({ id: "", name: "", grants: [{}] }),
      fields: [
        { key: "id" },
        { key: "name" },
        { key: "description" },
        { key: "requires", type: "select", none: "nothing", options: () => (made.talents?.[level - TALENT_TIER_STEP] ?? []).map((t) => [t.id, t.name || t.id]) },
        {
          key: "grants",
          type: "list",
          one: "grant",
          blank: () => ({}),
          fields: [
            { key: "status", type: "select", none: "none", options: statusesOf(made) },
            { key: "ability", type: "select", none: "none", options: abilitiesOf(made) },
            { key: "spec", label: "only for", type: "select", none: "every specialization", options: () => (made.specializations ?? []).map((s) => [s.id, s.name || s.id]) },
          ],
        },
      ],
    })),
  },
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
  { key: "cost", type: "list", one: "cost", blank: () => ({ resource: "" }), fields: [{ key: "resource", type: "select", none: "pick one", options: resourcesOf(made) }, { key: "amount", type: "number", min: 0 }, { key: "percent", label: "or % of base", type: "number", min: 0 }, { key: "all", label: "spends all", type: "check", hint: "needs at least that much, and spends all you have" }] },
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

const statusEffectFields = (made, nested = false) => [
  { key: "type", type: "select", options: ["stat", "periodic", "absorb", "control", "trigger", "stealth", "modify", "immune", "aura", "none"] },
  { key: "stat", type: "select", none: "pick one", options: STATS, show: is("stat") },
  { key: "abilities", type: "multi", options: abilitiesOf(made), show: is("modify", "trigger", "stat") },
  { key: "tag", label: "or tag", show: is("modify", "trigger", "stat") },
  { key: "statuses", type: "multi", options: statusesOf(made), show: is("modify", "trigger", "stat") },
  { key: "change", type: "select", none: "adds effects", options: changesOf(made), show: is("modify") },
  { key: "set", type: "number", show: (e) => e.type === "modify" && e.change },
  { key: "add", type: "number", show: (e) => e.type === "stat" || (e.type === "modify" && e.change) },
  { key: "multiply", type: "number", show: (e) => e.type === "stat" || (e.type === "modify" && e.change) },
  { key: "mastery", label: "per point of mastery", hint: "percent more for each point of mastery percentage; on a trigger, percent more chance", type: "number", show: (e) => e.type === "stat" || e.type === "trigger" || (e.type === "modify" && e.change) },
  { key: "addEffects", label: "adds effects", type: "list", one: "effect", blank: () => ({ type: "damage", affects: "target" }), fields: effectFields(made), show: (e) => e.type === "modify" && !e.change && !e.statuses?.length },
  ...(nested ? [] : [{ key: "statusEffects", label: "adds status effects", type: "list", one: "effect", blank: () => ({ type: "stat" }), fields: statusEffectFields(made, true), show: (e) => e.type === "modify" && !e.change && e.statuses?.length }]),
  { key: "addPerSpent", label: "add per point spent", type: "number", show: is("stat") },
  { key: "multiplyPerSpent", label: "multiply per point spent", type: "number", show: is("stat") },
  { key: "school", type: "select", none: "any", options: SCHOOLS, show: is("stat", "periodic", "trigger") },
  { key: "every", label: "every s", type: "number", min: 0, show: is("periodic", "aura") },
  { key: "does", type: "select", options: ["damage", "heal", "resource"], show: is("periodic") },
  { key: "amount", type: "amount", show: is("periodic", "absorb") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: (e) => e.type === "periodic" && e.does === "resource" },
  { key: "schools", type: "multi", options: SCHOOLS, show: is("absorb", "trigger", "stat", "immune") },
  { key: "control", type: "select", options: ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm"], show: is("control") },
  { key: "on", type: "select", options: TRIGGERS, show: is("trigger") },
  { key: "hit", type: "select", none: "any", options: ["auto", "ability", "melee", "direct", "periodic", "area", "main", "others", "single"], show: is("trigger", "stat", "modify") },
  { key: "atTargets", label: "at targets hit", type: "number", min: 2, step: 1, show: is("trigger", "modify") },
  { key: "category", hint: "a word like bleed or disease", show: is("stat", "trigger", "periodic") },
  { key: "controls", type: "multi", options: ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm", "slow", "interrupt", "knockback", "pull", "pushback", "charm", "sleep"], show: is("immune") },
  { key: "all", label: "all damage", type: "check", show: is("immune") },
  { key: "harmful", label: "harmful statuses", type: "check", show: is("immune") },
  { ...perCountField(made), show: is("stat", "trigger") },
  { key: "casterOnly", label: "only with its caster", type: "check", show: is("trigger", "stat") },
  { key: "source", type: "select", none: "the holder", options: ["summons", "both"], show: is("trigger", "stat") },
  { key: "units", type: "multi", options: unitsOf(made), show: (e) => e.source === "summons" || e.source === "both" },
  { key: "threshold", label: "below %", type: "number", min: 0, show: triggerOn("healthBelow", "allyHealthBelow") },
  { key: "atStacks", label: "at stacks", type: "number", min: 1, step: 1, show: triggerOn("statusGained", "statusConsumed") },
  { key: "full", label: "whole channel", type: "check", show: triggerOn("channelEnd") },
  { key: "pickup", show: triggerOn("pickup", "overheal") },
  { key: "resource", type: "select", none: "any", options: resourcesOf(made), show: triggerOn("spend") },
  { key: "param", label: "named", hint: "a name other things can change this number by", show: is("stat", "periodic", "absorb") },
  { key: "chance", type: "number", min: 0, hint: "0 to 1, 1 by default", show: is("trigger") },
  { key: "chancePerSpent", label: "chance per point", type: "number", min: 0, show: is("trigger") },
  { key: "param", label: "named", hint: "a name other things can change this chance by", show: is("trigger") },
  { key: "cooldown", label: "cooldown s", type: "number", min: 0, show: is("trigger") },
  { key: "effect", type: "group", fields: effectFields(made), show: is("trigger", "aura") },
  { key: "radius", type: "number", min: 0, label: "radius ft", show: is("aura") },
  { key: "affects", type: "select", options: ["enemies", "allies"], show: is("aura") },
  { key: "status", type: "select", none: "none", options: statusesOf(made), show: is("aura") },
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
  {
    key: "consumedBy",
    label: "used up by",
    type: "group",
    fields: [
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
      { key: "tag", label: "or tag" },
      { key: "uses", type: "number", min: 1, step: 1, hint: "how many uses it lasts, 1 by default" },
      { key: "stacks", type: "number", min: 1, step: 1, hint: "takes this many stacks each use, instead of ending" },
    ],
  },
  { key: "pose", type: "select", none: "none", options: ["sit"] },
  { key: "aura", type: "group", fields: [{ key: "effect", type: "select", none: "none", options: VISUALS }, main] },
  { key: "effects", type: "list", one: "effect", blank: () => ({ type: "stat" }), fields: statusEffectFields(made) },
  { key: "notes", type: "area" },
];
