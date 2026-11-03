import { SOUNDS, VISUALS } from "../abilities/stock.js";
import { ARMOR_SLOTS, ARMOR_STYLES, ARMOR_TYPES } from "../character/armor.js";
import { BODIES } from "../character/bodies.js";
import { BEARD, EARS, FACE, FLESH, GAIT, HAIR, HANDS, HORNS, JEWELRY, LOWER, LOWER_ARMS, MOUTH, MUZZLE, NOSE, TAIL, TUSKS, UNARMED, WINGS } from "../character/recipe.js";
import { HELD, OFFHANDS, WEAPONS, WEAPON_STYLES } from "../character/weapons.js";
import { BUILT_IN_CHANGES, TALENT_TIERS, TALENT_TIER_STEP } from "./classFile.js";

// What the class editor's forms hold, by the formats in formats.md. Fields that pick a status or a
// resource take their options from the class being edited.
const SCHOOLS = ["physical", "holy", "fire", "nature", "frost", "shadow", "arcane"];
const SCHOOL_LISTS = [...SCHOOLS, "all"];
const DISPELS = ["magic", "curse", "poison", "disease", "enrage", "stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm", "slow"];
const CREATURE_TYPES = ["beast", "humanoid", "undead", "elemental", "demon", "dragonkin", "giant", "mechanical", "aberration", "critter"];
const STATS = ["strength", "agility", "intellect", "stamina", "armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating", "attackPower", "spellPower", "maxHealth", "resourceMax", "resourceRegen", "resourceRest", "resourceDecay", "resourceGain", "critChance", "critDamage", "critHealing", "critTaken", "haste", "mastery", "versatility", "leech", "avoidance", "dodge", "parry", "block", "movementSpeed", "attackSpeed", "stealth", "detection", "damageDone", "healingDone", "damageTaken", "healingTaken", "threat"];
const COMMON_STATS = ["strength", "agility", "intellect", "stamina", "armor", "attackPower", "spellPower", "maxHealth", "critChance", "haste", "movementSpeed", "damageDone", "healingDone", "damageTaken"];
const HITS = ["auto", "ability", "melee", "direct", "periodic", "area", "main", "others", "single"];
const WHEN = ["cast", "launch", "impact", "channel"];
const ON = ["caster", "target", "ground"];

const is = (...types) => (value) => types.includes(value.type);
const abilitiesOf = (made) => () => (made.abilities ?? []).map((a) => [a.id, a.name || a.id]);
const statusesOf = (made) => () => (made.statuses ?? []).map((s) => [s.id, s.name || s.id]);
const TRIGGERS = ["dealDamage", "takeDamage", "heal", "healed", "overheal", "crit", "nonCrit", "dodge", "parry", "block", "cast", "channelEnd", "spend", "kill", "interrupt", "dispel", "pickup", "healthBelow", "allyHealthBelow", "wouldDie", "statusGained", "statusConsumed", "statusEnds", "dispelled", "holderDies"];
const COMMON_TRIGGERS = ["dealDamage", "takeDamage", "heal", "crit", "cast", "kill", "healthBelow", "statusGained", "statusEnds"];
const triggerOn = (...events) => (e) => e.type === "trigger" && events.includes(e.on);
// What a modify can change: the built-in values, and every param the class has named.
const changesOf = (made) => () => {
  const named = [...(made.abilities ?? []), ...(made.statuses ?? [])].flatMap((o) => (o.effects ?? []).map((e) => e.param)).filter(Boolean);
  return [...BUILT_IN_CHANGES, ...new Set(named)];
};
const unitsOf = (made) => () => (made.units ?? []).map((u) => [u.id, u.name || u.id]);
const resourcesOf = (made) => () => (made.resources ?? []).map((r) => [r.key, r.name || r.key]);
const main = { key: "colors", type: "words", label: "colors", hint: "[main, trim]: two #rrggbb colors, with commas" };
// A stack taken from this status, or from another named one.
const spendsStack = (made) => ({ type: "select", none: "no", options: () => [["this status", "this status"], ...statusesOf(made)()], read: (v) => (v === true ? "this status" : v), write: (v) => (v === "this status" ? true : v) });

const simpleConditionFields = (made) => [
  { key: "kind", type: "select", label: "needs", options: [["health", "health"], ["status", "a status"], ["resource", "a resource"], ["targetIs", "used on"], ["inCombat", "combat"], ["stealthed", "stealth"]], more: [["state", "a state"], ["position", "position"], ["since", "time since"], ["holders", "units holding"], ["unitsOut", "a unit out"], ["inArea", "in your area"], ["spentAtLeast", "spent at least"], ["targetsHitAtLeast", "hit at least"], ["outcome", "the hit"], ["targetHealthBelowMine", "target under your health"], ["group", "a status group"], ["wielding", "what you wield"]] },
  { key: "group", label: "of group", show: (c) => c.kind === "group" },
  { key: "wielding", type: "select", options: ["shield", "oneHanded", "twoHanded", "dual"], show: (c) => c.kind === "wielding" },
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
  { key: "on", type: "select", options: ["self", "target"], show: (c) => ["status", "state", "group"].includes(c.kind) },
  { key: "yes", type: "check", label: "true", default: true, show: (c) => c.kind === "stealthed" || c.kind === "inCombat" },
];

const perCountField = (made) => ({
  key: "perCount",
  label: "per count of",
  type: "group",
  collapsed: true,
  fields: [
    { key: "statusStacks", label: "stacks of", type: "select", none: "none", options: statusesOf(made) },
    { key: "statusesFromMe", label: "your statuses on the target", type: "check" },
    { key: "statusesOnTarget", label: "of these on the target", type: "multi", options: statusesOf(made) },
    { key: "holders", label: "units holding", type: "select", none: "none", options: statusesOf(made) },
    { key: "unitsOut", label: "units out", type: "multi", options: unitsOf(made) },
    { key: "resource", type: "select", none: "none", options: resourcesOf(made) },
    { key: "weights", label: "counts as", type: "pairs", one: "status", keyField: { key: "status", type: "select", options: statusesOf(made) }, valueField: { key: "counts", label: "this many", type: "number", min: 0 }, advanced: true },
    { key: "add", type: "number", hint: "this much per count, not the whole amount again" },
    { key: "max", type: "number", min: 0, hint: "the most it counts" },
  ],
});

// `depth` is how many more any-ofs and nots it can hold inside.
const conditionFields = (made, depth = 2) => {
  if (!depth) return simpleConditionFields(made);
  const inner = { type: "list", one: "condition", blank: () => ({ kind: "status", on: "self" }), read: readCondition, write: writeCondition, fields: conditionFields(made, depth - 1) };
  return [
    ...simpleConditionFields(made).map((f) => (f.key === "kind" ? { ...f, more: [...f.more, ["anyOf", "any of"], ["not", "not"]] } : f)),
    { ...inner, key: "not", limit: 1, show: (c) => c.kind === "not" },
    { ...inner, key: "anyOf", show: (c) => c.kind === "anyOf" },
  ];
};

// A condition as the form edits it, with the `kind` the format leaves implicit.
const PLAIN_CONDITIONS = ["state", "position", "since", "resource", "holders", "unitsOut", "inArea", "spentAtLeast", "targetsHitAtLeast", "outcome", "targetHealthBelowMine", "group", "wielding"];

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

// Headings for advanced fields.
const WHO = "who it lands on";
const WHEN_IT = "when it happens";
const HOW = "how much";
const ONLY = "only for";
const RULES = "rules";
const OTHER = "other";

const conditionList = (made, more = {}) => ({ type: "list", one: "condition", blank: () => ({ kind: "status", on: "self" }), read: readCondition, write: writeCondition, fields: conditionFields(made), ...more });

// The rarer parts of an amount. `deep` lets them hold amounts of their own, once.
const amountMore = (made, deep = true) => [
  { key: "weapon", label: "× weapon", type: "number", advanced: "scales with" },
  { key: "mastery", label: "× mastery", type: "number", advanced: "scales with" },
  { key: "byMastery", label: "% per mastery", type: "number", hint: "the whole amount grows by this much for each point of mastery", advanced: "scales with" },
  { key: "maxHealth", label: "× max health", type: "number", hint: "of whoever it affects", advanced: "scales with" },
  { key: "shareOfTrigger", label: "× what set it off", type: "number", advanced: "scales with" },
  {
    key: "shareOf",
    label: "share of something tracked",
    type: "group",
    collapsed: true,
    advanced: "scales with",
    fields: [
      { key: "of", type: "select", options: ["recentDamage", "stored", "statusLeft", "effect", "casterMaxHealth", "unitMaxHealth", "maxResource", "healthSpent"] },
      { key: "share", type: "number" },
      { key: "seconds", label: "how far back s", type: "number", min: 0, show: (s) => s.of === "recentDamage" },
      { key: "on", label: "who took it", type: "select", none: "self", options: ["target"], show: (s) => s.of === "recentDamage" },
      { key: "statuses", type: "multi", options: statusesOf(made), show: (s) => s.of === "statusLeft" },
      { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: (s) => s.of === "maxResource" },
    ],
  },
  byMissingHealthField({ advanced: "scales with" }),
  ...(deep
    ? [
        { key: "perSpent", label: "per point spent", type: "amount", more: () => amountMore(made, false), advanced: "limits and spending" },
        { key: "minimum", label: "at least", type: "amount", more: () => amountMore(made, false), advanced: "limits and spending" },
        { key: "maximum", label: "at most", type: "amount", more: () => amountMore(made, false), advanced: "limits and spending" },
      ]
    : []),
];

const amountField = (made, more = {}) => ({ key: "amount", type: "amount", more: () => amountMore(made), ...more });

const byMissingHealthField = (more = {}) => ({
  key: "byMissingHealth",
  label: "more as health falls",
  type: "group",
  collapsed: true,
  fields: [
    { key: "upTo", label: "reaching at none", type: "number" },
    { key: "of", label: "whose", type: "select", none: "whoever it lands on", options: ["self", "target"] },
  ],
  ...more,
});

// A default someone wrote out shows as leaving it out.
const defaulted = (word) => ({ read: (v) => (v === word ? undefined : v) });

const spread = (e) => ["enemies", "allies"].includes(e.affects);

const effectFields = (made, nested = false) => [
  { key: "type", type: "select", options: ["damage", "heal", "status", "resource", "move", "dispel", "interrupt", "area"], more: ["taunt", "extend", "consume", "extraTargets", "castAbility", "threat", "reveal", "cooldown", "summon", "command", "resurrect"] },
  { key: "affects", type: "select", options: ["target", "self", "enemies", "allies", "hit", "holder", "caster", "summons"] },
  amountField(made, { show: is("damage", "heal", "resource") }),
  { key: "school", type: "select", none: "the ability's", options: SCHOOLS, show: is("damage") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: is("resource") },
  { key: "status", type: "select", none: "pick one", options: statusesOf(made), show: is("status", "consume") },
  { key: "status", type: "select", none: "none", options: statusesOf(made), show: is("extend") },
  { key: "status", label: "those inside have", type: "select", none: "none", options: statusesOf(made), show: is("area") },
  { key: "duration", type: "number", label: "duration s", min: 0, hint: "how long it lasts", show: is("status", "taunt") },
  { key: "stacks", type: "number", min: 1, step: 1, hint: "all of them by default", show: is("consume") },
  { key: "seconds", type: "number", show: is("extend", "consume") },
  { key: "lockout", type: "number", label: "lockout s", min: 0, show: is("interrupt") },
  { key: "kind", type: "select", options: ["charge", "leap", "knockback", "pull", "blink", "dash", "leapBack", "knockup", "behind"], show: is("move") },
  { key: "to", type: "select", none: "plain", options: ["self", "target", "ground"], show: is("move") },
  { key: "distance", type: "number", label: "distance ft", min: 0, show: (e) => e.type === "move" && ["knockback", "blink", "dash"].includes(e.kind) },
  { key: "speed", type: "number", label: "speed ft/s", min: 0, show: (e) => e.type === "move" && e.kind === "charge" },
  { key: "dispels", type: "multi", label: "removes", options: DISPELS, show: is("dispel") },
  { key: "count", type: "number", label: "how many", min: 1, step: 1, show: is("dispel") },
  { key: "around", type: "select", none: "self", options: ["target", "ground", "holders", "random"], ...defaulted("self"), show: is("area") },
  { key: "radius", type: "number", label: "radius ft", min: 0, show: (e) => spread(e) || ["extraTargets", "castAbility", "area"].includes(e.type) },
  { key: "lasts", label: "lasts s", type: "number", min: 0, show: is("area") },
  { key: "every", label: "every s", type: "number", min: 0, show: is("area") },
  ...(nested ? [] : [{ key: "effect", label: "each time", type: "group", collapsed: true, fields: effectFields(made, true), show: is("area") }]),
  { key: "unit", type: "select", none: "pick one", options: unitsOf(made), show: is("summon") },
  { key: "count", type: "number", min: 1, step: 1, show: is("summon") },
  { key: "lasts", label: "lasts s", type: "number", min: 0, hint: "left out, until it dies or is dismissed", show: is("summon") },
  { key: "ability", type: "select", none: "pick one", options: abilitiesOf(made), show: is("command", "castAbility") },
  { key: "free", type: "check", show: is("castAbility") },
  { key: "strength", type: "number", min: 0, show: is("castAbility") },
  { key: "abilities", type: "multi", options: abilitiesOf(made), show: is("cooldown") },
  { key: "by", label: "seconds off", type: "number", min: 0, show: is("cooldown") },
  { key: "reset", label: "make ready", type: "check", show: is("cooldown") },
  { key: "max", label: "at most", type: "number", min: 1, step: 1, show: is("extraTargets") },
  { key: "share", type: "number", show: is("extraTargets") },
  { key: "clear", label: "wipes it", type: "check", show: is("threat") },
  { key: "multiply", type: "number", show: is("threat") },
  { key: "health", type: "number", label: "health %", min: 0, show: is("resurrect") },

  { key: "around", type: "select", none: "self", options: ["target", "ground", "holders", "random"], ...defaulted("self"), show: (e) => spread(e) && e.type !== "area", advanced: WHO },
  { key: "max", type: "number", label: "at most", min: 1, step: 1, hint: "how many it hits", show: (e) => spread(e) || ["castAbility", "status"].includes(e.type), advanced: WHO },
  { key: "max", label: "at most out", type: "number", min: 1, step: 1, show: is("summon"), advanced: WHO },
  { key: "prefers", type: "select", none: "nearest", options: ["injured", "farthest", "lowestHealth"], ...defaulted("nearest"), show: (e) => e.max !== undefined, advanced: WHO },
  { key: "exceptTarget", label: "not the target", type: "check", show: spread, advanced: WHO },
  { key: "holding", type: "multi", options: statusesOf(made), hint: "only those holding one of these from you", show: spread, advanced: WHO },
  { key: "creatureTypes", label: "only on", type: "multi", options: CREATURE_TYPES, advanced: WHO },
  { key: "height", type: "number", label: "height ft", min: 0, hint: "above and below its center, 15 by default", show: (e) => e.type !== "move" && spread(e), advanced: WHO },
  { key: "cone", type: "number", label: "cone °", min: 0, hint: "a slice in front of you, around yourself only", show: spread, advanced: WHO },
  { key: "line", label: "in a line", type: "check", show: (e) => e.type === "area" || spread(e), advanced: WHO },
  { key: "width", type: "number", min: 0, show: (e) => e.line, advanced: WHO },
  { key: "along", type: "select", none: "facing", options: ["path", "ground"], show: (e) => e.line, advanced: WHO },
  { key: "units", type: "multi", options: unitsOf(made), show: (e) => e.type === "command" || e.type === "consume" || e.affects === "summons", advanced: WHO },

  conditionList(made, { key: "when", advanced: WHEN_IT }),
  { key: "chance", type: "number", min: 0, hint: "0 to 1, 1 by default", advanced: WHEN_IT },
  { key: "chancePerSpent", label: "chance per point", type: "number", min: 0, advanced: WHEN_IT },

  amountField(made, { label: "amount", show: is("status"), advanced: HOW }),
  { key: "stacks", type: "number", min: 1, step: 1, show: is("status"), advanced: HOW },
  { ...perCountField(made), show: is("damage", "heal", "resource", "status", "extend", "cooldown"), advanced: HOW },
  { key: "perTargetHit", label: "per target hit", type: "numberOr", word: true, after: "or once each", show: is("damage", "heal", "resource", "cooldown"), advanced: HOW },
  { key: "maxTotal", label: "at most in all", type: "number", min: 0, show: (e) => e.type === "extend" || e.perTargetHit !== undefined, advanced: HOW },
  { key: "softCap", label: "soft cap", type: "number", min: 1, step: 1, hint: "past this many hit, they share this many's worth", show: is("damage", "heal", "status", "extraTargets", "area"), advanced: HOW },
  { key: "split", type: "check", hint: "those hit share the amount", show: is("damage", "heal", "status"), advanced: HOW },
  { key: "others", type: "number", min: 0, hint: "those besides the main target take this share", show: is("damage", "heal"), advanced: HOW },
  { key: "drain", type: "number", hint: "heals you by this share of what it does", show: is("damage"), advanced: HOW },
  { key: "byExtraSpent", label: "times as much for spending extra", type: "number", min: 0, show: is("damage", "heal"), advanced: HOW },
  { key: "durationPerSpent", type: "number", label: "s per point spent", min: 0, hint: "more for each point the ability spends", show: is("status"), advanced: HOW },
  { key: "alwaysCrit", label: "always crits", type: "check", show: is("damage", "heal"), advanced: HOW },
  conditionList(made, { key: "alwaysCritWhen", label: "always crits when", show: is("damage", "heal"), advanced: HOW }),
  { key: "critMultiplier", label: "crits do this many times", type: "number", min: 0, show: is("damage", "heal"), advanced: HOW },
  { key: "scalesWithCrit", label: "more with crit chance", type: "check", show: is("damage", "heal"), advanced: HOW },

  { key: "schools", label: "or schools", type: "multi", options: SCHOOL_LISTS, show: is("damage"), advanced: OTHER },
  { key: "param", label: "named", hint: "a name other things can change this number by", advanced: OTHER },
  { key: "category", hint: "a word like bleed or disease that stats and triggers can look for", show: is("damage", "heal"), advanced: OTHER },
  { key: "source", label: "done by", type: "select", none: "the caster", options: ["summons"], show: is("damage", "heal"), advanced: OTHER },
  { key: "statuses", type: "multi", options: statusesOf(made), show: is("extend", "consume"), advanced: OTHER },
  { key: "perSpent", label: "s per point spent", type: "number", show: is("extend"), advanced: OTHER },
  { key: "maxShare", label: "at most, share of full", type: "number", min: 0, show: is("extend"), advanced: OTHER },
  { key: "refresh", label: "start it over", type: "check", show: is("extend"), advanced: OTHER },
  { key: "apply", label: "apply if missing", type: "check", show: is("extend"), advanced: OTHER },
  { key: "dealsLeft", label: "does this share of what's left", type: "number", show: is("consume"), advanced: OTHER },
  { key: "keeps", label: "leaves it on", type: "check", show: (e) => e.type === "consume" && e.dealsLeft !== undefined, advanced: OTHER },
  ...(nested ? [] : [{ key: "perStack", label: "for each stack taken", type: "group", collapsed: true, fields: effectFields(made, true), show: is("consume"), advanced: OTHER }]),
  { key: "overlaps", label: "copies each work", type: "check", show: is("area"), advanced: OTHER },
  { key: "followsTarget", label: "follows its target", type: "check", show: is("area"), advanced: OTHER },
  { key: "limit", label: "at most out", type: "number", min: 1, step: 1, show: is("area"), advanced: OTHER },
  ...(nested
    ? []
    : [
        { key: "onEnter", label: "on entering", type: "group", collapsed: true, fields: effectFields(made, true), show: is("area"), advanced: OTHER },
        { key: "effects", label: "several each time", type: "list", one: "effect", blank: () => ({ type: "damage", affects: "self" }), fields: effectFields(made, true), show: is("area"), advanced: OTHER },
      ]),
  { key: "height", type: "number", label: "arc ft", min: 0, show: (e) => e.type === "move" && ["leap", "knockback"].includes(e.kind), advanced: OTHER },
  { key: "flying", type: "check", show: is("move"), advanced: OTHER },
  { key: "tags", type: "words", label: "with tags", show: is("dispel"), advanced: OTHER },
  { key: "obeys", type: "check", show: is("summon"), advanced: OTHER },
  { key: "statuses", label: "arrives with", type: "multi", options: statusesOf(made), show: is("summon"), advanced: OTHER },
  { key: "level", label: "at empowered level", type: "number", min: 1, step: 1, show: is("castAbility"), advanced: OTHER },
  { key: "tag", label: "or tag", show: is("cooldown"), advanced: OTHER },
  { key: "charges", label: "charges back", type: "number", min: 1, step: 1, show: is("cooldown"), advanced: OTHER },
  { key: "spendsStack", label: "takes a stack each time", ...spendsStack(made), show: is("extraTargets"), advanced: OTHER },
  { key: "hit", label: "only for hits", type: "select", none: "any", options: HITS, show: is("extraTargets"), advanced: OTHER },
];

// A character recipe's settings (character/recipe.js), for a unit or a form's look. A setting left out
// comes from its body.
const LOOK_COLORS = ["skin", "hair", "eyes", "primary", "secondary", "metal", "steel", "wood", "paint", "horn", "leaf"];
const pickOne = (key, options, more = {}) => ({ key, type: "select", none: "its body's", options, ...more });
const dial = (key, hint, heading) => ({ key, type: "number", min: 0, max: 1, hint, advanced: heading });
const SIZE = "size and build";
const SHAPE = "shape";
const FACE_HEADING = "face and hair";
const GEAR_HEADING = "gear";

const armorFields = () => ARMOR_SLOTS.map((slot) => ({ key: slot, type: "group", collapsed: true, fields: [pickOne("type", ARMOR_TYPES, { none: "none" }), pickOne("style", ARMOR_STYLES, { none: "fine" }), { key: "colors", type: "words", hint: "main, trim: two #rrggbb colors, with commas" }] }));
const gearFields = (heading) => [
  pickOne("weapon", WEAPONS, { advanced: heading }),
  pickOne("offhand", OFFHANDS, { advanced: heading }),
  pickOne("weaponStyle", WEAPON_STYLES, { label: "weapon style", advanced: heading }),
  pickOne("offhandStyle", WEAPON_STYLES, { label: "off-hand style", advanced: heading }),
  { key: "armor", type: "group", collapsed: true, fields: armorFields(), advanced: heading },
];
const colorFields = () => ({ key: "colors", type: "group", collapsed: true, fields: LOOK_COLORS.map((key) => ({ key, type: "color" })) });

export const lookFields = () => [
  pickOne("body", () => ["humanoid", ...Object.keys(BODIES).filter((name) => !name.includes(":"))]),
  { key: "height", label: "height ft", type: "number", min: 0, hint: "to the top of the head", show: (l) => !BODIES[l.body] },
  { key: "scale", type: "number", min: 0.5, hint: "a creature's size against its body's, 0.5 to 2", show: (l) => Boolean(BODIES[l.body]) },
  { key: "coloration", show: (l) => Boolean(BODIES[l.body]), hint: "one of its body's colorations, by name" },
  colorFields(),
  dial("build", "0 slight to 1 heavy", SIZE),
  dial("limbs", "0 thin to 1 thick", SIZE),
  dial("shoulders", "0 narrow to 1 broad", SIZE),
  dial("waist", "0 narrow to 1 broad", SIZE),
  dial("hips", "0 narrow to 1 broad", SIZE),
  dial("arms", "0 short to 1 long", SIZE),
  dial("legs", "0 short to 1 long", SIZE),
  dial("head", "0 small to 1 large", SIZE),
  dial("bust", "0 to 1", SIZE),
  dial("rear", "0 flat to 1 full", SIZE),
  dial("jaw", "0 narrow to 1 broad", FACE_HEADING),
  pickOne("hair", HAIR, { advanced: FACE_HEADING }),
  pickOne("beard", BEARD, { advanced: FACE_HEADING }),
  pickOne("mouth", MOUTH, { advanced: FACE_HEADING }),
  pickOne("ears", EARS, { advanced: FACE_HEADING }),
  pickOne("nose", NOSE, { advanced: FACE_HEADING }),
  pickOne("tusks", TUSKS, { advanced: FACE_HEADING }),
  { key: "face", type: "multi", options: FACE, advanced: FACE_HEADING },
  { key: "jewelry", type: "multi", options: JEWELRY, advanced: FACE_HEADING },
  pickOne("flesh", FLESH, { advanced: SHAPE }),
  pickOne("muzzle", MUZZLE, { advanced: SHAPE }),
  pickOne("horns", HORNS, { advanced: SHAPE }),
  pickOne("tail", TAIL, { advanced: SHAPE }),
  pickOne("wings", WINGS, { advanced: SHAPE }),
  pickOne("hands", HANDS, { advanced: SHAPE }),
  pickOne("lowerArms", LOWER_ARMS, { label: "lower arms", advanced: SHAPE }),
  pickOne("lower", LOWER, { label: "below the waist", advanced: SHAPE }),
  pickOne("gait", GAIT, { advanced: SHAPE }),
  pickOne("unarmed", UNARMED, { advanced: SHAPE }),
  ...gearFields(GEAR_HEADING),
  { key: "sheathed", label: "weapons put away", type: "check", advanced: GEAR_HEADING },
  {
    key: "loadouts",
    label: "outfits to pick from",
    type: "list",
    one: "outfit",
    blank: () => ({}),
    advanced: GEAR_HEADING,
    fields: [...gearFields(undefined), { ...colorFields() }, { key: "weight", type: "number", min: 0, hint: "how often it's picked, 1 by default" }],
  },
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
    advanced: true,
    blank: () => ({ id: "", name: "" }),
    fields: [
      { key: "id" },
      { key: "name" },
      { key: "power", type: "group", fields: ["attackPower", "spellPower", "health", "armor"].map((key) => ({ key, type: "number", min: 0, hint: "a share of its summoner's" })) },
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
      { key: "autocast", type: "multi", options: abilitiesOf(made) },
      { key: "description", type: "area", advanced: true },
      { key: "creatureType", label: "creature type", type: "select", none: "none", options: CREATURE_TYPES, advanced: true },
      { key: "look", type: "group", collapsed: true, advanced: true, fields: lookFields() },
      { key: "speed", label: "speed ft/s", type: "number", min: 0, advanced: true },
      { key: "reach", label: "reach ft", type: "number", min: 0, advanced: true },
      { key: "attack", type: "group", collapsed: true, advanced: true, fields: [{ key: "speed", label: "every s", type: "number", min: 0 }, { key: "range", type: "distance" }, { key: "school", type: "select", none: "physical", options: SCHOOLS }] },
      { key: "tags", type: "words", advanced: true },
      { key: "notes", type: "area", advanced: true },
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
      { key: "status", type: "select", none: "none", options: statusesOf(made), advanced: true },
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
    ],
  },
  {
    key: "talents",
    type: "group",
    collapsed: true,
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
  { key: "mastery", type: "group", collapsed: true, fields: [{ key: "name" }, { key: "description", type: "area" }, { key: "status", type: "select", none: "pick one", options: statusesOf(made) }] },
  { key: "startingGear", label: "starting gear", type: "words", hint: "item ids, with commas", advanced: true },
  { key: "tags", type: "words", advanced: true },
  { key: "notes", type: "area", advanced: true },
];

export const abilityFields = (made) => [
  { key: "name" },
  { key: "level", type: "number", min: 1, step: 1 },
  { key: "description", type: "area" },
  { key: "icon" },
  { key: "school", type: "select", none: "none", options: SCHOOLS },
  { key: "target", type: "select", options: ["enemy", "ally", "any", "self", "ground", "none"] },
  { key: "range", type: "distance", show: (a) => (a.target !== "self" && a.target !== "none") || a.range !== undefined },
  { key: "castTime", label: "cast s", type: "number", min: 0, hint: "0 is instant" },
  { key: "cooldown", label: "cooldown s", type: "number", min: 0 },
  {
    key: "cost",
    type: "list",
    one: "cost",
    blank: () => ({ resource: "" }),
    fields: [
      { key: "resource", type: "select", none: "pick one", options: resourcesOf(made) },
      { key: "amount", type: "number", min: 0 },
      { key: "percent", label: "or % of base", type: "number", min: 0 },
      { key: "all", label: "spends all", type: "check", hint: "needs at least that much, and spends all you have", advanced: true },
      { key: "upTo", label: "up to", type: "number", min: 0, hint: "spends more if you have it, up to this much in all", advanced: true },
      { key: "perSecond", label: "or per second", type: "number", min: 0, advanced: true },
      conditionList(made, { key: "when", label: "only when", advanced: true }),
    ],
  },
  { key: "effects", type: "list", one: "effect", blank: blankEffect, fields: effectFields(made) },
  { key: "schools", label: "or schools", type: "multi", options: SCHOOL_LISTS, advanced: "targeting" },
  { key: "minRange", label: "min range", type: "number", min: 0, show: (a) => a.target !== "self" && a.target !== "none", advanced: "targeting" },
  { key: "facing", type: "check", label: "must face", default: true, show: (a) => a.target === "enemy" || a.facing !== undefined, advanced: "targeting" },
  { key: "speed", label: "projectile ft/s", type: "number", min: 0, hint: "leave it out for one that lands at once", advanced: "targeting" },
  { key: "creatureTypes", label: "only on", type: "multi", options: CREATURE_TYPES, advanced: "targeting" },
  conditionList(made, { key: "requires", blank: () => ({ kind: "health", health: "target" }), advanced: "targeting" }),
  {
    key: "channel",
    type: "group",
    collapsed: true,
    advanced: "casting",
    fields: [
      { key: "duration", label: "duration s", type: "number", min: 0 },
      { key: "ticks", type: "number", min: 1, step: 1 },
      { key: "costPerTick", label: "cost per tick", type: "group", collapsed: true, advanced: true, fields: [{ key: "resource", type: "select", none: "pick one", options: resourcesOf(made) }, { key: "amount", type: "number", min: 0 }] },
      { key: "effect", label: "each tick", type: "group", collapsed: true, advanced: true, fields: effectFields(made, true) },
    ],
  },
  { key: "castWhileMoving", label: "cast moving", type: "check", advanced: "casting" },
  { key: "whileCasting", label: "use while casting", type: "check", advanced: "casting" },
  { key: "keepsStealth", label: "keeps stealth", type: "check", advanced: "casting" },
  { key: "gcd", label: "GCD s", type: "number", min: 0, hint: "1.5 by default, 0 is off it", advanced: "casting" },
  { key: "gcdHasted", label: "GCD hasted", type: "check", default: true, advanced: "casting" },
  { key: "charges", type: "number", min: 1, step: 1, advanced: "casting" },
  { key: "cooldownHasted", label: "cooldown hasted", type: "check", advanced: "casting" },
  { key: "replaces", type: "select", none: "nothing", options: abilitiesOf(made), advanced: "casting" },
  {
    key: "visuals",
    type: "list",
    one: "visual",
    advanced: "look and sound",
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
    advanced: "look and sound",
    blank: () => ({ sound: SOUNDS[0], when: "cast" }),
    fields: [
      { key: "sound", type: "select", options: SOUNDS },
      { key: "when", type: "select", options: WHEN },
      { key: "on", type: "select", none: "by when", options: ON },
      { key: "volume", type: "number", min: 0 },
      { key: "pitch", type: "number", min: 0 },
    ],
  },
  { key: "tags", type: "words", advanced: "notes" },
  { key: "notes", type: "area", advanced: "notes" },
];

// What a modify replaces in the abilities or statuses it changes: their own fields, with nothing filled
// in for you and every field showing, and which ones it takes away.
const OVERRIDES_LEAVE_OUT = ["name", "level", "description", "icon", "tags", "notes"];

export function overridesField(made, kind, fieldsOf, removable, show) {
  const removedKey = "takes away";
  return {
    key: "overrides",
    label: `replaces settings of those ${kind}`,
    type: "group",
    collapsed: true,
    show,
    advanced: RULES,
    read: (held = {}) => {
      const out = Object.fromEntries(Object.entries(held).filter(([, v]) => v !== null));
      const gone = Object.keys(held).filter((k) => held[k] === null);
      return gone.length ? { ...out, [removedKey]: gone } : out;
    },
    write: ({ [removedKey]: gone = [], ...held }) => ({ ...held, ...Object.fromEntries(gone.map((k) => [k, null])) }),
    fields: () => [
      { key: removedKey, type: "multi", options: removable },
      ...fieldsOf()
        .filter((field) => !OVERRIDES_LEAVE_OUT.includes(field.key))
        .map((field) => ({ ...field, show: undefined, ...(field.type === "select" && field.none === undefined ? { none: "unchanged" } : {}) })),
    ],
  };
}

const statusEffectFields = (made, nested = false) => [
  { key: "type", type: "select", options: ["stat", "periodic", "absorb", "control", "trigger", "modify"], more: ["immune", "aura", "stealth", "transform", "store", "extraTargets", "gear", "untargetable", "redirectThreat", "countsAsStealthed", "stealthLinger", "stealthProtected", "none"] },
  { key: "stat", type: "select", none: "pick one", options: COMMON_STATS, more: STATS.filter((s) => !COMMON_STATS.includes(s)), show: is("stat") },
  { key: "resource", type: "select", none: "pick one", options: resourcesOf(made), show: (e) => (e.type === "periodic" && e.does === "resource") || (e.type === "stat" && e.stat?.startsWith("resource")) },
  { key: "does", type: "select", options: ["damage", "heal", "resource"], show: is("periodic") },
  { key: "every", label: "every s", type: "number", min: 0, show: is("periodic", "aura") },
  amountField(made, { show: is("periodic", "absorb") }),
  { key: "school", type: "select", none: "any", options: SCHOOLS, show: is("periodic") },
  { key: "control", type: "select", options: ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm"], show: is("control") },
  { key: "on", type: "select", options: COMMON_TRIGGERS, more: TRIGGERS.filter((t) => !COMMON_TRIGGERS.includes(t)), show: is("trigger") },
  { key: "threshold", label: "below %", type: "number", min: 0, show: triggerOn("healthBelow", "allyHealthBelow") },
  { key: "change", type: "select", none: "adds effects", options: changesOf(made), show: is("modify") },
  { key: "abilities", type: "multi", options: abilitiesOf(made), show: is("modify") },
  { key: "set", type: "number", show: (e) => (e.type === "modify" && e.change) || (e.type === "stat" && e.set !== undefined) },
  { key: "add", type: "number", show: (e) => e.type === "stat" || (e.type === "modify" && e.change) },
  { key: "multiply", type: "number", show: (e) => e.type === "stat" || (e.type === "modify" && e.change) },
  { key: "addEffects", label: "adds effects", type: "list", one: "effect", blank: () => ({ type: "damage", affects: "target" }), fields: effectFields(made), show: (e) => e.type === "modify" && !e.change && !e.statuses?.length },
  ...(nested ? [] : [{ key: "statusEffects", label: "adds status effects", type: "list", one: "effect", blank: () => ({ type: "stat" }), fields: statusEffectFields(made, true), show: (e) => e.type === "modify" && !e.change && e.statuses?.length }]),
  { key: "controls", type: "multi", options: ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm", "slow", "interrupt", "knockback", "pull", "pushback", "charm", "sleep"], show: is("immune") },
  { key: "radius", type: "number", min: 0, label: "radius ft", show: is("aura", "extraTargets") },
  { key: "affects", type: "select", options: ["enemies", "allies"], show: is("aura") },
  { key: "status", type: "select", none: "none", options: statusesOf(made), show: is("aura") },
  { key: "on", label: "keeps", type: "select", options: ["dealDamage", "heal", "crit"], show: is("store") },
  { key: "share", type: "number", show: (e) => e.type === "store" || e.type === "extraTargets" || ((e.type === "stat" || e.type === "modify") && e.fromStat) },
  { key: "into", label: "looks like", type: "select", none: "pick one", options: unitsOf(made), show: is("transform") },
  { key: "allows", type: "words", show: is("gear") },
  { key: "seconds", type: "number", min: 0, show: is("stealthLinger", "stealthProtected", "redirectThreat") },
  { key: "to", type: "select", none: "target", options: ["caster"], ...defaulted("target"), show: is("redirectThreat") },
  { key: "afterSeconds", label: "after s", type: "number", min: 0, show: is("untargetable") },
  { key: "onlyBelow", label: "only under health %", type: "number", min: 0, show: is("untargetable") },
  { key: "effect", type: "group", fields: effectFields(made), show: is("trigger") },
  { key: "effect", type: "group", collapsed: true, fields: effectFields(made), show: is("aura") },

  { key: "abilities", type: "multi", options: abilitiesOf(made), show: is("trigger", "stat", "store", "extraTargets"), advanced: ONLY },
  { key: "tag", label: "or tag", show: is("modify", "trigger", "stat"), advanced: ONLY },
  { key: "statuses", type: "multi", options: statusesOf(made), show: is("modify", "trigger", "stat"), advanced: ONLY },
  { key: "school", type: "select", none: "any", options: SCHOOLS, show: is("stat", "trigger", "modify"), advanced: ONLY },
  { key: "schools", type: "multi", options: SCHOOL_LISTS, show: is("absorb", "trigger", "stat", "immune", "periodic", "modify"), advanced: ONLY },
  { key: "hit", type: "select", none: "any", options: HITS, show: is("trigger", "stat", "modify", "extraTargets"), advanced: ONLY },
  { key: "category", hint: "a word like bleed or disease", show: is("stat", "trigger", "periodic"), advanced: ONLY },
  { key: "categories", label: "or categories", type: "words", show: is("stat", "trigger"), advanced: ONLY },
  { key: "atTargets", label: "at targets hit", type: "number", min: 2, step: 1, show: is("trigger", "modify"), advanced: ONLY },
  { key: "atStacks", label: "at stacks", type: "number", min: 1, step: 1, show: triggerOn("statusGained", "statusConsumed"), advanced: ONLY },
  { key: "atMax", label: "at max stacks", type: "check", show: triggerOn("statusGained"), advanced: ONLY },
  { key: "full", label: "whole channel", type: "check", show: triggerOn("channelEnd"), advanced: ONLY },
  { key: "pickup", show: triggerOn("pickup", "overheal"), advanced: ONLY },
  { key: "resource", type: "select", none: "any", options: resourcesOf(made), show: (e) => triggerOn("spend")(e) || (e.type === "modify" && e.change === "cost"), advanced: ONLY },
  { key: "casterOnly", label: "only with its caster", type: "check", show: is("trigger", "stat"), advanced: ONLY },
  { key: "source", type: "select", none: "the holder", options: ["summons", "both"], show: is("trigger", "stat"), advanced: ONLY },
  { key: "units", type: "multi", options: unitsOf(made), show: (e) => e.source === "summons" || e.source === "both", advanced: ONLY },
  { key: "of", label: "watches", type: "select", none: "the holder", options: ["caster"], show: is("trigger"), advanced: ONLY },
  { key: "notOnHolder", label: "not on the holder", type: "check", show: is("trigger"), advanced: ONLY },

  conditionList(made, { key: "when", blank: () => ({ kind: "health", health: "self" }), advanced: WHEN_IT }),
  { key: "chance", type: "number", min: 0, hint: "0 to 1, 1 by default", show: is("trigger", "modify"), advanced: WHEN_IT },
  { key: "chancePerSpent", label: "chance per point", type: "number", min: 0, show: is("trigger"), advanced: WHEN_IT },
  { key: "cooldown", label: "cooldown s", type: "number", min: 0, show: is("trigger"), advanced: WHEN_IT },
  { key: "every", label: "every nth", type: "number", min: 1, hint: "fires only on every this-many-th time, or for spend every this many points", show: is("trigger"), advanced: WHEN_IT },
  { key: "resetOn", label: "starts over on", type: "select", none: "never", options: TRIGGERS, show: (e) => e.type === "trigger" && e.every, advanced: WHEN_IT },
  { key: "resets", label: "takes the stacks off", type: "check", show: (e) => e.type === "trigger" && (e.atMax || e.atStacks), advanced: WHEN_IT },
  { key: "spendsStack", label: "takes a stack each time", ...spendsStack(made), show: is("trigger", "extraTargets"), advanced: WHEN_IT },

  { key: "fromStat", label: "from stat", type: "select", none: "none", options: [...STATS, "primary"], show: (e) => e.type === "stat" || e.type === "trigger" || (e.type === "modify" && e.change), advanced: HOW },
  { key: "ofCaster", label: "of whoever applied it", type: "check", show: (e) => e.type === "stat" && e.fromStat, advanced: HOW },
  { key: "mastery", label: "per point of mastery", hint: "percent more for each point of mastery percentage; on a trigger, percent more chance", type: "number", show: (e) => e.type === "stat" || e.type === "trigger" || (e.type === "modify" && e.change), advanced: HOW },
  byMissingHealthField({ show: (e) => e.type === "stat" || e.type === "modify", advanced: HOW }),
  { ...perCountField(made), show: is("stat", "trigger", "modify", "periodic"), advanced: HOW },
  { key: "addPerSpent", label: "add per point spent", type: "number", show: is("stat"), advanced: HOW },
  { key: "multiplyPerSpent", label: "multiply per point spent", type: "number", show: is("stat"), advanced: HOW },
  { key: "perTargetHit", label: "more per target hit", type: "number", show: (e) => e.type === "modify" && e.change, advanced: HOW },
  { key: "maxTotal", label: "at most", type: "number", min: 0, show: (e) => e.type === "modify" && e.change, advanced: HOW },
  amountField(made, { key: "addAmount", label: "adds an amount", show: is("modify"), advanced: HOW }),
  { key: "softCap", label: "soft cap", type: "number", min: 1, step: 1, show: is("periodic", "extraTargets"), advanced: HOW },
  { key: "drain", type: "number", hint: "heals the caster by this share of what it does", show: is("periodic"), advanced: HOW },
  { key: "max", label: "at most", type: "number", min: 1, step: 1, show: is("aura", "extraTargets", "periodic"), advanced: HOW },
  { key: "affects", type: "select", none: "the holder", options: ["enemies", "allies"], show: is("periodic"), advanced: OTHER },
  { key: "radius", type: "number", min: 0, label: "radius ft", show: is("periodic"), advanced: OTHER },

  { key: "becomes", type: "select", none: "none", options: abilitiesOf(made), show: (e) => e.type === "modify" && e.abilities?.length, advanced: RULES },
  { key: "ignores", type: "multi", options: ["cooldown", "requires"], show: (e) => e.type === "modify" && e.abilities?.length, advanced: RULES },
  { key: "addTags", label: "adds tags", type: "words", show: (e) => e.type === "modify" && !e.change, advanced: RULES },
  { key: "alwaysCrit", label: "always crits", type: "check", show: is("modify"), advanced: RULES },
  { key: "scalesWithCrit", label: "more with crit chance", type: "check", show: is("modify"), advanced: RULES },
  { key: "spentAs", label: "counts as spending", type: "numberOr", word: "max", after: "or the most", show: is("modify"), advanced: RULES },
  { key: "spendsUpTo", label: "can spend more", type: "number", min: 0, show: is("modify"), advanced: RULES },
  { key: "byExtraSpent", label: "times as much for spending it", type: "number", min: 0, show: is("modify"), advanced: RULES },
  overridesField(made, "abilities", () => abilityFields(made), ["castTime", "cooldown", "charges", "cost", "requires", "range", "minRange", "channel", "speed", "creatureTypes"], (e) => e.type === "modify" && !e.statuses?.length),
  overridesField(made, "statuses", () => statusFields(made), ["duration", "maxStacks", "dispel", "breaksOn", "keptBy", "consumedBy", "limit", "group", "leash", "pose", "aura"], (e) => e.type === "modify" && e.statuses?.length > 0),

  { key: "all", label: "all damage", type: "check", show: is("immune"), advanced: OTHER },
  { key: "harmful", label: "harmful statuses", type: "check", show: is("immune"), advanced: OTHER },
  { key: "from", type: "select", none: "caster", options: ["holder"], show: is("store"), advanced: OTHER },
  { key: "param", label: "named", hint: "a name other things can change this number by", show: is("stat", "periodic", "absorb", "trigger", "aura"), advanced: OTHER },
];

export const statusFields = (made) => [
  { key: "name" },
  { key: "description", type: "area" },
  { key: "icon" },
  { key: "kind", type: "select", options: ["buff", "debuff", "hidden"] },
  { key: "duration", label: "duration s", type: "number", min: 0, hint: "leave it out for one that lasts until removed" },
  { key: "stacking", type: "select", none: "refresh", options: ["replace", "stack"] },
  { key: "maxStacks", label: "max stacks", type: "number", min: 1, step: 1, show: (s) => s.stacking === "stack" },
  { key: "effects", type: "list", one: "effect", blank: () => ({ type: "stat" }), fields: statusEffectFields(made) },
  { key: "dispel", type: "select", none: "can't be", options: DISPELS, advanced: RULES },
  { key: "breaksOn", label: "breaks on", type: "multi", options: ["move", "damage", "action"], advanced: RULES },
  { key: "keptBy", label: "kept by", type: "group", show: (s) => s.breaksOn?.includes("action"), advanced: RULES, fields: [{ key: "abilities", type: "multi", options: abilitiesOf(made) }, { key: "tags", type: "words", label: "or tags" }] },
  {
    key: "consumedBy",
    label: "used up by",
    type: "group",
    collapsed: true,
    advanced: RULES,
    fields: [
      { key: "abilities", type: "multi", options: abilitiesOf(made) },
      { key: "tag", label: "or tag" },
      { key: "uses", type: "number", min: 1, step: 1, hint: "how many uses it lasts, 1 by default" },
      { key: "stacks", type: "number", min: 1, step: 1, hint: "takes this many stacks each use, instead of ending" },
    ],
  },
  { key: "limit", label: "how many can hold it", type: "number", min: 1, step: 1, advanced: RULES },
  { key: "group", hint: "only one status of a group at a time; a new one replaces the old", advanced: RULES },
  { key: "leash", label: "ends past ft", type: "number", min: 0, advanced: RULES },
  { key: "pose", type: "select", none: "none", options: ["sit"], advanced: "look" },
  { key: "aura", type: "group", collapsed: true, advanced: "look", fields: [{ key: "effect", type: "select", none: "none", options: VISUALS }, main] },
  { key: "tags", type: "words", advanced: "notes" },
  { key: "notes", type: "area", advanced: "notes" },
];
