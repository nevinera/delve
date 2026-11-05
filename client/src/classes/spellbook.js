import { newObjectId } from "../world/builtObjects.js";
import { SPEC_LEVEL } from "../play/build.js";
import { newAbility, newStatus } from "./classFile.js";

// What the class editor's spellbook shows and does: its pages, what's on each, and adding and taking away.
// Nothing here draws. An ability on a specialization's list is on that page, one a talent grants is
// listed apart, and the rest are the class's general abilities, as play/build.js has it.

export const GENERAL = "general";

export const bookPages = (made) => [{ id: GENERAL, name: "General" }, ...(made.specializations ?? []).map((s) => ({ id: s.id, name: s.name || s.id }))];

const statusOf = (made, id) => (made.statuses ?? []).find((s) => s.id === id);
const talentsOf = (made) => Object.values(made.talents ?? {}).flat();
const specAbilities = (made) => new Set((made.specializations ?? []).flatMap((s) => s.abilities ?? []));
const talentAbilities = (made) => new Set(talentsOf(made).flatMap((t) => (t.grants ?? []).map((g) => g.ability).filter(Boolean)));

const abilityTile = (ability) => ({ kind: "ability", id: ability.id, name: ability.name, icon: ability.icon, level: ability.level ?? 1 });
const byName = (a, b) => (a.name ?? "").localeCompare(b.name ?? "");

// Tiles in rows by level, lowest first, and on the general page the abilities only talents grant.
export function pageTiles(made, page) {
  const abilities = made.abilities ?? [];
  const spec = (made.specializations ?? []).find((s) => s.id === page);
  const chosen = specAbilities(made);
  const fromTalents = talentAbilities(made);
  const here = spec ? abilities.filter((a) => spec.abilities?.includes(a.id)) : abilities.filter((a) => !chosen.has(a.id) && !fromTalents.has(a.id));
  const tiles = here.map(abilityTile);
  if (spec?.status) tiles.push({ kind: "specPassive", spec: spec.id, name: statusOf(made, spec.status)?.name ?? spec.status, icon: statusOf(made, spec.status)?.icon, level: SPEC_LEVEL });
  if (!spec) {
    (made.passives ?? []).forEach((p, index) => tiles.push({ kind: "passive", index, name: statusOf(made, p.status)?.name ?? "new passive", icon: statusOf(made, p.status)?.icon, level: p.level ?? 1 }));
  }
  const levels = [...new Set(tiles.map((t) => t.level))].sort((a, b) => a - b);
  return {
    rows: levels.map((level) => ({ level, tiles: tiles.filter((t) => t.level === level).sort(byName) })),
    fromTalents: spec ? [] : abilities.filter((a) => fromTalents.has(a.id) && !chosen.has(a.id)).map(abilityTile).sort(byName),
  };
}

export function addAbility(made, page, level = 1, random = Math.random) {
  const ability = newAbility(level, random);
  made.abilities = [...(made.abilities ?? []), ability];
  const spec = made.specializations?.find((s) => s.id === page);
  if (spec) spec.abilities = [...(spec.abilities ?? []), ability.id];
  return ability;
}

export function addStatus(made, random = Math.random) {
  const status = newStatus(random);
  made.statuses = [...(made.statuses ?? []), status];
  return status;
}

// Whether this page can take another passive: a specialization holds one status.
export const roomForPassive = (made, page) => {
  const spec = made.specializations?.find((s) => s.id === page);
  return !spec || !spec.status;
};

// A passive is a status held from a level on, so this makes both. It returns the status.
export function addPassive(made, page, level = 1, random = Math.random) {
  const status = addStatus(made, random);
  status.name = "new passive";
  status.kind = "hidden";
  const spec = made.specializations?.find((s) => s.id === page);
  if (spec) spec.status = status.id;
  else made.passives = [...(made.passives ?? []), { status: status.id, level }];
  return status;
}

export function duplicateAbility(made, id, random = Math.random) {
  const ability = made.abilities?.find((a) => a.id === id);
  if (!ability) return null;
  const copy = { ...structuredClone(ability), id: newObjectId(random), name: `${ability.name} copy` };
  made.abilities.push(copy);
  for (const spec of made.specializations ?? []) if (spec.abilities?.includes(id)) spec.abilities.push(copy.id);
  return copy;
}

export function removeAbility(made, id) {
  made.abilities = (made.abilities ?? []).filter((a) => a.id !== id);
  if (!made.abilities.length) delete made.abilities;
  for (const spec of made.specializations ?? []) {
    if (!spec.abilities) continue;
    spec.abilities = spec.abilities.filter((a) => a !== id);
    if (!spec.abilities.length) delete spec.abilities;
  }
}

// Puts an ability on a specialization's page or takes it off. An ability on none is general.
export function toggleOnSpec(made, id, specId) {
  const spec = made.specializations?.find((s) => s.id === specId);
  if (!spec) return;
  if (spec.abilities?.includes(id)) {
    spec.abilities = spec.abilities.filter((a) => a !== id);
    if (!spec.abilities.length) delete spec.abilities;
  } else spec.abilities = [...(spec.abilities ?? []), id];
}

const holdsValue = (value, id) => {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((v) => holdsValue(v, id));
  if (value && typeof value === "object") return Object.entries(value).some(([key, v]) => key === id || holdsValue(v, id));
  return false;
};

// What in the class points at a status, as words to show beside it.
export function usedBy(made, id) {
  const uses = [];
  for (const a of made.abilities ?? []) if (holdsValue(a, id)) uses.push(a.name);
  for (const s of made.statuses ?? []) if (s.id !== id && holdsValue(s, id)) uses.push(s.name);
  if ((made.passives ?? []).some((p) => p.status === id)) uses.push("passive");
  for (const s of made.specializations ?? []) if (s.status === id) uses.push(s.name || s.id);
  if (made.mastery?.status === id) uses.push("mastery");
  for (const t of talentsOf(made)) if (holdsValue(t.grants, id)) uses.push(t.name || t.id);
  return uses;
}

export function removeStatus(made, id) {
  made.statuses = (made.statuses ?? []).filter((s) => s.id !== id);
  if (!made.statuses.length) delete made.statuses;
}

// Takes a passive off the class, and its status too if nothing else uses it.
export function removePassive(made, tile) {
  let status;
  if (tile.kind === "specPassive") {
    const spec = made.specializations?.find((s) => s.id === tile.spec);
    status = spec?.status;
    if (spec) delete spec.status;
  } else {
    status = made.passives?.[tile.index]?.status;
    made.passives?.splice(tile.index, 1);
    if (!made.passives?.length) delete made.passives;
  }
  if (status && !usedBy(made, status).length) removeStatus(made, status);
}

export function addTalent(made, level, random = Math.random) {
  const talent = { id: newObjectId(random), name: "new talent", grants: [{}] };
  made.talents ??= {};
  made.talents[level] = [...(made.talents[level] ?? []), talent];
  return talent;
}

export function removeTalent(made, level, id) {
  const tier = (made.talents?.[level] ?? []).filter((t) => t.id !== id);
  if (tier.length) made.talents[level] = tier;
  else delete made.talents?.[level];
  for (const below of made.talents?.[Number(level) + 5] ?? []) if (below.requires === id) delete below.requires;
  if (made.talents && !Object.keys(made.talents).length) delete made.talents;
}

// What a talent shows: its name's icon comes from what it grants, ability or status.
export function talentIcon(made, talent) {
  for (const grant of talent.grants ?? []) {
    const icon = (made.abilities ?? []).find((a) => a.id === grant.ability)?.icon ?? statusOf(made, grant.status)?.icon;
    if (icon) return icon;
  }
  return undefined;
}

// The specializations a talent's limited to, by name, or none for every one.
export function talentSpecs(made, talent) {
  const grants = talent.grants ?? [];
  if (!grants.length || grants.some((g) => !g.spec)) return [];
  return [...new Set(grants.map((g) => g.spec))].map((id) => made.specializations?.find((s) => s.id === id)?.name ?? id);
}
