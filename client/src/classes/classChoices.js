import { HELD, OFFHANDS } from "../character/weapons.js";
import { ARMOR_TYPES } from "../character/armor.js";
import { newObjectId } from "../world/builtObjects.js";
import { setKey } from "./form.js";
import { addAbility, addStatus, GENERAL } from "./spellbook.js";

// The choices the Class tab and a talent's form offer, and what picking each does. Nothing here draws.
// Strips are as choiceStrip.js has them.

const capitalized = (name) => `${name[0].toUpperCase()}${name.slice(1)}`;
const option = (value) => ({ value, label: capitalized(value) });

// Adds or takes off one of a list, keeping the order they were picked in, which means best first.
function toggled(list = [], value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export const primaryStrip = (made) => ({
  name: "main stat",
  options: ["strength", "agility", "intellect"].map(option),
  many: made.primaryStats ?? [],
  pick: (v) => setKey(made, "primaryStats", toggled(made.primaryStats, v)),
});

const WEAPONS = Object.keys(HELD).filter((type) => !["shield", "orb"].includes(type));

function pickedGear(made, key, picked) {
  setKey(made, key, picked);
  // What it starts holding has to be something it can hold.
  const part = key === "weapons" ? "weapon" : "offhand";
  if (made.startingGear?.[part] && made.startingGear[part] !== "none" && !(picked ?? []).includes(made.startingGear[part])) {
    delete made.startingGear[part];
    if (!Object.keys(made.startingGear).length) delete made.startingGear;
  }
}

export const weaponStrip = (made) => ({ name: "weapons", options: WEAPONS.map(option), many: made.weapons ?? [], pick: (v) => pickedGear(made, "weapons", toggled(made.weapons, v)) });
export const offhandStrip = (made) => ({ name: "off hands", options: OFFHANDS.filter((type) => type !== "none").map(option), many: made.offhands ?? [], pick: (v) => pickedGear(made, "offhands", toggled(made.offhands, v)) });

function setStarting(made, part, value) {
  const gear = { ...made.startingGear };
  setKey(gear, part, value);
  setKey(made, "startingGear", gear);
}

export function startingWeaponStrip(made) {
  if ((made.weapons?.length ?? 0) < 2) return null;
  return { name: "starting weapon", options: [{ value: "", label: "Starts with the first" }, ...made.weapons.map((value) => ({ value, label: `Starts with ${value}` }))], value: made.startingGear?.weapon ?? "", pick: (v) => setStarting(made, "weapon", v) };
}

export function startingOffhandStrip(made) {
  if (!made.offhands?.length) return null;
  return { name: "starting off hand", options: [{ value: "", label: "Starts with the first" }, { value: "none", label: "Starts with nothing" }, ...made.offhands.map((value) => ({ value, label: `Starts with ${value}` }))], value: made.startingGear?.offhand ?? "", pick: (v) => setStarting(made, "offhand", v) };
}

export const armorTypes = () => ARMOR_TYPES;
export const armorOf = (made, type) => made.armor?.find((a) => a.type === type);

export function toggleArmor(made, type) {
  if (armorOf(made, type)) setKey(made, "armor", made.armor.filter((a) => a.type !== type));
  else made.armor = [...(made.armor ?? []), { type, level: 1 }];
}

// A new resource of a kind, with what it's usually called and looks like.
const RESOURCE_STARTS = {
  mana: { name: "Mana", color: "#4080e0" },
  energy: { name: "Energy", color: "#f0d040" },
  rage: { name: "Rage", color: "#d04040" },
  points: { name: "Points", color: "#e8c860", max: 5 },
};
export const RESOURCE_KINDS = Object.keys(RESOURCE_STARTS);
export const MOST_RESOURCES = 3;

export function addResource(made, kind) {
  const taken = (made.resources ?? []).map((r) => r.key);
  let key = kind;
  for (let n = 2; taken.includes(key); n++) key = `${kind}${n}`;
  const resource = { key, kind, ...RESOURCE_STARTS[kind] };
  made.resources = [...(made.resources ?? []), resource];
  return resource;
}

export function removeResource(made, resource) {
  setKey(made, "resources", made.resources.filter((r) => r !== resource));
}

export const resourceKindStrip = (resource) => ({
  name: "kind of resource",
  options: [{ value: "mana", label: "Mana: regenerates" }, { value: "energy", label: "Energy: refills fast" }, { value: "rage", label: "Rage: builds in a fight" }, { value: "points", label: "Points: built and spent" }],
  value: resource.kind,
  pick: (v) => {
    resource.kind = v;
    if (v === "points") resource.max ??= 5;
    else for (const key of ["max", "regen", "decay"]) delete resource[key];
  },
});

export const resourceMaxStrip = (resource) => (resource.kind === "points" ? { name: "most points", options: [1, 3, 5, 10].map((value) => ({ value, label: `Up to ${value}` })), value: resource.max, other: "points", pick: (v) => setKey(resource, "max", v) } : null);

export const resourceRegenStrip = (resource) =>
  resource.kind === "points"
    ? { name: "points over time", options: [{ value: 0, label: "Never on its own" }, ...[0.1, 0.25, 0.5, 1].map((value) => ({ value, label: `${value} a second` }))], value: resource.regen ?? 0, other: "/s", pick: (v) => setKey(resource, "regen", v || undefined) }
    : null;

export function addSpecialization(made, random = Math.random) {
  const spec = { id: newObjectId(random), name: "new specialization" };
  made.specializations = [...(made.specializations ?? []), spec];
  return spec;
}

// Its abilities stay on the class, as general ones, and talents for it go back to every specialization.
export function removeSpecialization(made, spec) {
  setKey(made, "specializations", made.specializations.filter((s) => s !== spec));
  for (const tier of Object.values(made.talents ?? {})) {
    for (const talent of tier) for (const grant of talent.grants ?? []) if (grant.spec === spec.id) delete grant.spec;
  }
}

export function addMastery(made, random = Math.random) {
  const status = addStatus(made, random);
  status.name = "mastery";
  status.kind = "hidden";
  made.mastery = { name: "new mastery", status: status.id };
  return status;
}

// A talent's prerequisite: one in the tier above.
export function requiresStrip(made, talent, level) {
  const above = made.talents?.[Number(level) - 5] ?? [];
  if (!above.length) return null;
  return {
    name: "prerequisite",
    options: [{ value: "", label: "Always on offer" }, ...above.map((t) => ({ value: t.id, label: `After ${t.name || t.id}` }))],
    value: talent.requires ?? "",
    pick: (v) => setKey(talent, "requires", v),
  };
}

export function grantSpecStrip(made, grant) {
  if (!made.specializations?.length) return null;
  return {
    name: "which specialization",
    options: [{ value: "", label: "Every specialization" }, ...made.specializations.map((s) => ({ value: s.id, label: s.name || s.id }))],
    value: grant.spec ?? "",
    pick: (v) => setKey(grant, "spec", v),
  };
}

// A talent's new ability is listed with the talents' on the spellbook, since only its talent grants it.
export function grantNewAbility(made, talent, grant, level, random = Math.random) {
  const ability = addAbility(made, GENERAL, Number(level), random);
  ability.name = talent.name && talent.name !== "new talent" ? talent.name : ability.name;
  grant.ability = ability.id;
  return ability;
}

// A status a talent grants is one you hold for good, so it starts out not showing.
export function grantNewStatus(made, talent, grant, id) {
  const status = made.statuses?.find((s) => s.id === id);
  if (status) {
    status.kind = "hidden";
    if (talent.name && talent.name !== "new talent") status.name = talent.name;
  }
  grant.status = id;
}

export function removeGrant(talent, grant) {
  talent.grants = (talent.grants ?? []).filter((g) => g !== grant);
}
