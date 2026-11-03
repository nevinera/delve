import { newObjectId } from "../world/builtObjects.js";
import { gameDataPath, isClassPath } from "../world/paths.js";

// A class, as the world keeps it in classes/<id>.json.

const BUILT_IN_CHANGES = new Set(["cost", "cooldown", "amount", "absorb", "lockout", "cone", "distance", "limit", "uses", "delay", "cooldownRate", "tickRate", "channelDuration", "channelTicks", "castTime", "charges", "range", "radius", "maxTargets", "duration", "damage", "healing", "critChance", "critDamage", "critHealing", "maxStacks", "mastery", "every", "others", "stacks"]);

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

// What in a class points at something it doesn't have: a list of sentences, for the page to show.
export function classProblems(made) {
  const statuses = new Set((made.statuses ?? []).map((s) => s.id));
  const abilities = new Set((made.abilities ?? []).map((a) => a.id));
  const resources = new Set((made.resources ?? []).map((r) => r.key));
  const units = new Set((made.units ?? []).map((u) => u.id));
  const problems = [];
  const status = (where, id) => {
    if (!statuses.has(id)) problems.push(`${where} ${id ? `points at a status this class doesn't have (${id})` : "needs a status picked"}.`);
  };
  const resource = (where, key) => {
    if (!resources.has(key)) problems.push(`${where} ${key ? `uses a resource this class doesn't have (${key})` : "needs a resource picked"}.`);
  };
  const conditions = (where, list = []) =>
    list.forEach((c) => {
      if ("status" in c) status(where, c.status);
      if ("holders" in c) status(where, c.holders);
      if ("resource" in c) resource(where, c.resource);
      (c.unitsOut ?? []).filter((id) => !units.has(id)).forEach((id) => problems.push(`${where} points at a unit this class doesn't have (${id}).`));
      if ("inArea" in c && !(made.abilities ?? []).some((a) => a.id === c.inArea)) problems.push(`${where} points at an ability this class doesn't have (${c.inArea}).`);
      if (c.anyOf) conditions(where, c.anyOf);
      if (c.not) conditions(where, [c.not]);
    });
  const counted = (where, c) => {
    if (!c) return;
    if (c.statusStacks) status(where, c.statusStacks);
    if (c.holders) status(where, c.holders);
    (c.statusesOnTarget ?? []).forEach((id) => status(where, id));
    (c.unitsOut ?? []).filter((id) => !units.has(id)).forEach((id) => problems.push(`${where} points at a unit this class doesn't have (${id}).`));
    if (c.resource) resource(where, c.resource);
  };
  const effect = (where, e) => {
    counted(where, e.perCount);
    (e.amount?.shareOf?.statuses ?? []).forEach((id) => status(where, id));
    (e.holding ?? []).forEach((id) => status(where, id));
    conditions(where, e.when);
    if (e.type === "status" || (e.type === "consume" && !e.statuses)) status(where, e.status);
    (e.type === "extend" || e.type === "consume" ? (e.statuses ?? []) : []).forEach((id) => status(where, id));
    if (e.type === "resource") resource(where, e.resource);
    if (e.type === "area") {
      if (e.status) status(where, e.status);
      if (e.effect) effect(where, e.effect);
    }
    if (e.type === "summon" && !units.has(e.unit)) problems.push(`${where} summons a unit this class doesn't have (${e.unit}).`);
    (e.units ?? []).filter((id) => !units.has(id)).forEach((id) => problems.push(`${where} points at a unit this class doesn't have (${id}).`));
    if (e.type === "command" && !abilities.has(e.ability)) problems.push(`${where} commands an ability this class doesn't have (${e.ability}).`);
    (e.statuses ?? []).forEach((id) => status(where, id));
    if (e.type === "cooldown") (e.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} changes the cooldown of an ability this class doesn't have (${id}).`));
  };
  for (const ability of made.abilities ?? []) {
    const where = ability.name || "An ability";
    (ability.cost ?? []).forEach((c) => resource(where, c.resource));
    conditions(where, ability.requires);
    (ability.effects ?? []).forEach((e) => effect(where, e));
    const spendsAll = (ability.cost ?? []).filter((c) => c.all).length;
    if (spendsAll > 1) problems.push(`${where} spends all of more than one resource, so it can't tell what to scale with.`);
    if (!spendsAll && (ability.effects ?? []).some((e) => e.durationPerSpent !== undefined || e.amount?.perSpent !== undefined)) problems.push(`${where} scales with points spent, but no cost spends all.`);
  }
  const specs = new Set((made.specializations ?? []).map((s) => s.id));
  for (const s of made.specializations ?? []) {
    const where = s.name || "A specialization";
    if (s.status) status(where, s.status);
    (s.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} grants an ability this class doesn't have (${id}).`));
  }
  const tiers = made.talents ?? {};
  for (const [key, talents] of Object.entries(tiers)) {
    const level = Number(key);
    if (!isTalentTier(level)) problems.push(`Talents at level ${key} aren't in a tier: tiers come every ${TALENT_TIER_STEP} levels from ${FIRST_TALENT_TIER}.`);
    if (!talents.length) continue;
    if (talents.length < MIN_TALENTS_IN_TIER || talents.length > MAX_TALENTS_IN_TIER) problems.push(`The level ${key} tier has ${talents.length} talents, and needs ${MIN_TALENTS_IN_TIER} to ${MAX_TALENTS_IN_TIER}.`);
    const above = tiers[level - TALENT_TIER_STEP] ?? [];
    for (const t of talents) {
      const where = t.name || "A talent";
      if (t.requires && !above.some((a) => a.id === t.requires)) problems.push(`${where} requires a talent that isn't in the tier directly above (${t.requires}).`);
      for (const g of t.grants ?? []) {
        if (g.status) status(where, g.status);
        if (g.ability && !abilities.has(g.ability)) problems.push(`${where} grants an ability this class doesn't have (${g.ability}).`);
        if (g.spec && !specs.has(g.spec)) problems.push(`${where} is for a specialization this class doesn't have (${g.spec}).`);
      }
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
    const where = u.name || "A unit";
    (u.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} uses an ability this class doesn't have (${id}).`));
    (u.autocast ?? []).filter((id) => !u.abilities?.includes(id)).forEach((id) => problems.push(`${where} autocasts an ability it doesn't have (${id}).`));
  }
  for (const s of made.statuses ?? []) {
    const where = s.name || "A status";
    conditions(where, s.when);
    (s.keptBy?.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} is kept by an ability this class doesn't have (${id}).`));
    (s.consumedBy?.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} is used up by an ability this class doesn't have (${id}).`));
    for (const e of s.effects ?? []) {
      conditions(where, e.when);
      counted(where, e.perCount);
      (e.amount?.shareOf?.statuses ?? []).forEach((id) => status(where, id));
      if (e.into && !units.has(e.into)) problems.push(`${where} turns into a unit this class doesn't have (${e.into}).`);
      if (e.type === "periodic" && e.does === "resource") resource(where, e.resource);
      if ((e.type === "trigger" || e.type === "aura") && e.effect) effect(where, e.effect);
      if (e.type === "aura" && e.status) status(where, e.status);
      if (e.type === "stat") {
        (e.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} counts an ability this class doesn't have (${id}).`));
        (e.statuses ?? []).forEach((id) => status(where, id));
      }
      if (e.type === "trigger") {
        (e.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} waits for an ability this class doesn't have (${id}).`));
        (e.statuses ?? []).forEach((id) => status(where, id));
      }
      if (e.type === "modify") {
        if (!e.abilities?.length && !e.tag && !e.statuses?.length) problems.push(`${where} needs an ability, a tag or a status to modify.`);
        (e.statuses ?? []).forEach((id) => status(where, id));
        (e.abilities ?? []).filter((id) => !abilities.has(id)).forEach((id) => problems.push(`${where} modifies an ability this class doesn't have (${id}).`));
        if (e.change && !BUILT_IN_CHANGES.has(e.change) && !e.tag) {
          const targets = [...(made.abilities ?? []).filter((a) => e.abilities?.includes(a.id)), ...(made.statuses ?? []).filter((t) => e.statuses?.includes(t.id))];
          targets.filter((t) => !(t.effects ?? []).some((f) => f.param === e.change || f.effect?.param === e.change)).forEach((t) => problems.push(`${where} changes "${e.change}", which ${t.name || t.id} doesn't name.`));
        }
        (e.addEffects ?? []).forEach((added) => effect(where, added));
        (e.statusEffects ?? []).forEach((added) => {
          conditions(where, added.when);
          if (added.type === "periodic" && added.does === "resource") resource(where, added.resource);
          if (added.type === "trigger" && added.effect) effect(where, added.effect);
        });
      }
    }
  }
  (made.passives ?? []).forEach((p) => status("A passive", p.status));
  if (made.mastery) status("The mastery", made.mastery.status);
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
