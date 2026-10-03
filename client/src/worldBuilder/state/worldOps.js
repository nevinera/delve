// World-level operations over the whole live draft (see
// plans/world-editor/README.md, "Two layers"). Each takes a WorldDraft and
// returns a new one, touching the world file and whatever else must stay
// consistent with it (a zone rename moves the zone's files too).
//
// Per-file logic is reused from the old editor's WorldDraft class
// (worldEditor/WorldDraft.js), applied to the world file's data in place -
// nothing holds it as separate state.
import {WorldDraft as WorldFile} from "../../worldEditor/WorldDraft";
import {stableStringify} from "./WorldDraft";
import {isValidIdentifier, relativePath, worldDir, worldFile, worldLayoutFile, zoneDir, zoneFile, zoneLayoutFile} from "./worldPaths";

export function blankWorld(name) {
  return {name, description: null, thumbnailUrl: null, elevationRange: null, zones: {}, worldLinks: [], entryPoints: {}};
}

export function blankZone(name) {
  return {
    name, description: null, elvl: 0, private: false, maps: [],
    unitTypes: {}, items: {}, zoneLinks: [], entryPoints: {}, openConnections: {},
  };
}

export const worldData = (draft) => draft.read(worldFile(draft.worldKey));

export const zoneKeys = (draft) => Object.keys(worldData(draft)?.zones ?? {});

// Applies a WorldFile (old WorldDraft class) method chain to the world file.
export function updateWorld(draft, fn) {
  const path = worldFile(draft.worldKey);
  return draft.write(path, fn(new WorldFile(draft.read(path))).data);
}

export function createWorld(draft, name) {
  if (draft.exists(worldFile(draft.worldKey))) throw new Error(`${draft.worldKey} already exists`);
  return draft.write(worldFile(draft.worldKey), blankWorld(name)).write(worldLayoutFile(draft.worldKey), {positions: {}});
}

export const setWorldField = (draft, field, value) => updateWorld(draft, (world) => world.setField(field, value));

export function worldPositions(draft) {
  return draft.read(worldLayoutFile(draft.worldKey))?.positions ?? {};
}

// A no-op when nothing moved, so a graph reporting its positions on mount
// never dirties the draft (even with no layout file yet).
export function setWorldPositions(draft, positions) {
  if (stableStringify(positions) === stableStringify(worldPositions(draft))) return draft;
  return draft.write(worldLayoutFile(draft.worldKey), {positions});
}

function checkNewZoneKey(draft, key) {
  if (!isValidIdentifier(key)) throw new Error(`"${key}" isn't a valid identifier (letters, digits, "_" and "-" only)`);
  if (zoneKeys(draft).includes(key) || draft.paths(zoneDir(draft.worldKey, key)).length > 0) throw new Error(`Zone "${key}" already exists`);
}

function zoneEntry(draft, key) {
  const zone = draft.read(zoneFile(draft.worldKey, key)) ?? {};
  return {path: relativePath(worldFile(draft.worldKey), zoneFile(draft.worldKey, key)), name: zone.name ?? key, description: zone.description ?? null};
}

export function createZone(draft, key, name = key) {
  checkNewZoneKey(draft, key);
  const world = draft.worldKey;
  const next = draft.write(zoneFile(world, key), blankZone(name)).write(zoneLayoutFile(world, key), {positions: {}});
  return updateWorld(next, (w) => w.setZone(key, zoneEntry(next, key)));
}

// The world's cached copy of a zone's name/description (see
// docs/schema/world.md, WorldZoneEntry) - kept in step by zoneOps whenever
// the zone file changes.
export function syncZoneEntry(draft, key) {
  if (!worldData(draft)?.zones?.[key]) return draft;
  return updateWorld(draft, (w) => w.setZone(key, zoneEntry(draft, key)));
}

const renameKey = (key, from, to) => (key === from ? to : key.startsWith(`${from}/`) ? `${to}${key.slice(from.length)}` : key);

// Moves the zone's directory and renames its own files, then rewrites
// every world reference to it: its zones entry, worldLinks, entryPoints,
// and graph positions. A stale .full.json is dropped (Expand rebuilds it).
export function renameZone(draft, from, to) {
  if (from === to) return draft;
  checkNewZoneKey(draft, to);
  const world = draft.worldKey;
  let next = draft.moveDir(zoneDir(world, from), zoneDir(world, to));
  const moved = (name) => `${zoneDir(world, to)}/${name}`;
  for (const [oldPath, newPath] of [[moved(`${from}.json`), zoneFile(world, to)], [moved(`${from}.layout.json`), zoneLayoutFile(world, to)]]) {
    if (next.exists(oldPath)) next = next.write(newPath, next.read(oldPath)).remove(oldPath);
  }
  if (next.exists(moved(`${from}.full.json`))) next = next.remove(moved(`${from}.full.json`));

  next = next.update(worldFile(world), (data) => {
    const zones = Object.fromEntries(Object.entries(data.zones ?? {}).map(([key, entry]) => (key === from ? [to, entry] : [key, entry])));
    const side = (s) => (s?.zone === from ? {...s, zone: to} : s);
    return {
      ...data,
      zones,
      worldLinks: (data.worldLinks ?? []).map((link) => ({...link, zoneA: side(link.zoneA), zoneB: side(link.zoneB)})),
      entryPoints: Object.fromEntries(Object.entries(data.entryPoints ?? {}).map(([key, value]) => [renameKey(key, from, to), value])),
    };
  });
  next = syncZoneEntry(next, to);

  const positions = worldPositions(next);
  const renamed = Object.fromEntries(Object.entries(positions).map(([key, pos]) => {
    if (key.startsWith("entryPoint:")) return [`entryPoint:${renameKey(key.slice("entryPoint:".length), from, to)}`, pos];
    return [renameKey(key, from, to), pos];
  }));
  return Object.keys(positions).length ? setWorldPositions(next, renamed) : next;
}

// Removes the zone's directory, its world entry, and every worldLink and
// entry point that used it.
export function deleteZone(draft, key) {
  const next = updateWorld(draft.removeDir(zoneDir(draft.worldKey, key)), (w) => w.removeZone(key));
  const positions = worldPositions(next);
  const kept = Object.fromEntries(Object.entries(positions).filter(([k]) => {
    const target = k.startsWith("entryPoint:") ? k.slice("entryPoint:".length) : k;
    return renameKey(target, key, "\0") === target;
  }));
  return Object.keys(kept).length === Object.keys(positions).length ? next : setWorldPositions(next, kept);
}

// What deleteZone would take with it, for a confirm prompt.
export function zoneDeletionImpact(draft, key) {
  const world = worldData(draft) ?? {};
  return {
    files: draft.paths(zoneDir(draft.worldKey, key)).length,
    worldLinks: (world.worldLinks ?? []).filter((l) => l.zoneA?.zone === key || l.zoneB?.zone === key).length,
    entryPoints: Object.keys(world.entryPoints ?? {}).filter((k) => k.split("/")[0] === key).length,
  };
}

// {[zoneKey]: {name, description, openConnections, entryPoints}} for every
// zone in the world, read live from the draft - the shape the world graph
// and link/entry point panels take (see
// worldEditor/worldContentLoaders.js#zoneDetailsFor).
export function zoneDetails(draft) {
  return Object.fromEntries(zoneKeys(draft).flatMap((key) => {
    const zone = draft.read(zoneFile(draft.worldKey, key));
    if (!zone) return [];
    return [[key, {name: zone.name, description: zone.description ?? null, openConnections: zone.openConnections ?? {}, entryPoints: zone.entryPoints ?? {}}]];
  }));
}

// Stores an uploaded thumbnail beside the world file and points
// thumbnailUrl at it.
export function setWorldThumbnail(draft, file, extension) {
  const name = `${draft.worldKey}.thumb.${extension}`;
  return setWorldField(draft.write(`${worldDir(draft.worldKey)}/${name}`, file), "thumbnailUrl", name);
}
