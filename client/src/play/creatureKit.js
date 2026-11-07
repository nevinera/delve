import { strFromU8 } from "fflate";

// What a mob casts with, as the game server makes it (game-server/internal/worlds/abilities.go):
// a class with the id creatures/<id>, of its creature's abilities, from the world's abilities/,
// and the statuses they name, from statuses/. A client can't list a folder, so it reads only the
// statuses the abilities name. file(path) gives a world file's bytes, or null.

export const KIT_PREFIX = "creatures/";

// The ids of the statuses named anywhere in `json`, as a `status`.
function statusesNamed(json, into = new Set()) {
  if (Array.isArray(json)) json.forEach((v) => statusesNamed(v, into));
  else if (json && typeof json === "object") {
    for (const [key, value] of Object.entries(json)) {
      if (key === "status" && typeof value === "string") into.add(value);
      else statusesNamed(value, into);
    }
  }
  return into;
}

export async function creatureKit(id, file) {
  const read = async (path) => {
    try {
      const bytes = await file(path);
      return bytes ? JSON.parse(strFromU8(bytes)) : null;
    } catch {
      return null;
    }
  };
  const creature = await read(`creatures/${id}.json`);
  if (!creature) return null;
  const ids = [...new Set([...(creature.abilities ?? []).map((pick) => (typeof pick === "string" ? pick : pick?.id)), creature.onDeath].filter(Boolean))];
  const abilities = (await Promise.all(ids.map((a) => read(`abilities/${a}.json`)))).filter((a) => a?.id);
  const statuses = (await Promise.all([...statusesNamed(abilities)].map((s) => read(`statuses/${s}.json`)))).filter((s) => s?.id);
  return { id: `${KIT_PREFIX}${id}`, name: creature.name, abilities, statuses, resources: creature.resource ? [creature.resource] : [] };
}
