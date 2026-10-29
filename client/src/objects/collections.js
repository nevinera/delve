import { BUILTIN_COLLECTIONS } from "../world/builtinCollections.js";
import { BUILTIN_OBJECT_COLLECTIONS } from "../world/builtinObjects.js";
import { BUILTIN_STRUCTURE_COLLECTIONS } from "../world/builtinStructures.js";
import { OLD_IMAGES, imagePath, newObjectId, objectPath } from "../world/builtObjects.js";
import { BUILT_PREFIX } from "../world/objects.js";
import { STRUCTURE_PREFIX, structurePath } from "../world/structures.js";
import { COLLECTIONS_PATH, STRUCTURE_COLLECTIONS_PATH, TEMPLATE_COLLECTIONS_PATH } from "../editor/libraryStore.js";
import { IMAGE_PATH, OBJECT_PATH, STRUCTURE_PATH, TEMPLATE_PATH, templatePath } from "../world/paths.js";
import { TEMPLATE_PREFIX } from "../world/templates.js";

// A world's libraries, of objects, structures and templates, each its own collections
// (collections.json, structure-collections.json and template-collections.json, [{ id, name,
// source }], one with a source imported and read-only) holding its things (objects/<id>.json,
// structures/<id>.json and templates/<id>.json, each naming its collection). The images they wear
// (textures/<id>.json) are the whole world's. The game's builtin collections, all objects, are
// listed first. `world` is an editor World; `kind` is "objects", "structures" or "templates".

export const KINDS = {
  objects: { path: COLLECTIONS_PATH, home: "my objects", prefix: BUILT_PREFIX, things: (world) => builtObjects(world), thingPath: objectPath },
  structures: { path: STRUCTURE_COLLECTIONS_PATH, home: "my structures", prefix: STRUCTURE_PREFIX, things: (world) => builtStructures(world), thingPath: structurePath },
  templates: { path: TEMPLATE_COLLECTIONS_PATH, home: "my templates", prefix: TEMPLATE_PREFIX, things: (world) => builtTemplates(world), thingPath: templatePath },
};

// The world's built objects, by name.
export function builtObjects(world) {
  return [...world.files.keys()]
    .filter((path) => OBJECT_PATH.test(path))
    .map((path) => world.readJson(path))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The world's structures, by name.
export function builtStructures(world) {
  return [...world.files.keys()]
    .filter((path) => STRUCTURE_PATH.test(path))
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

// The ids of the images objects and structures wear.
export function wornImages(objects = [], structures = []) {
  return new Set(
    [
      ...objects.flatMap((o) => o.pieces.flatMap((p) => [...(p.decals ?? []).map((d) => d.image), p.tile?.image])),
      ...structures.flatMap((s) => Object.values(s.materials).flatMap((m) => [m.tile?.image, m.inside?.image])),
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

// Puts things in no collection of their kind into one: structures kept with objects, as they once
// were, into a structure collection of the same name, and the rest into "my objects" or "my
// structures", each made when needed. Moves images kept with a collection (OLD_IMAGES) to the
// world's. Returns whether anything moved.
export function adoptStrays(world) {
  let moved = false;
  for (const path of [...world.files.keys()].filter((p) => OLD_IMAGES.test(p))) {
    const { collection, ...image } = world.readJson(path);
    world.writeJson(imagePath(image.id), image);
    world.files.delete(path);
    moved = true;
  }
  const objectCollections = new Map(collections(world).map((c) => [c.id, c]));
  for (const kind of Object.keys(KINDS)) {
    const { home, things, thingPath } = KINDS[kind];
    const known = new Set(collections(world, kind).map((c) => c.id));
    const homes = new Map(); // a collection they were in -> the one they move to
    for (const thing of things(world).filter((t) => !known.has(t.collection))) {
      if (!homes.has(thing.collection)) {
        const was = kind === "structures" && objectCollections.get(thing.collection);
        const name = was ? was.name : home;
        const own = was?.source ? undefined : collections(world, kind).find((c) => c.name === name && !c.source);
        homes.set(thing.collection, own ?? addCollection(world, name, was?.source, kind));
      }
      world.writeJson(thingPath(thing.id), { ...thing, collection: homes.get(thing.collection).id });
      moved = true;
    }
  }
  return moved;
}

// Every collection of a kind with what's in it, builtins first: [{ id, name, kind: "builtin" |
// "imported" | "own", source, entries }], each entry { key, type, name, tags, object, structure,
// template }. key changes when the thing does; object is the built object, structure the
// structure and template the template, absent for builtin kinds of object.
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
      : kind === "structures"
        ? BUILTIN_STRUCTURE_COLLECTIONS.map(({ id, name, structures }) => ({
            id: `builtin:${id}`,
            name,
            kind: "builtin",
            entries: structures.map((s) => ({ key: `builtin:${s.id}`, type: `${STRUCTURE_PREFIX}${s.id}`, name: s.name, tags: s.tags ?? [], structure: s })),
          }))
        : [];
  const { prefix, things } = KINDS[kind];
  const all = things(world);
  const field = { objects: "object", structures: "structure", templates: "template" }[kind];
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
