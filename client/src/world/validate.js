import { strFromU8 } from "fflate";
import { imageProblems, problems as objectProblems } from "./builtObjects.js";
import { BUILTIN_IMAGES } from "./builtinImages.js";
import { BUILTIN_OBJECTS } from "./builtinObjects.js";
import { BUILTIN_STRUCTURES } from "./builtinStructures.js";
import { MAX_LEVEL, checkGameData } from "./gameData.js";
import { BLOCK } from "./landGrid.js";
import { PLATE_TILES, decodePlateTile, plateHash, plateOf, splitPlate } from "./plateCodec.js";
import {
  COLLECTIONS_PATH,
  IMAGE_PATH,
  OBJECT_PATH,
  STRUCTURE_COLLECTIONS_PATH,
  STRUCTURE_PATH,
  TEMPLATE_COLLECTIONS_PATH,
  TEMPLATE_PATH,
  WORLD_PATH,
  continentOf,
  editedPath,
  gameDataAt,
  indexPath,
  landBlockAt,
  plateAt,
  platesIndexPath,
  SHAPES_PATH,
  sketchPath,
  spawnsPath,
  tileAt,
  zoneAt,
} from "./paths.js";
import { BUILT_PREFIX, OBJECT_TYPES } from "./objects.js";
import { slabProblems, slabTile } from "./slabs.js";
import { STRUCTURE_PREFIX, problems as structureProblems } from "./structures.js";
import { templateProblems } from "./templates.js";

// Checks a stored world (docs/formats/world-files.md): its files as a Map of path -> bytes. Returns
// what's wrong as [{ path, message, warning }], empty when nothing is. A warning doesn't stop a
// world being played; the rest do. Files it doesn't know are left alone.

const KEY = /^[\w-]+$/;
const TILE_KEY = /^-?\d+,-?\d+$/;
const ZONE_VERSION = 3;
const INDEX_VERSION = 2;
const PLATES_INDEX_VERSION = 1;
const SPAWN_WATER_FT = 3; // deeper water than this at the spawn point is a problem
const MAX_SIGHT_FACES = 1000; // more than this on a kind's line of sight mesh is a warning

export function validateWorld(files) {
  const out = [];
  const problem = (path, message) => out.push({ path, message, warning: false });
  const warning = (path, message) => out.push({ path, message, warning: true });
  const json = (path) => {
    const bytes = files.get(path);
    if (!bytes) return undefined;
    try {
      return JSON.parse(strFromU8(bytes));
    } catch (err) {
      problem(path, `isn't JSON: ${err.message}`);
      return null;
    }
  };

  const world = json(WORLD_PATH);
  const continents = checkWorld(world, problem);
  const library = checkLibrary(files, json, problem, warning);
  checkData(files, continents, Number.isInteger(world?.levelCap) ? world.levelCap : MAX_LEVEL, json, problem, warning);
  for (const path of files.keys()) {
    const continent = continentOf(path);
    if (continent && continents && !continents.has(continent)) {
      problem(path, `is in continent ${continent}, which world.json doesn't list`);
      continents.add(continent); // once is enough
    }
    if (tileAt(path)) problem(path, "is a tile file: a stored world keeps its tiles in plates");
  }
  checkShapes(files, json, problem, warning);
  const spawn = findSpawn(continents, json, problem);
  for (const continent of continents ?? []) checkContinent(files, continent, library, spawn?.continent === continent ? spawn : null, json, problem, warning);
  return out;
}

// shapes.json (docs/formats/shapes.md), which the editor writes with the plates.
function checkShapes(files, json, problem, warning) {
  const shapes = json(SHAPES_PATH);
  if (shapes === undefined) {
    if ([...files.keys()].some((path) => plateAt(path))) warning(SHAPES_PATH, "is missing, so nothing blocks line of sight: saving the world in the editor writes it");
    return;
  }
  if (shapes === null) return;
  if (!isObject(shapes) || shapes.version !== 1 || !isObject(shapes.kinds)) return problem(SHAPES_PATH, "should be version 1, with kinds");
  for (const [kind, mesh] of Object.entries(shapes.kinds)) {
    const ok =
      isObject(mesh) &&
      Array.isArray(mesh.points) &&
      mesh.points.length >= 4 &&
      mesh.points.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) &&
      Array.isArray(mesh.faces) &&
      mesh.faces.length >= 4 &&
      mesh.faces.every((f) => Array.isArray(f) && f.length >= 3 && f.every((v) => Number.isInteger(v) && v >= 0 && v < mesh.points.length));
    if (!ok) problem(SHAPES_PATH, `${kind} needs points and faces`);
    else if (mesh.faces.length > MAX_SIGHT_FACES) warning(SHAPES_PATH, `${kind} has ${mesh.faces.length} faces, more than ${MAX_SIGHT_FACES}, which makes line of sight slower near it: fewer holes cut through it would help`);
  }
}

// world.json. Returns its continents' keys, or null when there's no telling.
function checkWorld(world, problem) {
  if (world === undefined) return problem(WORLD_PATH, "is missing"), null;
  if (!isObject(world)) return world !== null && problem(WORLD_PATH, "should be an object"), null;
  if (world.version !== 1) problem(WORLD_PATH, `has version ${JSON.stringify(world.version)}, not 1`);
  if (typeof world.name !== "string" || !world.name) problem(WORLD_PATH, "needs a name");
  if (world.levelCap !== undefined && !(Number.isInteger(world.levelCap) && world.levelCap >= 1 && world.levelCap <= MAX_LEVEL)) problem(WORLD_PATH, `needs a whole levelCap from 1 to ${MAX_LEVEL}`);
  if (!Array.isArray(world.continents)) return problem(WORLD_PATH, "needs a list of continents"), null;
  const keys = new Set();
  for (const c of world.continents) {
    if (!(isObject(c) && KEY.test(c.key ?? "") && typeof c.name === "string")) problem(WORLD_PATH, `has a continent without a key and a name: ${JSON.stringify(c)}`);
    else if (keys.has(c.key)) problem(WORLD_PATH, `lists continent ${c.key} twice`);
    else keys.add(c.key);
  }
  return keys;
}

// The world's objects, structures, templates, images and collections. Returns the ids of its
// objects, structures and images, for plates' object tables and slabs.
function checkLibrary(files, json, problem, warning) {
  const collectionIds = {};
  const collectionPaths = { objects: COLLECTIONS_PATH, structures: STRUCTURE_COLLECTIONS_PATH, templates: TEMPLATE_COLLECTIONS_PATH };
  for (const [kind, path] of Object.entries(collectionPaths)) {
    const list = json(path);
    collectionIds[kind] = new Set();
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) {
      problem(path, "should be a list of collections");
      continue;
    }
    for (const c of list) {
      if (!(isObject(c) && /^[0-9a-z]{8}$/.test(c.id ?? "") && typeof c.name === "string")) problem(path, `has a collection without an id and a name: ${JSON.stringify(c)}`);
      else collectionIds[kind].add(c.id);
    }
  }

  const objects = new Set(BUILTIN_OBJECTS.map((o) => o.id));
  const structures = new Set(BUILTIN_STRUCTURES.map((s) => s.id));
  const images = new Set(BUILTIN_IMAGES.map((i) => i.id));
  const worn = []; // [path, image id]
  const templates = []; // [path, template], checked once the images and objects are all known
  for (const path of files.keys()) {
    const [pattern, kind, check] = OBJECT_PATH.test(path)
      ? [OBJECT_PATH, "objects", objectProblems]
      : STRUCTURE_PATH.test(path)
        ? [STRUCTURE_PATH, "structures", structureProblems]
        : TEMPLATE_PATH.test(path)
          ? [TEMPLATE_PATH, "templates", () => []]
          : IMAGE_PATH.test(path)
            ? [IMAGE_PATH, "images", imageProblems]
            : [];
    if (!pattern) continue;
    const thing = json(path);
    if (!isObject(thing)) {
      if (thing !== null) problem(path, "should be an object");
      continue;
    }
    const id = path.split("/")[1].replace(".json", "");
    if (thing.id !== id) problem(path, `has id ${JSON.stringify(thing.id)}, not ${id} as its name says`);
    for (const message of check(thing)) problem(path, message);
    if (kind === "objects") objects.add(id);
    if (kind === "structures") structures.add(id);
    if (kind === "images") images.add(id);
    if (kind === "templates") templates.push([path, thing]);
    if (kind !== "images" && thing.collection !== undefined && !collectionIds[kind].has(thing.collection)) warning(path, `is in collection ${thing.collection}, which ${collectionPaths[kind]} doesn't list`);
    if (kind === "objects") for (const p of thing.pieces ?? []) for (const image of [...(p.decals ?? []).map((d) => d.image), p.tile?.image]) if (image) worn.push([path, image]);
    if (kind === "structures") for (const m of Object.values(thing.materials ?? {})) for (const image of [m?.tile?.image, m?.inside?.image]) if (image) worn.push([path, image]);
  }
  for (const [path, image] of worn) if (!images.has(image)) problem(path, `wears image ${image}, which the world doesn't have`);
  for (const [path, template] of templates) {
    for (const message of templateProblems(template, images)) problem(path, message);
    for (const object of Array.isArray(template.objects) ? template.objects : []) {
      if (typeof object?.type === "string" && !knownKind(object.type, { objects, structures })) problem(path, `places ${object.type}, which isn't a kind of object the world has`);
    }
  }
  return { objects, structures, images };
}

// The world's game data (gameData.js): its classes, abilities and the rest, and each continent's
// spawns.
function checkData(files, continents, levelCap, json, problem, warning) {
  const data = { spawns: new Map() };
  for (const path of files.keys()) {
    const at = gameDataAt(path);
    if (!at) continue;
    const thing = json(path);
    if (!isObject(thing)) {
      if (thing !== null) problem(path, "should be an object");
      continue;
    }
    if (thing.id !== at.id) problem(path, `has id ${JSON.stringify(thing.id)}, not ${at.id} as its name says`);
    (data[at.kind] ??= new Map()).set(at.id, thing);
  }
  for (const continent of continents ?? []) {
    const spawns = json(spawnsPath(continent));
    if (spawns !== undefined && spawns !== null) data.spawns.set(spawnsPath(continent), spawns);
  }
  checkGameData(data, levelCap, problem, warning);
}

// The world's spawn point, where players enter: the one spawn pin in its continents' sketches, as
// { continent, at, path }. A world needs exactly one.
function findSpawn(continents, json, problem) {
  if (!continents) return null;
  const spawns = [];
  for (const continent of continents) {
    const sketch = json(sketchPath(continent));
    for (const pin of Array.isArray(sketch?.pins) ? sketch.pins : []) if (pin?.kind === "spawn") spawns.push({ continent, at: pin.at, path: sketchPath(continent) });
  }
  if (!spawns.length) return problem(WORLD_PATH, "has no spawn point: place one on the editor's civilization step"), null;
  if (spawns.length > 1) return problem(spawns[1].path, `has a spawn point, but the world has ${spawns.length}: keep one`), null;
  const [spawn] = spawns;
  if (!(Array.isArray(spawn.at) && spawn.at.length === 2 && spawn.at.every(Number.isFinite))) return problem(spawn.path, "has a spawn point without a place"), null;
  return spawn;
}

function checkContinent(files, continent, library, spawn, json, problem, warning) {
  const sketch = json(sketchPath(continent));
  if (sketch !== undefined && sketch !== null && !(isObject(sketch) && Array.isArray(sketch.pins))) problem(sketchPath(continent), "should have a list of pins");

  const edited = json(editedPath(continent));
  if (edited && !(Array.isArray(edited.tiles) && edited.tiles.every((t) => TILE_KEY.test(t)))) problem(editedPath(continent), 'should list tiles as "tx,tz"');

  const zones = new Set();
  for (const path of files.keys()) {
    const zone = zoneAt(path);
    if (!zone || zone.continent !== continent) continue;
    zones.add(zone.key);
    const data = json(path);
    if (!isObject(data)) continue;
    if (data.version !== ZONE_VERSION) warning(path, `is zone version ${data.version}; the editor brings it up to ${ZONE_VERSION}`);
    if (typeof data.name !== "string") problem(path, "needs a name");
    if (data.version === ZONE_VERSION && !isRegion(data.region)) problem(path, "needs a region: polygons of rings of [x, z] points");
    const levels = data.levels;
    if (levels !== undefined && !(Array.isArray(levels) && levels.length === 2 && levels.every((l) => Number.isInteger(l) && l >= 1) && levels[0] <= levels[1])) problem(path, "needs levels as [min, max]");
  }

  for (const [path, bytes] of files) {
    const block = landBlockAt(path);
    if (block?.continent === continent && bytes.length !== BLOCK * BLOCK * 4) problem(path, `is ${bytes.length} bytes, not ${BLOCK * BLOCK * 4}`);
  }

  const tiles = checkPlates(files, continent, library, spawn, json, problem, warning);
  if (spawn && !tiles.get(spawn.at.map(Math.floor).join(","))?.has("surface")) problem(spawn.path, `has the spawn point on tile ${spawn.at.map(Math.floor)}, which hasn't been generated`);

  const index = json(indexPath(continent));
  if (index === undefined) {
    if (tiles.size) problem(indexPath(continent), "is missing");
    return;
  }
  if (!isObject(index) || !isObject(index.tiles)) return index !== null && problem(indexPath(continent), "should have tiles");
  if (index.version !== INDEX_VERSION) problem(indexPath(continent), `has version ${index.version}, not ${INDEX_VERSION}`);
  for (const [key, layers] of tiles) {
    const listed = index.tiles[key]?.layers ?? [];
    for (const layer of layers) if (!listed.includes(layer)) problem(indexPath(continent), `doesn't list tile ${key}'s ${layer} layer`);
  }
  for (const [key, entry] of Object.entries(index.tiles)) {
    for (const layer of entry?.layers ?? []) if (!tiles.get(key)?.has(layer)) problem(indexPath(continent), `lists tile ${key}'s ${layer} layer, which no plate has`);
    for (const zone of entry?.zones ?? []) if (!zones.has(zone)) warning(indexPath(continent), `says zone ${zone} touches tile ${key}, but there's no such zone`);
  }
}

// The continent's plates, and its plates.json. Returns the tiles they hold, as "tx,tz" -> layers.
function checkPlates(files, continent, library, spawn, json, problem, warning) {
  const tiles = new Map();
  const plates = [...files.keys()].filter((path) => plateAt(path)?.continent === continent).sort();
  const indexFile = platesIndexPath(continent);
  const index = json(indexFile);
  const hashes = isObject(index?.plates) ? index.plates : null;
  if (index === undefined && plates.length) problem(indexFile, "is missing");
  else if (index && (index.version !== PLATES_INDEX_VERSION || !hashes)) problem(indexFile, `should be version ${PLATES_INDEX_VERSION}, with plates`);

  const named = new Set();
  for (const path of plates) {
    const { layer, coords } = plateAt(path);
    const key = `${layer}/${coords.join("_")}`;
    named.add(key);
    const text = strFromU8(files.get(path));
    if (hashes && hashes[key] === undefined) problem(indexFile, `doesn't list plate ${key}`);
    else if (hashes && hashes[key] !== plateHash(text)) problem(indexFile, `has the wrong hash for plate ${key}`);
    let split;
    try {
      split = splitPlate(text);
    } catch (err) {
      problem(path, err.message);
      continue;
    }
    const { header } = split;
    if (header.coords?.join() !== coords.join() || header.layer !== layer) problem(path, `says it's plate ${header.coords} of ${header.layer}, not ${coords} of ${layer}`);
    header.kinds.forEach((kind, n) => {
      if (!knownKind(kind, library)) problem(path, `places ${kind}, which isn't a kind of object the world has`);
      else if (header.version > 1 && !(header.sizes[n]?.footprint && header.sizes[n]?.height !== undefined)) warning(path, `doesn't give ${kind}'s size`);
    });
    if (split.tiles.length > PLATE_TILES * PLATE_TILES) problem(path, `has ${split.tiles.length} tiles, more than ${PLATE_TILES * PLATE_TILES}`);
    for (const { coords: tile, text: tileText } of split.tiles) {
      const tileKey = tile.join(",");
      if (plateOf(...tile).join() !== coords.join()) problem(path, `has tile ${tileKey}, which belongs in another plate`);
      if (tiles.get(tileKey)?.has(layer)) problem(path, `has tile ${tileKey} twice`);
      try {
        const decoded = decodePlateTile(header, tileText);
        (decoded.slabs ?? []).forEach((slab, n) => {
          const messages = slabProblems(slab, library.images);
          for (const message of messages) problem(path, `tile ${tileKey}'s slab ${n + 1} ${message}`);
          if (!messages.length && slabTile(slab).join() !== tileKey) problem(path, `tile ${tileKey}'s slab ${n + 1} belongs in tile ${slabTile(slab)}, which holds its home corner`);
        });
        if (spawn && layer === "surface" && tileKey === spawn.at.map(Math.floor).join(",")) checkSpawn(decoded, spawn, problem);
      } catch (err) {
        problem(path, `tile ${tileKey}: ${err.message}`);
      }
      if (!tiles.has(tileKey)) tiles.set(tileKey, new Set());
      tiles.get(tileKey).add(layer);
    }
  }
  for (const key of Object.keys(hashes ?? {})) if (!named.has(key)) problem(indexFile, `lists plate ${key}, which isn't there`);
  return tiles;
}

// Where players enter, they should be on their feet.
function checkSpawn(tile, spawn, problem) {
  const [i, j] = spawn.at.map((v) => Math.min(tile.cells - 1, Math.floor((v - Math.floor(v)) * tile.cells)));
  const k = j * tile.cells + i;
  const depth = tile.layers.water[k] - tile.layers.height[k];
  if (depth > SPAWN_WATER_FT) problem(spawn.path, `has the spawn point in water ${Math.round(depth)} ft deep`);
}

function knownKind(kind, { objects, structures }) {
  if (kind.startsWith(BUILT_PREFIX)) return objects.has(kind.slice(BUILT_PREFIX.length));
  if (kind.startsWith(STRUCTURE_PREFIX)) return structures.has(kind.slice(STRUCTURE_PREFIX.length));
  return Object.hasOwn(OBJECT_TYPES, kind);
}

const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const isRegion = (r) => Array.isArray(r) && r.every((poly) => Array.isArray(poly) && poly.every((ring) => Array.isArray(ring) && ring.every(isPoint)));
