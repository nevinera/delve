// Map-level operations over the whole live draft (see
// plans/world-editor/README.md, "Two layers"): each edits one map's part of
// the draft, plus whatever must stay consistent with it (the zone's refs
// to the unit types and items the map uses; on a rename, every zone
// reference to the map), and returns the new draft.
import {MapDraft} from "../../mapEditor/MapDraft";
import {blankMap} from "../../mapEditor/mapContentLoaders";
import {keyFromRef, refFromKey} from "../../zoneEditor/mapRef";
import {addMap, removeMap, syncZoneRefs, zoneData, zonePositions, setZonePositions} from "./zoneOps";
import {isValidIdentifier, itemFile, mapDir, mapFile, resolvePath, unitTypeFile, worldDir, zoneFile} from "./worldPaths";

export const mapData = (draft, zone, map) => draft.read(mapFile(draft.worldKey, zone, map));

// Applies a MapDraft (old map editor class) method chain to the map file,
// then fills in the zone's refs for any unit type or item it now uses.
export function updateMap(draft, zone, map, fn) {
  const path = mapFile(draft.worldKey, zone, map);
  const next = draft.write(path, fn(new MapDraft(draft.read(path))).data);
  return mapIndex(next, zone, map) === -1 ? next : syncZoneRefs(next, zone);
}

function mapIndex(draft, zone, map) {
  return (zoneData(draft, zone)?.maps ?? []).findIndex((entry) => entry?.$ref && keyFromRef(entry.$ref) === map);
}

function checkNewMapKey(draft, zone, key) {
  if (!isValidIdentifier(key)) throw new Error(`"${key}" isn't a valid identifier (letters, digits, "_" and "-" only)`);
  if (draft.paths(mapDir(draft.worldKey, zone, key)).length > 0) throw new Error(`Map "${key}" already exists in ${zone}`);
}

// A blank map in the zone's directory, added to the zone.
export function createMap(draft, zone, key, name = key) {
  checkNewMapKey(draft, zone, key);
  const next = draft.write(mapFile(draft.worldKey, zone, key), {...blankMap(key), name});
  return addMap(next, zone, key);
}

// Moves the map's directory and renames its own file, sets its identifier,
// and rewrites every reference the zone makes to it: its maps entry, zone
// links, entry points, open connections and graph positions - plus the
// world's entry points into it. Assets named after the map keep their
// names (imageUrl/thumbnailUrl still point at them).
export function renameMap(draft, zone, from, to) {
  if (from === to) return draft;
  checkNewMapKey(draft, zone, to);
  const world = draft.worldKey;
  let next = draft.moveDir(mapDir(world, zone, from), mapDir(world, zone, to));
  const oldFile = `${mapDir(world, zone, to)}/${from}.json`;
  next = next.write(mapFile(world, zone, to), {...next.read(oldFile), identifier: to}).remove(oldFile);

  const renameKey = (key) => (key.split("/")[0] === from ? [to, ...key.split("/").slice(1)].join("/") : key);
  const renameKeys = (dict) => Object.fromEntries(Object.entries(dict ?? {}).map(([k, v]) => [renameKey(k), v]));
  const side = (s) => (s?.map === from ? {...s, map: to} : s);
  next = next.update(zoneFile(world, zone), (data) => ({
    ...data,
    maps: (data.maps ?? []).map((entry) => (entry?.$ref && keyFromRef(entry.$ref) === from ? {...entry, $ref: refFromKey(to)} : entry)),
    zoneLinks: (data.zoneLinks ?? []).map((link) => ({...link, connectionA: side(link.connectionA), connectionB: side(link.connectionB)})),
    entryPoints: renameKeys(data.entryPoints),
    openConnections: renameKeys(data.openConnections),
  }));

  const worldPath = `${worldDir(world)}/${world}.json`;
  const worldPrefix = `${zone}/${from}/`;
  next = next.update(worldPath, (data) => ({
    ...data,
    entryPoints: Object.fromEntries(Object.entries(data.entryPoints ?? {}).map(([k, v]) => [k.startsWith(worldPrefix) ? `${zone}/${to}/${k.slice(worldPrefix.length)}` : k, v])),
  }));

  const positions = zonePositions(next, zone);
  return setZonePositions(next, zone, Object.fromEntries(Object.entries(positions).map(([key, pos]) => {
    const colon = key.indexOf(":");
    return colon === -1 ? [renameKey(key), pos] : [`${key.slice(0, colon + 1)}${renameKey(key.slice(colon + 1))}`, pos];
  })));
}

// Removes the map from the zone (with its links, entry points and open
// connections) and deletes its directory.
export function deleteMap(draft, zone, key) {
  const index = mapIndex(draft, zone, key);
  const next = index === -1 ? draft : removeMap(draft, zone, index);
  return next.removeDir(mapDir(draft.worldKey, zone, key));
}

// Stores a new background image (and its thumbnail, if one could be made)
// beside the map file, pointing imageUrl/thumbnailUrl at them, and
// recording its pixel size when given. The background it replaces
// (`previous`, its old imageUrl) is removed if it had another name.
export function setMapImage(draft, zone, map, {file, name, pixelDimensions = null, thumbnail = null, previous = null}) {
  const path = mapFile(draft.worldKey, zone, map);
  let next = draft.write(resolvePath(path, name), file);
  const previousPath = previous && previous !== name ? resolvePath(path, previous) : null;
  if (previousPath && next.exists(previousPath)) next = next.remove(previousPath);
  if (thumbnail) next = next.write(resolvePath(path, `${map}.thumb.webp`), thumbnail);
  return updateMap(next, zone, map, (d) => {
    let updated = d.setField("imageUrl", name);
    if (pixelDimensions) updated = updated.setPixelDimensions(pixelDimensions);
    return thumbnail ? updated.setField("thumbnailUrl", `${map}.thumb.webp`) : updated;
  });
}

// The world's own unit types and items, as the map panels take them (see
// MapWorkbench's unitTypes/items props). assetUrl(repoPath) makes token
// images displayable.
export function worldUnitTypes(draft, assetUrl) {
  const dir = `${worldDir(draft.worldKey)}/unit_types/`;
  const keys = draft.paths(`${worldDir(draft.worldKey)}/unit_types`).filter((p) => p.endsWith(".json")).map((p) => p.slice(dir.length, -".json".length));
  const details = Object.fromEntries(keys.map((key) => {
    const path = unitTypeFile(draft.worldKey, key);
    const unitType = draft.read(path) ?? {};
    const raw = Array.isArray(unitType.tokenImageUrl) ? unitType.tokenImageUrl[0] : unitType.tokenImageUrl;
    const tokenPath = raw && !raw.startsWith(":") ? resolvePath(path, raw) : null;
    return [key, {name: unitType.name, tokenRadius: unitType.tokenRadius, tokenImageUrl: tokenPath ? assetUrl(tokenPath) : null, speedFactor: unitType.speedFactor}];
  }));
  return {keys, details};
}

export function worldItems(draft) {
  const dir = `${worldDir(draft.worldKey)}/items/`;
  const keys = draft.paths(`${worldDir(draft.worldKey)}/items`).filter((p) => p.endsWith(".json")).map((p) => p.slice(dir.length, -".json".length));
  const details = Object.fromEntries(keys.map((key) => {
    const item = draft.read(itemFile(draft.worldKey, key)) ?? {};
    return [key, {identifier: item.identifier ?? key, name: item.name, slot: item.slot}];
  }));
  return {keys, details};
}

// raw NCU tokenImageUrl -> displayable URL, for every NCU on the map.
export function ncuTokenUrls(draft, zone, map, assetUrl) {
  const path = mapFile(draft.worldKey, zone, map);
  const raws = [...new Set((mapData(draft, zone, map)?.ncus ?? []).map((n) => n.tokenImageUrl).filter(Boolean))];
  return Object.fromEntries(raws.map((raw) => [raw, raw.startsWith(":") ? raw : assetUrl(resolvePath(path, raw))]));
}
