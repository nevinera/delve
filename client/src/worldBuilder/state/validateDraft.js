// The world editor's Validate (see plans/world-editor/01-world-and-zone.md,
// 1f): checks the whole live draft, unsaved edits included, and resolves to
// a list of problems - [{file, location, message}], where location is
// where in the editor to look ({} for the world, {zone} for a zone).
//
// 1. Every $ref and asset path stays inside the world and exists.
// 2. Every zone, map, unit type and item identifier is well-formed, and
//    each map's identifier matches its directory.
// 3. Each zone, fully resolved, passes the server's zone validator.
// 4. The world passes its validator, and its links and entry points name
//    real zone connections.
// 5. The quests file (if any) passes the server's quest validators, and
//    everything its quests name exists in the world's zones.
import {validateQuests, validateWorld, validateWorldReferences, validateZone} from "../../validators/validateContent";
import {isValidIdentifier, resolvePath, worldDir, worldFile, zonesDir} from "./worldPaths";
import {isJsonPath} from "./RepoSnapshot";
import {zoneKeys} from "./worldOps";
import {mapKeysInZone, resolveZone, zoneData} from "./zoneOps";
import {mapData} from "./mapOps";
import {questsFile} from "./questOps";

const ASSET_FIELDS = new Set(["iconURL", "sourceURL", "imageUrl", "thumbnailUrl", "tokenImageUrl", "icon_url"]);

const isLocalPath = (value) => typeof value === "string" && value !== "" &&
  !(value.startsWith(":") && value.endsWith(":")) && !value.startsWith("/") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value);

export function locationFor(draft, path) {
  const prefix = `${zonesDir(draft.worldKey)}/`;
  return path.startsWith(prefix) ? {zone: path.slice(prefix.length).split("/")[0]} : {};
}

// Every relative path a file points at: $refs, asset URLs, and (in the
// world file) each zone's path.
function referencedPaths(node, key = null, found = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => referencedPaths(item, key, found));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "$ref" && typeof v === "string") found.push(v);
      else referencedPaths(v, k, found);
    }
  } else if (ASSET_FIELDS.has(key) && isLocalPath(node)) {
    found.push(node);
  }
  return found;
}

function checkReferences(draft) {
  const problems = [];
  const root = `${worldDir(draft.worldKey)}/`;
  const files = draft.paths(worldDir(draft.worldKey)).filter((p) => isJsonPath(p) && !p.endsWith(".layout.json") && !p.endsWith(".full.json"));
  for (const file of files) {
    const data = draft.read(file);
    const refs = referencedPaths(data);
    if (file === worldFile(draft.worldKey)) refs.push(...Object.values(data.zones ?? {}).map((z) => z.path).filter(Boolean));
    for (const ref of new Set(refs)) {
      const target = resolvePath(file, ref);
      if (!target || !target.startsWith(root)) problems.push({file, location: locationFor(draft, file), message: `${ref} points outside the world`});
      else if (!draft.exists(target)) problems.push({file, location: locationFor(draft, file), message: `${ref} doesn't exist`});
    }
  }
  return problems;
}

function checkIdentifiers(draft) {
  const problems = [];
  const bad = (file, location, kind, key) => problems.push({file, location, message: `${kind} identifier "${key}" may only use letters, digits, "_" and "-"`});
  const world = worldFile(draft.worldKey);
  for (const zone of zoneKeys(draft)) {
    if (!isValidIdentifier(zone)) bad(world, {}, "Zone", zone);
    for (const map of mapKeysInZone(draft, zone)) {
      const file = `${zonesDir(draft.worldKey)}/${zone}/${map}/${map}.json`;
      if (!isValidIdentifier(map)) bad(file, {zone}, "Map", map);
      const identifier = draft.read(file)?.identifier;
      if (identifier !== map) problems.push({file, location: {zone}, message: `Map ${map}'s identifier is "${identifier}"; it must match its directory`});
    }
  }
  for (const dir of ["unit_types", "items"]) {
    const prefix = `${worldDir(draft.worldKey)}/${dir}/`;
    for (const path of draft.paths(`${worldDir(draft.worldKey)}/${dir}`)) {
      const key = path.slice(prefix.length).replace(/\.json$/, "");
      if (isJsonPath(path) && !isValidIdentifier(key)) bad(path, {}, dir === "items" ? "Item" : "Unit type", key);
    }
  }
  return problems;
}

async function checkZones(draft) {
  const results = await Promise.all(zoneKeys(draft).map(async (zone) => {
    const file = `${zonesDir(draft.worldKey)}/${zone}/${zone}.json`;
    let full;
    try {
      full = resolveZone(draft, zone);
    } catch (error) {
      return {file, location: {zone}, message: error.message};
    }
    const {valid, error} = await validateZone(full);
    return valid ? null : {file, location: {zone}, message: error.message};
  }));
  return results.filter(Boolean);
}

async function checkWorld(draft) {
  const file = worldFile(draft.worldKey);
  const world = draft.read(file);
  const result = await validateWorld(world);
  if (!result.valid) return [{file, location: {}, message: result.error.message}];
  const zones = Object.fromEntries(zoneKeys(draft).map((zone) => {
    const data = draft.read(`${zonesDir(draft.worldKey)}/${zone}/${zone}.json`) ?? {};
    return [zone, {openConnections: data.openConnections ?? {}, entryPoints: data.entryPoints ?? {}}];
  }));
  const refs = await validateWorldReferences(world, zones);
  return refs.valid ? [] : [{file, location: {}, message: refs.error.message}];
}

// What the quest reference checks need of each zone: its unit type and
// item keys, and its maps' identifiers, NCUs and units.
function questZones(draft) {
  const identifiers = (list) => (list ?? []).map(({identifier}) => ({identifier}));
  return Object.fromEntries(zoneKeys(draft).map((zone) => {
    const data = zoneData(draft, zone) ?? {};
    const maps = mapKeysInZone(draft, zone).map((map) => {
      const mapFileData = mapData(draft, zone, map) ?? {};
      return {identifier: map, ncus: identifiers(mapFileData.ncus), units: identifiers(mapFileData.units)};
    });
    const keys = (section) => Object.fromEntries(Object.keys(data[section] ?? {}).map((key) => [key, {}]));
    return [zone, {unitTypes: keys("unitTypes"), items: keys("items"), maps}];
  }));
}

// Where to look for a problem at a quests-file path like "$[2].objectives[0]".
function questLocation(quests, path) {
  const index = /^\$\[(\d+)\]/.exec(path ?? "")?.[1];
  const identifier = index !== undefined ? quests[Number(index)]?.identifier : null;
  return identifier ? {quests: true, quest: identifier} : {quests: true};
}

async function checkQuests(draft) {
  const file = questsFile(draft);
  if (!file || !draft.exists(file)) return [];
  const quests = draft.read(file);
  const {valid, error} = await validateQuests(quests, questZones(draft));
  return valid ? [] : [{file, location: questLocation(Array.isArray(quests) ? quests : [], error.path), message: error.message}];
}

export async function validateDraft(draft) {
  const [zoneProblems, worldProblems, questProblems] = await Promise.all([checkZones(draft), checkWorld(draft), checkQuests(draft)]);
  return [...checkReferences(draft), ...checkIdentifiers(draft), ...worldProblems, ...zoneProblems, ...questProblems];
}
