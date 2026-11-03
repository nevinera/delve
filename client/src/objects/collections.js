import { BUILTIN_COLLECTIONS } from "../world/builtinCollections.js";
import { BUILTIN_OBJECT_COLLECTIONS } from "../world/builtinObjects.js";
import { BUILTIN_TEMPLATE_COLLECTIONS } from "../world/builtinTemplates.js";
import { OLD_IMAGES, imagePath, newObjectId, objectPath } from "../world/builtObjects.js";
import { BUILT_PREFIX } from "../world/objects.js";
import { COLLECTIONS_PATH, TEMPLATE_COLLECTIONS_PATH } from "./libraryStore.js";
import { IMAGE_PATH, OBJECT_PATH, OLD_STRUCTURES, TEMPLATE_PATH, templatePath } from "../world/paths.js";
import { TEMPLATE_PREFIX } from "../world/templates.js";

// A world's libraries, of objects and templates, each its own collections (collections.json and
// template-collections.json, [{ id, name, source }], one with a source imported and read-only)
// holding its things (objects/<id>.json and templates/<id>.json, each naming its collection). The
// images they wear (textures/<id>.json) are the whole world's. The game's builtin collections are
// listed first. `world` is an editor World; `kind` is "objects" or "templates".

export const KINDS = {
  objects: { path: COLLECTIONS_PATH, home: "my objects", prefix: BUILT_PREFIX, things: (world) => builtObjects(world), thingPath: objectPath },
  templates: { path: TEMPLATE_COLLECTIONS_PATH, home: "my templates", prefix: TEMPLATE_PREFIX, things: (world) => builtTemplates(world), thingPath: templatePath },
};

// The world's built objects, by name.
export function builtObjects(world) {
  return [...world.files.keys()]
    .filter((path) => OBJECT_PATH.test(path))
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The world's templates, by name.
export function builtTemplates(world) {
  return [...world.files.keys()]
    .filter((path) => TEMPLATE_PATH.test(path))
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The world's images.
export function images(world) {
  return [...world.files.keys()]
    .filter((path) => IMAGE_PATH.test(path))
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The ids of the images objects and templates wear.
export function wornImages(objects = [], templates = []) {
  return new Set(
    [
      ...objects.flatMap((o) => o.pieces.flatMap((p) => [...(p.decals ?? []).map((d) => d.image), p.tile?.image])),
      ...templates.flatMap((t) => t.slabs.map((s) => s.surface?.tile?.image)),
    ].filter(Boolean),
  );
}

export function collections(world, kind = "objects") {
  const { path } = KINDS[kind];
  return world.files.has(path) ? world.readJson(path) : [];
}

export const ownCollections = (world, kind = "objects") => collections(world, kind).filter((c) => !c.source);

// Adds a collection, returning it.
export function addCollection(world, name, source, kind = "objects") {
  const collection = { id: newObjectId(), name, ...(source ? { source } : {}) };
  world.writeJson(KINDS[kind].path, [...collections(world, kind), collection]);
  return collection;
}

// Keeps a template in the world's library: in the world's own collection it names, or else in
// "my templates", made when needed. Returns it as kept.
export function keepTemplate(world, template) {
  const { home, thingPath } = KINDS.templates;
  const own = ownCollections(world, "templates");
  const collection = own.find((c) => c.id === template.collection) ?? own.find((c) => c.name === home) ?? addCollection(world, home, undefined, "templates");
  const kept = { ...template, collection: collection.id };
  world.writeJson(thingPath(kept.id), kept);
  return kept;
}

// Puts things in no collection of their kind into one, "my objects" or "my templates", made when
// needed. Moves images kept with a collection (OLD_IMAGES) to the world's, and drops structures
// (OLD_STRUCTURES). Returns whether anything changed.
export function adoptStrays(world) {
  let moved = false;
  for (const path of [...world.files.keys()].filter((p) => OLD_IMAGES.test(p))) {
    const { collection, ...image } = world.readJson(path);
    world.writeJson(imagePath(image.id), image);
    world.files.delete(path);
    moved = true;
  }
  for (const path of [...world.files.keys()].filter((p) => OLD_STRUCTURES.test(p))) {
    world.files.delete(path);
    moved = true;
  }
  for (const kind of Object.keys(KINDS)) {
    const { home, things, thingPath } = KINDS[kind];
    const known = new Set(collections(world, kind).map((c) => c.id));
    const homes = new Map(); // a collection they were in -> the one they move to
    for (const thing of things(world).filter((t) => !known.has(t.collection))) {
      if (!homes.has(thing.collection)) homes.set(thing.collection, ownCollections(world, kind).find((c) => c.name === home) ?? addCollection(world, home, undefined, kind));
      world.writeJson(thingPath(thing.id), { ...thing, collection: homes.get(thing.collection).id });
      moved = true;
    }
  }
  return moved;
}

// Every collection of a kind with what's in it, builtins first: [{ id, name, kind: "builtin" |
// "imported" | "own", source, entries }], each entry { key, type, name, tags, object, template }.
// key changes when the thing does; object is the built object and template the template, absent
// for builtin kinds of object.
export function allCollections(world, kind = "objects") {
  const builtins =
    kind === "objects"
      ? [
          ...BUILTIN_COLLECTIONS.map(({ id, name, types }) => ({ id: `builtin:${id}`, name, kind: "builtin", entries: types.map((type) => ({ key: `builtin:${type}`, type, name: type, tags: [] })) })),
          ...BUILTIN_OBJECT_COLLECTIONS.map(({ id, name, objects }) => ({
            id: `builtin:${id}`,
            name,
            kind: "builtin",
            entries: objects.map((o) => ({ key: `builtin:${o.id}`, type: `${BUILT_PREFIX}${o.id}`, name: o.name, tags: o.tags ?? [], object: o })),
          })),
        ]
      : BUILTIN_TEMPLATE_COLLECTIONS.map(({ id, name, templates }) => ({
            id: `builtin:${id}`,
            name,
            kind: "builtin",
            entries: templates.map((t) => ({ key: `builtin:${t.id}`, type: `${TEMPLATE_PREFIX}${t.id}`, name: t.name, tags: t.tags ?? [], template: t })),
          }));
  const { prefix, things } = KINDS[kind];
  const all = things(world);
  const field = { objects: "object", templates: "template" }[kind];
  const ours = collections(world, kind).map((c) => ({
    ...c,
    kind: c.source ? "imported" : "own",
    entries: all
      .filter((t) => t.collection === c.id)
      .map((t) => ({ key: `${t.id}:${hashText(JSON.stringify(t))}`, type: `${prefix}${t.id}`, name: t.name, tags: t.tags ?? [], [field]: t })),
  }));
  return [...builtins, ...ours];
}

// A short hash of text, to tell versions of an object apart.
function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
