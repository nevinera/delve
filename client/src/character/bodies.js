// The bodies the game ships (.agents/formats.md), one file each in bodies/: its skeleton, the
// shape its skeleton's builder makes it from, and the look its creatures are picked from.
const files = import.meta.glob("./bodies/*.json", { eager: true, import: "default" });

export const SHIPPED_BODIES = Object.fromEntries(Object.entries(files).map(([path, body]) => [path.match(/([\w-]+)\.json$/)[1], body]));

// The bodies in use, by name: the shipped ones, as `core:<name>` too, with the open world's
// patterns and colorations added to them, and the world's own bodies over shipped ones of the same
// name, marked `custom` (useModels).
export const BODIES = {};

// Each body's look, by name.
export const BODY_LOOKS = {};

// Tables of shapes, each kept up to date with BODIES, and what else follows it.
const tables = [];
const followers = [];

// The shapes of the bodies on any of the skeletons, by name, each with its skeleton as `family`.
// The table follows the bodies in use.
export function shapesOn(...skeletons) {
  const table = {};
  tables.push([table, skeletons]);
  fill(table, skeletons);
  return table;
}

function fill(table, skeletons) {
  for (const name of Object.keys(table)) delete table[name];
  for (const [name, body] of Object.entries(BODIES)) if (skeletons.includes(body.skeleton)) table[name] = { family: body.skeleton, ...body.shape };
}

// The names of the bodies in use on a skeleton.
export const bodiesOn = (skeleton) => Object.keys(BODIES).filter((name) => BODIES[name].skeleton === skeleton);

// Calls `follow` now, and each time the bodies in use change.
export function followBodies(follow) {
  followers.push(follow);
  follow();
}

// Puts a world's models in use (.agents/formats.md): `bodies`, its own bodies by name,
// and `colorations`, patterns and colorations it adds to shipped bodies, by the body's name. With
// none, only the shipped bodies are in use.
export function useModels({ bodies = {}, colorations = {} } = {}) {
  for (const name of Object.keys(BODIES)) delete BODIES[name];
  for (const [name, shipped] of Object.entries(SHIPPED_BODIES)) {
    const added = colorations[name] ?? {};
    const body = { ...shipped, patterns: { ...shipped.patterns, ...added.patterns }, colorations: [...(shipped.colorations ?? []), ...(added.colorations ?? [])] };
    BODIES[name] = body;
    BODIES[`core:${name}`] = body;
  }
  for (const [name, body] of Object.entries(bodies)) BODIES[name] = { ...body, custom: true };
  for (const name of Object.keys(BODY_LOOKS)) delete BODY_LOOKS[name];
  for (const [name, body] of Object.entries(BODIES)) BODY_LOOKS[name] = body.look ?? {};
  for (const [table, skeletons] of tables) fill(table, skeletons);
  for (const follow of followers) follow();
}

useModels();
