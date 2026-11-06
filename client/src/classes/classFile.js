import { newObjectId } from "../world/builtObjects.js";
import { gameDataPath, isClassPath } from "../world/paths.js";
import CLASS_REFS from "./classRefs.json";

// A class, as the world keeps it in classes/<id>.json.

export const BUILT_IN_CHANGES = new Set(["cost", "cooldown", "amount", "absorb", "lockout", "cone", "distance", "limit", "uses", "delay", "cooldownRate", "tickRate", "channelDuration", "channelTicks", "castTime", "charges", "range", "radius", "maxTargets", "duration", "damage", "healing", "critChance", "critDamage", "critHealing", "resourceGain", "byExtraSpent", "maxStacks", "mastery", "every", "others", "stacks"]);

export const classPath = (id) => gameDataPath("classes", id);

export const newClass = (name = "new class", random = Math.random) => ({ id: newObjectId(random), name });

export const newAbility = (level = 1, random = Math.random) => ({ id: newObjectId(random), name: "new ability", level, target: "enemy", range: "melee", effects: [] });

export const newStatus = (random = Math.random) => ({ id: newObjectId(random), name: "new status", kind: "buff", effects: [] });

// The levels the game offers a talent tier at. A class fills them, or leaves them empty.
export const TALENT_TIER_STEP = 5;
export const FIRST_TALENT_TIER = 15;
export const LAST_TALENT_TIER = 60;
export const TALENT_TIERS = Array.from({ length: (LAST_TALENT_TIER - FIRST_TALENT_TIER) / TALENT_TIER_STEP + 1 }, (_, i) => FIRST_TALENT_TIER + i * TALENT_TIER_STEP);
const MIN_TALENTS_IN_TIER = 3;
const MAX_TALENTS_IN_TIER = 6;
const MIN_TALENTS_ON_OFFER = 2;
const isTalentTier = (level) => level >= FIRST_TALENT_TIER && (level - FIRST_TALENT_TIER) % TALENT_TIER_STEP === 0;
const offeredTo = (talent, spec) => talent.grants?.some((g) => !g.spec || g.spec === spec);

// Where a class names its statuses, abilities, resources, units and specializations, written from
// the class schema's x-refers marks by `go generate ./internal/combat` in game-server.
const article = (kind) => (kind === "ability" ? "an" : "a");
const needs = (where, kind) => `${where} needs ${article(kind)} ${kind} picked.`;
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// What in a class names something the class doesn't have, as sentences. The game server makes the
// same check from the same map (game-server/internal/combat/refs.go), in the same order.
export function referenceProblems(made) {
  const ids = (list, key = "id") => new Set((list ?? []).map((each) => each?.[key]).filter((id) => typeof id === "string"));
  const has = { status: ids(made.statuses), ability: ids(made.abilities), unit: ids(made.units), specialization: ids(made.specializations), resource: ids(made.resources, "key") };
  const problems = [];
  const add = (problem) => problems.includes(problem) || problems.push(problem);
  const walk = (node, value, where) => {
    if (!node || value === undefined || value === null) return;
    if (node.ref) walk(CLASS_REFS.defs[node.ref], value, where);
    const object = typeof value === "object" && !Array.isArray(value) ? value : null;
    if (node.what && object) where = typeof object.name === "string" && object.name ? object.name : node.what;
    if (node.refers) {
      const id = typeof value === "string" ? value : "";
      if (!id) add(needs(where, node.refers));
      else if (!has[node.refers].has(id)) add(`${where} points at ${article(node.refers)} ${node.refers} this class doesn't have (${id}).`);
      return;
    }
    for (const key of object ? Object.keys(node.props ?? {}).sort(byCode) : []) {
      if (!(key in object) && node.needs?.includes(key)) add(needs(where, node.props[key].refers));
      walk(node.props[key], object[key], where);
    }
    if (Array.isArray(value) && node.items) value.forEach((each) => walk(node.items, each, where));
    if (object && node.values) for (const key of Object.keys(object).sort(byCode)) walk(node.values, object[key], where);
  };
  walk(CLASS_REFS.root, made, "The class");
  return problems;
}

// What's wrong with a class: what it names that it doesn't have, and the rules its talents,
// costs, units, modifies and resources break. A list of sentences, for the page to show.
export function classProblems(made) {
  const problems = referenceProblems(made);
  for (const ability of made.abilities ?? []) {
    const where = ability.name || "An ability";
    const spendsAll = (ability.cost ?? []).filter((c) => c.all).length;
    if (spendsAll > 1) problems.push(`${where} spends all of more than one resource, so it can't tell what to scale with.`);
    if (!spendsAll && (ability.effects ?? []).some((e) => e.durationPerSpent !== undefined || e.amount?.perSpent !== undefined)) problems.push(`${where} scales with points spent, but no cost spends all.`);
  }
  const specs = new Set((made.specializations ?? []).map((s) => s.id));
  const tiers = made.talents ?? {};
  for (const [key, talents] of Object.entries(tiers)) {
    const level = Number(key);
    if (!isTalentTier(level)) problems.push(`Talents at level ${key} aren't in a tier: tiers come every ${TALENT_TIER_STEP} levels from ${FIRST_TALENT_TIER}.`);
    if (!talents.length) continue;
    if (talents.length < MIN_TALENTS_IN_TIER || talents.length > MAX_TALENTS_IN_TIER) problems.push(`The level ${key} tier has ${talents.length} talents, and needs ${MIN_TALENTS_IN_TIER} to ${MAX_TALENTS_IN_TIER}.`);
    const above = tiers[level - TALENT_TIER_STEP] ?? [];
    for (const t of talents) {
      if (t.requires && !above.some((a) => a.id === t.requires)) problems.push(`${t.name || "A talent"} requires a talent that isn't in the tier directly above (${t.requires}).`);
    }
    for (const spec of specs.size ? specs : [undefined]) {
      const offered = talents.filter((t) => offeredTo(t, spec));
      const picks = above.filter((a) => offeredTo(a, spec));
      for (const pick of picks.length ? picks : [undefined]) {
        const open = offered.filter((t) => !t.requires || t.requires === pick?.id);
        if (open.length < MIN_TALENTS_ON_OFFER) {
          const who = [spec && `the ${spec} specialization`, pick && `${pick.name || pick.id} picked above`].filter(Boolean).join(" with ");
          problems.push(`The level ${key} tier offers only ${open.length}${who ? ` to ${who}` : ""}, and has to offer at least ${MIN_TALENTS_ON_OFFER}.`);
        }
      }
    }
  }
  for (const u of made.units ?? []) {
    (u.autocast ?? []).filter((id) => !u.abilities?.includes(id)).forEach((id) => problems.push(`${u.name || "A unit"} autocasts an ability it doesn't have (${id}).`));
  }
  for (const s of made.statuses ?? []) {
    const where = s.name || "A status";
    for (const e of (s.effects ?? []).filter((e) => e.type === "modify")) {
      if (!e.abilities?.length && !e.tag && !e.statuses?.length) problems.push(`${where} needs an ability, a tag or a status to modify.`);
      if (e.change && !BUILT_IN_CHANGES.has(e.change) && !e.tag) {
        const targets = [...(made.abilities ?? []).filter((a) => e.abilities?.includes(a.id)), ...(made.statuses ?? []).filter((t) => e.statuses?.includes(t.id))];
        targets.filter((t) => !(t.effects ?? []).some((f) => f.param === e.change || f.effect?.param === e.change)).forEach((t) => problems.push(`${where} changes "${e.change}", which ${t.name || t.id} doesn't name.`));
      }
    }
  }
  const keys = (made.resources ?? []).map((r) => r.key);
  if (keys.some((key) => !/^[a-z][a-z0-9_]*$/.test(key))) problems.push("A resource's key has to be lowercase letters, digits and _, starting with a letter.");
  if (new Set(keys).size !== keys.length) problems.push("Two resources have the same key.");
  return problems;
}

// The world's classes, by name. world: readJson and its files.
export function classesOf(world) {
  return [...world.files.keys()]
    .filter(isClassPath)
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
