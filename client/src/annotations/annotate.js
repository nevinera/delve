// Finds and edits annotations (docs/schema/common.md#annotations) in content
// files, for bin/annotate: the way an LLM writes its notes on a world, zone,
// map, place, unit type, unit, quest or NCU. Pure: the caller reads and
// writes the files, through `read(path)` (parsed JSON) and paths relative
// to the file being read.
import {dirname, join, normalize} from "./paths";

export const MAX_ANNOTATIONS = 32;
export const MAX_TEXT = 4000;
const KEY_RE = /^[a-z][a-z0-9_-]{0,39}$/;

// What a target names, from a zone file:
//   zone                 the zone
//   unit-type:<key>      one of its unit types
//   <map>                a map, by identifier
//   <map>/<place>        a place on it
//   <map>/unit:<id>      a unit on it
//   <map>/ncu:<id>       an NCU on it
// and from a world file:
//   world                the world
//   quest:<id>           a quest in its quests file
//   zone:<key>/<target>  any zone target, in one of its zones (zone:<key>
//                        alone is the zone)
export const TARGETS = ["zone", "unit-type:<key>", "<map>", "<map>/<place>", "<map>/unit:<id>", "<map>/ncu:<id>", "world", "quest:<id>", "zone:<key>/<target>"];

// Finds `target` from the file at `path`. Returns {file, data, object,
// label}: the file holding the thing (following $refs), its parsed contents,
// the thing itself (an object inside data, or data), and a name for it.
// Throws an Error saying what's missing.
export function findTarget(read, path, target) {
  const root = read(path);
  if (isWorld(root)) return findInWorld(read, path, root, target);
  if (isZone(root)) return findInZone(read, path, root, target);
  throw new Error(`${path} is neither a world (zones, entryPoints) nor a zone (maps)`);
}

// The thing's annotations: a copy, {} for none.
export function annotationsOf(object) {
  return {...(object.annotations ?? {})};
}

// Sets annotation `key` to `text` on `object` (in place). Throws on a key or
// text the validators would refuse.
export function setAnnotation(object, key, text) {
  if (!KEY_RE.test(key)) throw new Error(`${JSON.stringify(key)}: keys are lowercase words (a letter, then letters, digits, - and _), at most 40 characters`);
  if (typeof text !== "string" || !text.trim()) throw new Error("the text must not be empty (use --remove to remove an annotation)");
  if (text.length > MAX_TEXT) throw new Error(`the text is ${text.length} characters, more than the maximum of ${MAX_TEXT}`);
  const annotations = annotationsOf(object);
  if (!(key in annotations) && Object.keys(annotations).length >= MAX_ANNOTATIONS) throw new Error(`already has ${MAX_ANNOTATIONS} annotations, the maximum`);
  annotations[key] = text;
  object.annotations = annotations;
}

// Names a place (in place), as the map validator allows: at most 80
// characters, and no other place in `places` (its map's) named the same.
const MAX_NAME = 80;
export function setPlaceName(places, place, name) {
  if (typeof name !== "string" || !name.trim()) throw new Error("the name must not be empty");
  if (name.length > MAX_NAME) throw new Error(`the name is ${name.length} characters, more than the maximum of ${MAX_NAME}`);
  const other = places.find((p) => p !== place && p.name === name);
  if (other) throw new Error(`place ${other.identifier} is already named ${JSON.stringify(name)}`);
  place.name = name;
}

// Removes annotation `key` from `object` (in place), and the annotations
// field with its last one. Returns whether there was one.
export function removeAnnotation(object, key) {
  if (!object.annotations || !(key in object.annotations)) return false;
  const {[key]: _removed, ...rest} = object.annotations;
  if (Object.keys(rest).length) object.annotations = rest;
  else delete object.annotations;
  return true;
}

// JSON text the way the content files are written (2-space indents), with
// a trailing newline when the original had one.
export function formatLike(original, data) {
  return JSON.stringify(data, null, 2) + (original.endsWith("\n") ? "\n" : "");
}

// ---- Worlds ----

function isWorld(data) {
  return isObject(data) && isObject(data.zones) && isObject(data.entryPoints);
}

function findInWorld(read, path, world, target) {
  if (target === "world") return {file: path, data: world, object: world, label: "the world"};
  const quest = target.match(/^quest:(.+)$/);
  if (quest) return findQuest(read, path, world, quest[1]);
  const zone = target.match(/^zone:([^/]+)(?:\/(.+))?$/);
  if (zone) {
    const entry = world.zones[zone[1]];
    if (!entry?.path) throw new Error(`the world has no zone ${JSON.stringify(zone[1])} (zones: ${Object.keys(world.zones).join(", ")})`);
    const zonePath = relative(path, entry.path);
    return findInZone(read, zonePath, read(zonePath), zone[2] ?? "zone");
  }
  throw new Error(`${JSON.stringify(target)} isn't a world target: world, quest:<id> or zone:<key>[/<target>]`);
}

// The quests file is at questsPath, ./quests.json by default.
function findQuest(read, path, world, identifier) {
  const file = relative(path, world.questsPath || "./quests.json");
  const quests = read(file);
  if (!Array.isArray(quests)) throw new Error(`${file} isn't a quests file (an array of quests)`);
  const quest = quests.find((q) => q?.identifier === identifier);
  if (!quest) throw new Error(`${file} has no quest ${JSON.stringify(identifier)}`);
  return {file, data: quests, object: quest, label: `quest ${identifier}`};
}

// ---- Zones ----

function isZone(data) {
  return isObject(data) && Array.isArray(data.maps);
}

function findInZone(read, path, zone, target) {
  if (target === "zone") return {file: path, data: zone, object: zone, label: "the zone"};
  const unitType = target.match(/^unit-type:(.+)$/);
  if (unitType) {
    const key = unitType[1];
    if (!isObject(zone.unitTypes?.[key])) throw new Error(`the zone has no unit type ${JSON.stringify(key)} (unit types: ${Object.keys(zone.unitTypes ?? {}).join(", ") || "none"})`);
    return {...follow(read, path, zone, zone.unitTypes[key]), label: `unit type ${key}`};
  }
  const [mapId, rest, ...extra] = target.split("/");
  if (extra.length) throw new Error(`${JSON.stringify(target)} isn't a zone target: ${TARGETS.slice(0, 6).join(", ")}`);
  const map = findMap(read, path, zone, mapId);
  if (rest === undefined) return {...map, label: `map ${mapId}`};
  const entry = rest.match(/^(unit|ncu):(.+)$/);
  if (entry) {
    const [, kind, id] = entry;
    const list = map.object[kind === "unit" ? "units" : "ncus"] ?? [];
    const found = list.find((e) => e?.identifier === id);
    if (!found) throw new Error(`map ${mapId} has no ${kind} ${JSON.stringify(id)}`);
    return {file: map.file, data: map.data, object: found, label: `${kind} ${id} on map ${mapId}`};
  }
  const place = (map.object.places ?? []).find((p) => p?.identifier === rest);
  if (!place) throw new Error(`map ${mapId} has no place ${JSON.stringify(rest)} (places: ${(map.object.places ?? []).map((p) => p.identifier).join(", ") || "none"})`);
  return {file: map.file, data: map.data, object: place, label: `place ${rest} on map ${mapId}`, places: map.object.places};
}

function findMap(read, path, zone, mapId) {
  for (const entry of zone.maps) {
    const found = follow(read, path, zone, entry);
    if (found.object?.identifier === mapId) return found;
  }
  const ids = zone.maps.map((entry) => follow(read, path, zone, entry).object?.identifier).filter(Boolean);
  throw new Error(`the zone has no map ${JSON.stringify(mapId)} (maps: ${ids.join(", ") || "none"})`);
}

// The object `value` stands for: itself, or the file its $ref names.
function follow(read, path, data, value) {
  if (!value?.$ref) return {file: path, data, object: value};
  const file = relative(path, value.$ref);
  const referenced = read(file);
  return {file, data: referenced, object: referenced};
}

const relative = (from, to) => normalize(join(dirname(from), to));
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
