import { newObjectId } from "../world/builtObjects.js";
import { gameDataPath, isClassPath } from "../world/paths.js";

// A class, as the world keeps it in classes/<id>.json.

export const classPath = (id) => gameDataPath("classes", id);

export const newClass = (name = "new class", random = Math.random) => ({ id: newObjectId(random), name });

export const newAbility = (level = 1, random = Math.random) => ({ id: newObjectId(random), name: "new ability", level, target: "enemy", range: "melee", effects: [] });

export const newStatus = (random = Math.random) => ({ id: newObjectId(random), name: "new status", kind: "buff", effects: [] });

// What in a class points at something it doesn't have: a list of sentences, for the page to show.
export function classProblems(made) {
  const statuses = new Set((made.statuses ?? []).map((s) => s.id));
  const resources = new Set((made.resources ?? []).map((r) => r.key));
  const problems = [];
  const status = (where, id) => {
    if (!statuses.has(id)) problems.push(`${where} ${id ? `points at a status this class doesn't have (${id})` : "needs a status picked"}.`);
  };
  const resource = (where, key) => {
    if (!resources.has(key)) problems.push(`${where} ${key ? `uses a resource this class doesn't have (${key})` : "needs a resource picked"}.`);
  };
  const conditions = (where, list = []) => list.forEach((c) => "status" in c && status(where, c.status));
  const effect = (where, e) => {
    if (e.type === "status") status(where, e.status);
    if (e.type === "resource") resource(where, e.resource);
  };
  for (const ability of made.abilities ?? []) {
    const where = ability.name || "An ability";
    (ability.cost ?? []).forEach((c) => resource(where, c.resource));
    conditions(where, ability.requires);
    (ability.effects ?? []).forEach((e) => effect(where, e));
  }
  for (const s of made.statuses ?? []) {
    const where = s.name || "A status";
    conditions(where, s.when);
    for (const e of s.effects ?? []) {
      conditions(where, e.when);
      if (e.type === "periodic" && e.does === "resource") resource(where, e.resource);
      if (e.type === "trigger" && e.effect) effect(where, e.effect);
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
