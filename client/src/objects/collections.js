import { BUILTIN_COLLECTIONS } from "../world/builtinCollections.js";
import { newObjectId, objectPath } from "../world/builtObjects.js";
import { BUILT_PREFIX } from "../world/objects.js";
import { COLLECTIONS_PATH } from "../editor/libraryStore.js";

// A world's object library: its collections (collections.json, [{ id, name, source }], one with a
// source imported and read-only), the built objects in them and the images their pieces wear
// (objects/<id>.json and images/<id>.json, each naming its collection), with the game's builtin
// collections listed first. `world` is an editor World.

export const MY_OBJECTS = "my objects";

// The world's built objects, by name.
export function builtObjects(world) {
  return [...world.files.keys()]
    .filter((path) => /^objects\/[0-9a-z]{8}\.json$/.test(path))
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The world's images, or a collection's.
export function images(world, collection) {
  return [...world.files.keys()]
    .filter((path) => /^images\/[0-9a-z]{8}\.json$/.test(path))
    .map((path) => world.readJson(path))
    .filter((image) => !collection || image.collection === collection)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function collections(world) {
  return world.files.has(COLLECTIONS_PATH) ? world.readJson(COLLECTIONS_PATH) : [];
}

export const ownCollections = (world) => collections(world).filter((c) => !c.source);

// Adds a collection, returning it.
export function addCollection(world, name, source) {
  const collection = { id: newObjectId(), name, ...(source ? { source } : {}) };
  world.writeJson(COLLECTIONS_PATH, [...collections(world), collection]);
  return collection;
}

// Puts built objects in no known collection into "my objects", made when needed. Returns whether
// any moved.
export function adoptStrays(world) {
  const known = new Set(collections(world).map((c) => c.id));
  const strays = builtObjects(world).filter((o) => !known.has(o.collection));
  if (!strays.length) return false;
  const home = ownCollections(world).find((c) => c.name === MY_OBJECTS) ?? addCollection(world, MY_OBJECTS);
  for (const object of strays) world.writeJson(objectPath(object.id), { ...object, collection: home.id });
  return true;
}

// Every collection with what's in it, builtins first: [{ id, name, kind: "builtin" | "imported" |
// "own", source, entries }], each entry { key, type, name, tags, object }. key changes when the
// object does; object is the built object, absent for builtins.
export function allCollections(world) {
  const builtins = BUILTIN_COLLECTIONS.map(({ id, name, types }) => ({ id: `builtin:${id}`, name, kind: "builtin", entries: types.map((type) => ({ key: `builtin:${type}`, type, name: type, tags: [] })) }));
  const objects = builtObjects(world);
  const ours = collections(world).map((c) => ({
    ...c,
    kind: c.source ? "imported" : "own",
    entries: objects
      .filter((o) => o.collection === c.id)
      .map((o) => ({ key: `${o.id}:${hashText(JSON.stringify(o))}`, type: `${BUILT_PREFIX}${o.id}`, name: o.name, tags: o.tags ?? [], object: o })),
  }));
  return [...builtins, ...ours];
}

// A short hash of text, to tell versions of an object apart.
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
