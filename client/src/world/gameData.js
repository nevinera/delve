import { ARMOR_SLOTS, ARMOR_TYPES } from "../character/armor.js";
import { HELD } from "../character/weapons.js";
import { gameDataPath } from "./paths.js";

// Checks a world's game data (docs/formats/game-data.md): classes, abilities, statuses, items,
// item templates, creatures, NPCs, dialogue and spawns. The schemas in docs/schema say the same
// things; this says them in words, and also checks that files point at things that exist.
//
// checkGameData(data, levelCap, problem, warning): data is { kind: Map(id -> parsed file) } for
// each kind of paths.js's GAME_DATA_DIRS, plus spawns: Map(path -> parsed spawns.json). problem and
// warning take (path, message).

export const MAX_LEVEL = 20;
export const MAX_RESOURCES = 3;
export const SCHOOLS = ["physical", "holy", "fire", "nature", "frost", "shadow", "arcane"];
export const PRIMARY_STATS = ["strength", "agility", "intellect"];
export const GEAR_STATS = [...PRIMARY_STATS, "stamina", "armor", "critRating", "hasteRating", "masteryRating", "versatilityRating", "leechRating", "avoidanceRating", "speedRating"];
export const DERIVED_STATS = ["attackPower", "spellPower", "maxHealth", "critChance", "critDamage", "haste", "mastery", "versatility", "leech", "avoidance", "dodge", "parry", "block", "movementSpeed", "attackSpeed", "stealth", "detection", "damageDone", "healingDone", "damageTaken", "healingTaken", "threat"];
export const RESOURCE_KINDS = ["mana", "energy", "rage", "points"];
export const TARGETS = ["enemy", "ally", "self", "ground", "none"];
export const EFFECT_TYPES = ["damage", "heal", "resource", "status", "interrupt", "taunt", "move"];
export const MOVES = ["charge", "leap", "knockback", "pull", "blink"];
export const AFFECTS = ["target", "self", "enemies", "allies"];
export const STATUS_KINDS = ["buff", "debuff", "hidden"];
export const STACKING = ["refresh", "replace", "stack"];
export const DISPELS = ["magic", "curse", "poison", "disease", "enrage"];
export const CONTROLS = ["stun", "root", "silence", "incapacitate", "disorient", "fear", "disarm"];
export const TRIGGERS = ["dealDamage", "takeDamage", "heal", "crit", "cast", "dodge", "parry", "block", "healthBelow"];
export const QUALITIES = ["poor", "common", "uncommon", "rare", "epic"];
export const ITEM_SLOTS = ["head", "neck", "shoulders", "back", "chest", "wrists", "hands", "waist", "legs", "feet", "finger", "trinket", "oneHand", "mainHand", "offHand", "twoHand", "ranged"];
export const WEAPON_SLOTS = ["oneHand", "mainHand", "offHand", "twoHand", "ranged"];
export const BODIES = ["humanoid", "goblin", "troll", "orc", "ogre", "kobold", "gnoll", "lizardfolk", "minotaur", "skeleton", "zombie", "giant", "harpy", "gargoyle", "imp", "centaur", "naga", "frogman", "earthElemental", "fireElemental", "waterElemental", "airElemental", "trog", "wolf", "panther", "rat", "bear", "boar", "stag", "horse", "lizard", "basilisk", "crocodile", "elephant", "dragon", "wyvern", "snake", "cobra", "shark", "barracuda", "stingray", "bat", "bobcat", "slime"];
export const CREATURE_TYPES = ["beast", "humanoid", "undead", "elemental", "demon", "dragonkin", "giant", "mechanical", "aberration", "critter"];
export const CLASSIFICATIONS = ["trivial", "normal", "elite", "rare", "rareElite", "boss"];
const WHEN = ["cast", "launch", "impact", "channel"];
const ON = ["caster", "target", "ground"];
const AROUND = ["self", "target", "ground"];
const RESOURCE_KEY = /^[a-z][a-z0-9_]*$/;
const COLOR = /^#[0-9a-f]{6}$/;

export function checkGameData(data, levelCap, problem, warning) {
  const has = (kind, id) => data[kind]?.has(id) ?? false;
  const at = gameDataPath;
  const ctx = { has, levelCap, statuses: data.statuses ?? new Map() };
  const each = (kind, check) => {
    for (const [id, thing] of data[kind] ?? []) {
      const path = at(kind, id);
      for (const m of [...notesProblems(thing), ...check(thing, ctx)]) (m.warning ? warning : problem)(path, m.message ?? m);
    }
  };
  each("classes", classProblems);
  each("abilities", abilityProblems);
  each("statuses", statusProblems);
  each("items", itemProblems);
  each("itemTemplates", templateProblems);
  each("creatures", creatureProblems);
  each("npcs", npcProblems);
  each("dialogues", dialogueProblems);
  for (const [path, spawns] of data.spawns ?? []) for (const m of [...notesProblems(spawns), ...spawnsProblems(spawns, ctx)]) (m.warning ? warning : problem)(path, m.message ?? m);

  // An ability a class gets should only cost resources the class has.
  for (const [id, klass] of data.classes ?? []) {
    const keys = new Set((Array.isArray(klass.resources) ? klass.resources : []).map((r) => r?.key));
    for (const entry of Array.isArray(klass.abilities) ? klass.abilities : []) {
      const ability = data.abilities?.get(entry?.ability);
      for (const cost of Array.isArray(ability?.cost) ? ability.cost : []) {
        if (cost?.resource && !keys.has(cost.resource)) problem(at("classes", id), `gets ${ability.name ?? entry.ability}, which costs ${cost.resource}, a resource the class doesn't have`);
      }
    }
  }
}

export function classProblems(klass, { has, levelCap = MAX_LEVEL }) {
  const out = named(klass);
  if (!(isObject(klass.colors) && isColor(klass.colors.major) && isColor(klass.colors.minor))) out.push('needs colors, { major, minor }, each "#rrggbb"');
  if (!(nonEmpty(klass.primaryStats) && klass.primaryStats.every((s) => PRIMARY_STATS.includes(s)))) out.push(`needs primaryStats, from ${PRIMARY_STATS.join(", ")}`);
  if (!nonEmpty(klass.resources) || klass.resources.length > MAX_RESOURCES) out.push(`needs 1 to ${MAX_RESOURCES} resources`);
  else {
    const keys = new Set();
    klass.resources.forEach((r, n) => {
      for (const m of resourceProblems(r)) out.push(`resource ${n + 1} ${m}`);
      if (keys.has(r?.key)) out.push(`has resource ${r.key} twice`);
      keys.add(r?.key);
    });
  }
  if (!nonEmpty(klass.armor)) out.push("needs the armor it wears, each { type, level }");
  else for (const a of klass.armor) if (!(ARMOR_TYPES.includes(a?.type) && isLevel(a.level))) out.push(`wears ${JSON.stringify(a)}: it needs a type from ${ARMOR_TYPES.join(", ")} and a level`);
  if (!nonEmpty(klass.weapons)) out.push("needs the weapons it uses");
  for (const w of [...list(klass.weapons), ...list(klass.offhands)]) if (!Object.hasOwn(HELD, w)) out.push(`uses ${JSON.stringify(w)}, which isn't a weapon type`);
  if (!Array.isArray(klass.abilities)) out.push("needs a list of abilities, each { ability, level }");
  for (const entry of list(klass.abilities)) {
    if (!(isObject(entry) && isLevel(entry.level))) out.push(`has an ability without a level: ${JSON.stringify(entry)}`);
    else if (!has("abilities", entry.ability)) out.push(`gets ability ${entry.ability}, which the world doesn't have`);
    else if (entry.level > levelCap) out.push({ warning: true, message: `gets ability ${entry.ability} at level ${entry.level}, past the level cap of ${levelCap}` });
  }
  for (const entry of list(klass.passives)) {
    if (!(isObject(entry) && isLevel(entry.level))) out.push(`has a passive without a level: ${JSON.stringify(entry)}`);
    else if (!has("statuses", entry.status)) out.push(`has passive ${entry.status}, a status the world doesn't have`);
  }
  if (!(isObject(klass.mastery) && typeof klass.mastery.name === "string")) out.push("needs a mastery, { name, status }");
  else if (!has("statuses", klass.mastery.status)) out.push(`has mastery status ${klass.mastery.status}, which the world doesn't have`);
  for (const id of list(klass.startingGear)) if (!has("items", id)) out.push(`starts with item ${id}, which the world doesn't have`);
  return out;
}

export function resourceProblems(r) {
  if (!isObject(r)) return ["should be an object"];
  const out = [];
  if (!RESOURCE_KEY.test(r.key ?? "")) out.push("needs a key of lowercase letters");
  if (typeof r.name !== "string" || !r.name) out.push("needs a name");
  if (!RESOURCE_KINDS.includes(r.kind)) out.push(`needs a kind, one of ${RESOURCE_KINDS.join(", ")}`);
  if (!isColor(r.color)) out.push('needs a "#rrggbb" color');
  if (r.kind === "points" && !(Number.isInteger(r.max) && r.max >= 1)) out.push("needs a max, as a points resource");
  if (r.kind !== "points" && ["max", "regen", "decay"].some((k) => r[k] !== undefined)) out.push(`can't set max, regen or decay: ${r.kind} has its own rules`);
  for (const k of ["regen", "decay"]) if (r[k] !== undefined && !(r[k] >= 0)) out.push(`needs a ${k} of 0 or more`);
  return out;
}

export function abilityProblems(ability, ctx) {
  const out = named(ability);
  if (!TARGETS.includes(ability.target)) out.push(`needs a target, one of ${TARGETS.join(", ")}`);
  if (ability.school !== undefined && !SCHOOLS.includes(ability.school)) out.push(`has school ${JSON.stringify(ability.school)}, not one of ${SCHOOLS.join(", ")}`);
  if (ability.icon !== undefined && typeof ability.icon !== "string") out.push("needs an icon name");
  if (ability.range !== undefined && !isDistance(ability.range)) out.push('needs a range of 0 or more, or "melee"');
  for (const key of ["minRange", "castTime", "gcd", "cooldown"]) if (ability[key] !== undefined && !(ability[key] >= 0)) out.push(`needs a ${key} of 0 or more`);
  for (const key of ["speed"]) if (ability[key] !== undefined && !(ability[key] > 0)) out.push(`needs a ${key} above 0`);
  if (["enemy", "ally", "ground"].includes(ability.target) && ability.range === undefined) out.push(`needs a range, to target ${ability.target === "ground" ? "the ground" : `an ${ability.target}`}`);
  if (ability.minRange !== undefined && (ability.range === "melee" || ability.minRange > ability.range)) out.push("has a minRange past its range");
  if (ability.requires !== undefined && !Array.isArray(ability.requires)) out.push("needs requires to be a list");
  list(ability.requires).forEach((c, n) => conditionProblems(c, ctx).forEach((m) => out.push(`requirement ${n + 1} ${m}`)));
  if (ability.creatureTypes !== undefined && !(nonEmpty(ability.creatureTypes) && ability.creatureTypes.every((t) => CREATURE_TYPES.includes(t)))) out.push(`needs creatureTypes from ${CREATURE_TYPES.join(", ")}`);
  if (ability.charges !== undefined && !(Number.isInteger(ability.charges) && ability.charges >= 1)) out.push("needs whole charges, 1 or more");
  if (ability.channel !== undefined && !(isObject(ability.channel) && ability.channel.duration > 0 && Number.isInteger(ability.channel.ticks) && ability.channel.ticks >= 1)) out.push("needs a channel of { duration, ticks }");
  if (ability.channel !== undefined && ability.castTime > 0) out.push("can't have both a cast time and a channel");
  for (const cost of list(ability.cost)) {
    if (!(isObject(cost) && typeof cost.resource === "string" && (cost.amount > 0) !== (cost.percent > 0))) out.push(`has a cost that needs a resource and an amount or a percent: ${JSON.stringify(cost)}`);
    else if (cost.percent !== undefined && cost.resource !== "mana") out.push(`costs a percent of ${cost.resource}; only mana costs a percent`);
  }
  if (!Array.isArray(ability.effects)) out.push("needs a list of effects");
  list(ability.effects).forEach((effect, n) => {
    for (const m of effectProblems(effect, ctx)) out.push(`effect ${n + 1} ${m}`);
    if (["target"].includes(effect?.affects) && ["self", "none"].includes(ability.target)) out.push(`effect ${n + 1} affects the target, but the ability has none`);
    if (effect?.around === "ground" && ability.target !== "ground") out.push(`effect ${n + 1} is around the ground, but the ability doesn't target it`);
  });
  for (const [key, check] of [["visuals", visualProblems], ["sounds", soundProblems]]) list(ability[key]).forEach((v, n) => check(v).forEach((m) => out.push(`${key.slice(0, -1)} ${n + 1} ${m}`)));
  return out;
}

// An ability's effect, or a trigger's (which affects self or target only).
export function effectProblems(effect, { has }, trigger = false) {
  if (!isObject(effect)) return ["should be an object"];
  const out = [];
  if (!EFFECT_TYPES.includes(effect.type)) out.push(`has type ${JSON.stringify(effect.type)}, not one of ${EFFECT_TYPES.join(", ")}`);
  const affects = trigger ? ["self", "target"] : AFFECTS;
  if (!affects.includes(effect.affects)) out.push(`needs affects, one of ${affects.join(", ")}`);
  if (["enemies", "allies"].includes(effect.affects)) {
    if (!(effect.radius > 0)) out.push(`needs a radius, affecting ${effect.affects}`);
    if (effect.height !== undefined && !(effect.height > 0)) out.push("needs a height above 0");
    if (effect.around !== undefined && !AROUND.includes(effect.around)) out.push("has around that isn't self, target or ground");
    if (effect.cone !== undefined && !(effect.cone > 0 && effect.cone <= 360 && (effect.around ?? "self") === "self")) out.push("needs a cone of up to 360 degrees, around self");
    if (effect.max !== undefined && !(Number.isInteger(effect.max) && effect.max >= 1)) out.push("needs a whole max, 1 or more");
  } else if (["around", "radius", "cone", "max"].some((k) => effect[k] !== undefined) || (effect.height !== undefined && effect.type !== "move")) out.push("can't have around, radius, height, cone or max unless it affects enemies or allies");
  if (["damage", "heal", "resource"].includes(effect.type) && !isAmount(effect.amount, effect.type === "resource")) out.push("needs an amount");
  if (effect.school !== undefined && !SCHOOLS.includes(effect.school)) out.push(`has school ${JSON.stringify(effect.school)}`);
  if (effect.type === "resource" && typeof effect.resource !== "string") out.push("needs a resource");
  if (effect.type === "status" && !has("statuses", effect.status)) out.push(`applies status ${effect.status}, which the world doesn't have`);
  if (effect.type === "interrupt" && !(effect.lockout > 0)) out.push("needs a lockout in seconds");
  if (effect.type === "taunt" && !(effect.duration > 0)) out.push("needs a duration in seconds");
  if (effect.duration !== undefined && !(effect.duration > 0)) out.push("needs a duration above 0");
  if (effect.type === "move") out.push(...moveProblems(effect));
  return out;
}

// A move effect: you move yourself (charge, leap, blink), or move others (knockback, pull).
function moveProblems(effect) {
  const out = [];
  if (!MOVES.includes(effect.kind)) return [`needs a kind, one of ${MOVES.join(", ")}`];
  const self = ["charge", "leap", "blink"].includes(effect.kind);
  if (self !== (effect.affects === "self")) out.push(self ? `needs to affect self, to ${effect.kind}` : `can't affect self, to ${effect.kind}`);
  if (["knockback", "blink"].includes(effect.kind) && !(effect.distance > 0)) out.push(`needs a distance above 0, to ${effect.kind}`);
  for (const key of ["distance", "speed"]) if (effect[key] !== undefined && !(effect[key] > 0)) out.push(`needs a ${key} above 0`);
  if (effect.height !== undefined && !(["leap", "knockback"].includes(effect.kind) && effect.height > 0)) out.push("has a height, which only a leap or knockback takes, above 0");
  return out;
}

// One of an ability's requires, or a status effect's when: { health, below or above }, { status, on },
// { stealthed } or { inCombat }.
function conditionProblems(c, { has }) {
  if (isObject(c) && c.health !== undefined) {
    const pct = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
    return ["self", "target"].includes(c.health) && (c.below === undefined) !== (c.above === undefined) && pct(c.below ?? c.above) ? [] : ["needs health (self or target), and below or above, a percent"];
  }
  if (isObject(c) && c.status !== undefined) {
    if (!["self", "target"].includes(c.on)) return ["needs on, self or target"];
    return has("statuses", c.status) ? [] : [`needs status ${c.status}, which the world doesn't have`];
  }
  for (const key of ["stealthed", "inCombat"]) if (isObject(c) && c[key] !== undefined) return typeof c[key] === "boolean" ? [] : [`needs ${key} true or false`];
  return ["needs { health, below or above }, { status, on }, { stealthed } or { inCombat }"];
}

export function statusProblems(status, ctx) {
  const out = named(status);
  if (status.icon !== undefined && typeof status.icon !== "string") out.push("needs an icon name");
  if (!STATUS_KINDS.includes(status.kind)) out.push(`needs a kind, one of ${STATUS_KINDS.join(", ")}`);
  if (status.dispel !== undefined && !DISPELS.includes(status.dispel)) out.push(`has dispel ${JSON.stringify(status.dispel)}, not one of ${DISPELS.join(", ")}`);
  if (status.duration !== undefined && !(status.duration > 0)) out.push("needs a duration above 0");
  if (status.stacking !== undefined && !STACKING.includes(status.stacking)) out.push(`has stacking ${JSON.stringify(status.stacking)}, not one of ${STACKING.join(", ")}`);
  if (status.maxStacks !== undefined && !(status.stacking === "stack" && Number.isInteger(status.maxStacks) && status.maxStacks >= 1)) out.push("needs stacking of stack, and a whole maxStacks of 1 or more");
  for (const b of list(status.breaksOn)) if (!["move", "damage", "action"].includes(b)) out.push(`breaks on ${JSON.stringify(b)}, not move, damage or action`);
  if (status.pose !== undefined && status.pose !== "sit") out.push('has a pose other than "sit"');
  if (status.aura !== undefined && !(isObject(status.aura) && typeof status.aura.effect === "string" && (status.aura.colors === undefined || isColors(status.aura.colors)))) out.push("needs an aura of { effect, colors }");
  if (!Array.isArray(status.effects)) out.push("needs a list of effects");
  list(status.effects).forEach((effect, n) => {
    for (const m of statusEffectProblems(effect, ctx)) out.push(`effect ${n + 1} ${m}`);
  });
  return out;
}

function statusEffectProblems(e, ctx) {
  if (!isObject(e)) return ["should be an object"];
  const out = [];
  if (e.when !== undefined && !Array.isArray(e.when)) out.push("needs when to be a list");
  list(e.when).forEach((c, n) => conditionProblems(c, ctx).forEach((m) => out.push(`condition ${n + 1} ${m}`)));
  switch (e.type) {
    case "stat":
      if (![...GEAR_STATS, ...DERIVED_STATS].includes(e.stat)) out.push(`changes ${JSON.stringify(e.stat)}, which isn't a stat`);
      if ((e.add === undefined) === (e.multiply === undefined) || ![e.add, e.multiply].some(Number.isFinite)) out.push("needs add or multiply, a number");
      if (e.school !== undefined && !SCHOOLS.includes(e.school)) out.push(`has school ${JSON.stringify(e.school)}`);
      break;
    case "periodic":
      if (!(e.every > 0)) out.push("needs every, the seconds between ticks");
      if (!["damage", "heal", "resource"].includes(e.does)) out.push("needs does: damage, heal or resource");
      if (!isAmount(e.amount, e.does === "resource")) out.push("needs an amount");
      if (e.does === "resource" && typeof e.resource !== "string") out.push("needs a resource");
      if (e.school !== undefined && !SCHOOLS.includes(e.school)) out.push(`has school ${JSON.stringify(e.school)}`);
      break;
    case "absorb":
      if (!isAmount(e.amount)) out.push("needs an amount");
      for (const s of list(e.schools)) if (!SCHOOLS.includes(s)) out.push(`absorbs ${JSON.stringify(s)}, which isn't a school`);
      break;
    case "control":
      if (!CONTROLS.includes(e.control)) out.push(`needs control, one of ${CONTROLS.join(", ")}`);
      break;
    case "trigger":
      if (!TRIGGERS.includes(e.on)) out.push(`needs on, one of ${TRIGGERS.join(", ")}`);
      if ((e.on === "healthBelow") !== (e.threshold !== undefined) || (e.threshold !== undefined && !(e.threshold > 0 && e.threshold <= 100))) out.push("needs a threshold percent with healthBelow, and only then");
      if (e.chance !== undefined && !(e.chance > 0 && e.chance <= 1)) out.push("needs a chance above 0, up to 1");
      if (e.cooldown !== undefined && !(e.cooldown >= 0)) out.push("needs a cooldown of 0 or more");
      for (const m of effectProblems(e.effect, ctx, true)) out.push(`'s effect ${m}`);
      break;
    case "stealth":
    case "none":
      break;
    default:
      out.push(`has type ${JSON.stringify(e.type)}, not stat, periodic, absorb, control, trigger, stealth or none`);
  }
  return out;
}

const positive = (v) => v === undefined || v > 0;
const visualProblems = (v) => (isObject(v) && typeof v.effect === "string" && WHEN.includes(v.when) && (v.on === undefined || ON.includes(v.on)) && (v.colors === undefined || isColors(v.colors)) && positive(v.scale) ? [] : [`needs an effect, when (${WHEN.join(", ")}), and maybe on (${ON.join(", ")}), colors and scale`]);
const soundProblems = (s) => (isObject(s) && typeof s.sound === "string" && WHEN.includes(s.when) && (s.on === undefined || ON.includes(s.on)) && positive(s.volume) && positive(s.pitch) ? [] : [`needs a sound, when (${WHEN.join(", ")}), and maybe on (${ON.join(", ")}), volume and pitch`]);

// What an item and an item template share: where it's worn and what it is.
function gearProblems(thing, out) {
  if (thing.slot !== undefined && !ITEM_SLOTS.includes(thing.slot)) out.push(`has slot ${JSON.stringify(thing.slot)}, not one of ${ITEM_SLOTS.join(", ")}`);
  if (thing.armorType !== undefined && !(ARMOR_TYPES.includes(thing.armorType) && ARMOR_SLOTS.includes(thing.slot))) out.push(`has armorType ${JSON.stringify(thing.armorType)}: it needs one of ${ARMOR_TYPES.join(", ")}, in one of ${ARMOR_SLOTS.join(", ")}`);
  if (thing.weaponType !== undefined && !(Object.hasOwn(HELD, thing.weaponType) && WEAPON_SLOTS.includes(thing.slot))) out.push(`has weaponType ${JSON.stringify(thing.weaponType)}: it needs a weapon type, in one of ${WEAPON_SLOTS.join(", ")}`);
  if (thing.speed !== undefined && !(thing.speed > 0 && thing.weaponType !== undefined)) out.push("has a speed, which only a weapon has");
  if (["mainHand", "twoHand", "ranged"].includes(thing.slot) && thing.weaponType === undefined) out.push(`needs a weaponType, in ${thing.slot}`);
  if (thing.requiredLevel !== undefined && !isLevel(thing.requiredLevel)) out.push("needs a whole requiredLevel, 1 or more");
}

export function itemProblems(item, { has }) {
  const out = named(item);
  if (item.icon !== undefined && typeof item.icon !== "string") out.push("needs an icon name");
  if (!QUALITIES.includes(item.quality)) out.push(`needs a quality, one of ${QUALITIES.join(", ")}`);
  if (!isLevel(item.itemLevel)) out.push("needs a whole itemLevel, 1 or more");
  gearProblems(item, out);
  if (item.damage !== undefined && !(isRange(item.damage) && item.weaponType !== undefined)) out.push("has damage, which only a weapon has, as [min, max]");
  if (item.stats !== undefined && !(isObject(item.stats) && Object.entries(item.stats).every(([k, v]) => GEAR_STATS.includes(k) && Number.isFinite(v)))) out.push(`needs stats from ${GEAR_STATS.join(", ")}, each a number`);
  if (item.colors !== undefined && !isColors(item.colors)) out.push('needs colors of [main, trim], each "#rrggbb"');
  if (item.price !== undefined && !(Number.isInteger(item.price) && item.price >= 0)) out.push("needs a price in whole copper");
  if (item.stack !== undefined && !(Number.isInteger(item.stack) && item.stack >= 1)) out.push("needs a whole stack, 1 or more");
  if (item.stack > 1 && item.slot !== undefined) out.push("stacks, but gear can't");
  if (item.use !== undefined && !has("abilities", item.use)) out.push(`uses ability ${item.use}, which the world doesn't have`);
  return out;
}

export function templateProblems(template) {
  const out = [];
  if (!(nonEmpty(template.names) && template.names.every((n) => typeof n === "string" && n))) out.push("needs names to pick from");
  if (template.slot === undefined) out.push("needs a slot");
  gearProblems(template, out);
  if (!(Array.isArray(template.levels) && template.levels.length === 2 && template.levels.every(isLevel) && template.levels[0] <= template.levels[1])) out.push("needs levels, [min, max]");
  if (!(isObject(template.qualities) && Object.keys(template.qualities).length && Object.entries(template.qualities).every(([k, v]) => QUALITIES.includes(k) && v > 0))) out.push(`needs qualities, weights for ${QUALITIES.join(", ")}`);
  const statKeys = ["primary", "secondary", ...GEAR_STATS];
  if (!(isObject(template.stats) && Object.keys(template.stats).length && Object.entries(template.stats).every(([k, v]) => statKeys.includes(k) && v > 0))) out.push("needs stats, weights for primary, secondary or gear stats");
  if (template.colors !== undefined && !(Array.isArray(template.colors) && template.colors.every(isColors))) out.push('needs colors as a list of [main, trim], each "#rrggbb"');
  return out;
}

export function creatureProblems(creature, { has, statuses }) {
  const out = named(creature);
  if (!isObject(creature.look)) out.push("needs a look, a character recipe");
  else if (!BODIES.includes(creature.look.body ?? "humanoid")) out.push(`has body ${JSON.stringify(creature.look.body)}, not one of ${BODIES.join(", ")}`);
  if (creature.creatureType !== undefined && !CREATURE_TYPES.includes(creature.creatureType)) out.push(`has creatureType ${JSON.stringify(creature.creatureType)}, not one of ${CREATURE_TYPES.join(", ")}`);
  if (creature.classification !== undefined && !CLASSIFICATIONS.includes(creature.classification)) out.push(`has classification ${JSON.stringify(creature.classification)}, not one of ${CLASSIFICATIONS.join(", ")}`);
  if (creature.reaction !== undefined && !["hostile", "neutral"].includes(creature.reaction)) out.push("has a reaction other than hostile or neutral");
  for (const key of ["health", "damage", "speed", "reach"]) if (creature[key] !== undefined && !(creature[key] > 0)) out.push(`needs a ${key} above 0`);
  for (const key of ["armor", "aggroRadius"]) if (creature[key] !== undefined && !(creature[key] >= 0)) out.push(`needs ${key} of 0 or more`);
  const attack = creature.attack;
  if (attack !== undefined && !(isObject(attack) && positive(attack.speed) && (attack.range === undefined || isDistance(attack.range)) && (attack.school === undefined || SCHOOLS.includes(attack.school)))) out.push("needs an attack of { speed, range, school }");
  if (creature.resource !== undefined) for (const m of resourceProblems(creature.resource)) out.push(`'s resource ${m}`);
  for (const id of list(creature.abilities)) if (!has("abilities", id)) out.push(`has ability ${id}, which the world doesn't have`);
  if (creature.stealthed !== undefined && !(has("statuses", creature.stealthed) && list(statuses.get(creature.stealthed)?.effects).some((e) => e?.type === "stealth"))) out.push(`spawns stealthed with ${creature.stealthed}, which isn't a stealth status the world has`);
  if (creature.onDeath !== undefined && !has("abilities", creature.onDeath)) out.push(`uses ability ${creature.onDeath} as it dies, which the world doesn't have`);
  const tactics = creature.tactics;
  if (tactics !== undefined) {
    if (!(isObject(tactics) && ["random", "priority", "rotation"].includes(tactics.type))) out.push("needs tactics of random, priority or rotation");
    else if (tactics.type !== "random" && !nonEmpty(tactics.abilities)) out.push(`needs ${tactics.type} tactics to list abilities`);
    else for (const id of list(tactics.abilities)) {
      if (id === creature.onDeath) out.push(`uses ${id} in its tactics, but that's what it does as it dies`);
      else if (!list(creature.abilities).includes(id)) out.push(`uses ${id} in its tactics, but doesn't have it`);
    }
  }
  const loot = creature.loot;
  if (loot !== undefined) {
    if (!isObject(loot)) out.push("needs loot to be an object");
    else {
      if (loot.gold !== undefined && !(loot.gold >= 0)) out.push("needs loot gold of 0 or more");
      for (const key of ["junk", "gear"]) if (loot[key] !== undefined && !(loot[key] >= 0 && loot[key] <= 1)) out.push(`needs a loot ${key} chance of 0 to 1`);
      for (const entry of list(loot.items)) {
        if (!(isObject(entry) && entry.chance > 0 && entry.chance <= 1)) out.push(`has loot without a chance of 0 to 1: ${JSON.stringify(entry)}`);
        else if (!has("items", entry.item)) out.push(`drops item ${entry.item}, which the world doesn't have`);
      }
    }
  }
  return out;
}

export function npcProblems(npc, { has }) {
  const out = named(npc);
  if (!isObject(npc.look)) out.push("needs a look, a character recipe");
  else if ((npc.look.body ?? "humanoid") !== "humanoid") out.push("needs a humanoid body");
  if (npc.dialogue !== undefined && !has("dialogues", npc.dialogue)) out.push(`says dialogue ${npc.dialogue}, which the world doesn't have`);
  if (npc.vendor !== undefined) {
    if (!(isObject(npc.vendor) && Array.isArray(npc.vendor.sells))) out.push("needs a vendor of { sells }");
    else for (const id of npc.vendor.sells) if (!has("items", id)) out.push(`sells item ${id}, which the world doesn't have`);
  }
  return out;
}

export function dialogueProblems(dialogue) {
  const out = [];
  if (!isObject(dialogue.lines)) return ["needs lines"];
  if (!Object.hasOwn(dialogue.lines, dialogue.start)) out.push(`starts at ${JSON.stringify(dialogue.start)}, which isn't one of its lines`);
  for (const [key, line] of Object.entries(dialogue.lines)) {
    if (!(isObject(line) && typeof line.text === "string")) {
      out.push(`line ${key} needs text`);
      continue;
    }
    for (const choice of list(line.choices)) {
      if (!(isObject(choice) && typeof choice.text === "string" && (choice.next === undefined) !== (choice.do === undefined))) out.push(`line ${key} has a choice that needs text, and next or do`);
      else if (choice.next !== undefined && !Object.hasOwn(dialogue.lines, choice.next)) out.push(`line ${key} goes to ${JSON.stringify(choice.next)}, which isn't one of its lines`);
      else if (choice.do !== undefined && !["vendor", "close"].includes(choice.do)) out.push(`line ${key} has a choice that does ${JSON.stringify(choice.do)}, not vendor or close`);
    }
  }
  return out;
}

export function spawnsProblems(spawns, { has, levelCap = MAX_LEVEL }) {
  if (!isObject(spawns)) return ["should be an object"];
  const out = [];
  if (spawns.version !== 1) out.push(`has version ${JSON.stringify(spawns.version)}, not 1`);
  if (!Array.isArray(spawns.regions) || !Array.isArray(spawns.placed)) return [...out, "needs lists of regions and placed"];
  const ids = new Set();
  const once = (id, what) => {
    if (!isId(id)) out.push(`has a ${what} without an id`);
    else if (ids.has(id)) out.push(`has id ${id} twice`);
    ids.add(id);
  };
  const levels = (l, what) => {
    if (!isLevels(l)) out.push(`${what} needs levels, a level or [min, max]`);
    else if (Math.max(...[l].flat()) > levelCap) out.push({ warning: true, message: `${what} is past the level cap of ${levelCap}` });
  };
  const timing = (s, what) => {
    if (s.respawn !== undefined && !(s.respawn > 0)) out.push(`${what} needs a respawn above 0`);
    if (s.wander !== undefined && !(s.wander >= 0)) out.push(`${what} needs a wander of 0 or more`);
  };
  for (const region of spawns.regions) {
    if (!isObject(region)) {
      out.push("has a region that isn't an object");
      continue;
    }
    once(region.id, "region");
    const what = `region ${region.name ?? region.id}`;
    for (const m of notesProblems(region)) out.push(`${what} ${m}`);
    if (!isRegion(region.area)) out.push(`${what} needs an area: polygons of rings of [x, z] points`);
    if (!Array.isArray(region.spawns)) out.push(`${what} needs a list of spawns`);
    list(region.spawns).forEach((s, n) => {
      const where = `${what}'s spawn ${n + 1}`;
      if (!isObject(s)) return out.push(`${where} should be an object`);
      if (!has("creatures", s.creature)) out.push(`${where} is creature ${s.creature}, which the world doesn't have`);
      if (!(s.density > 0)) out.push(`${where} needs a density above 0`);
      if (s.pack !== undefined && !(Array.isArray(s.pack) && s.pack.length === 2 && s.pack.every(isLevel) && s.pack[0] <= s.pack[1])) out.push(`${where} needs a pack of [min, max], whole numbers`);
      levels(s.levels, where);
      timing(s, where);
    });
  }
  for (const p of spawns.placed) {
    if (!isObject(p)) {
      out.push("has a placed one that isn't an object");
      continue;
    }
    once(p.id, "placed one");
    const what = `placed ${p.id}`;
    for (const m of notesProblems(p)) out.push(`${what} ${m}`);
    if (!(Array.isArray(p.at) && p.at.length === 3 && p.at.every(Number.isFinite))) out.push(`${what} needs at, [x, y, z] in feet`);
    if (p.yaw !== undefined && !Number.isFinite(p.yaw)) out.push(`${what} needs a yaw in degrees`);
    if ((p.creature === undefined) === (p.npc === undefined)) out.push(`${what} needs a creature or an npc`);
    else if (p.npc !== undefined) {
      if (!has("npcs", p.npc)) out.push(`${what} is npc ${p.npc}, which the world doesn't have`);
      if (["levels", "respawn", "wander", "pack", "patrol"].some((k) => p[k] !== undefined)) out.push(`${what} is an npc, which doesn't take levels, respawn, wander, pack or patrol`);
    } else {
      if (!has("creatures", p.creature)) out.push(`${what} is creature ${p.creature}, which the world doesn't have`);
      levels(p.levels, what);
      timing(p, what);
      if (p.pack !== undefined && !isId(p.pack)) out.push(`${what} needs a pack id`);
      if (p.patrol !== undefined) {
        if (!(isObject(p.patrol) && Array.isArray(p.patrol.points) && p.patrol.points.length >= 2 && p.patrol.points.every(isPoint))) out.push(`${what} needs a patrol of { points }, two or more [x, z]`);
        if (p.wander !== undefined) out.push(`${what} patrols, so it can't wander`);
      }
    }
  }
  return out;
}

// notes are free-form text the game never reads.
const notesProblems = (thing) => (isObject(thing) && thing.notes !== undefined && typeof thing.notes !== "string" ? ["needs notes to be text"] : []);

function named(thing) {
  return typeof thing.name === "string" && thing.name ? [] : ["needs a name"];
}

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const nonEmpty = (v) => Array.isArray(v) && v.length > 0;
const isId = (v) => /^[0-9a-z]{8}$/.test(v ?? "");
const isColor = (v) => COLOR.test(v ?? "");
const isColors = (v) => Array.isArray(v) && v.length === 2 && v.every(isColor);
const isLevel = (v) => Number.isInteger(v) && v >= 1;
const isLevels = (v) => isLevel(v) || (Array.isArray(v) && v.length === 2 && v.every(isLevel) && v[0] <= v[1]);
const isDistance = (v) => v === "melee" || (Number.isFinite(v) && v >= 0);
const isRange = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) && v[0] <= v[1];
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isRegion = (r) => Array.isArray(r) && r.length > 0 && r.every((poly) => Array.isArray(poly) && poly.every((ring) => Array.isArray(ring) && ring.length >= 3 && ring.every(isPoint)));
const AMOUNT_PARTS = ["base", "attackPower", "spellPower", "weapon", "mastery"];

// A number, [min, max], or { base, attackPower, spellPower, weapon, mastery }. A resource's amount
// can be negative.
function isAmount(v, signed = false) {
  const ok = (n) => Number.isFinite(n) && (signed || n >= 0);
  if (typeof v === "number") return ok(v);
  if (Array.isArray(v)) return isRange(v) && v.every(ok);
  if (!isObject(v) || !Object.keys(v).length || !Object.keys(v).every((k) => AMOUNT_PARTS.includes(k))) return false;
  return Object.entries(v).every(([k, part]) => (k === "base" && Array.isArray(part) ? isRange(part) && part.every(ok) : ok(part)));
}
