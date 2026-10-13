// The world's atlas (docs/schema/world.md#atlas): a first guess at it, and
// keeping it in step with the world's zones and maps (renaming or dropping
// one renames or drops its place in the atlas; a no-op for a world with no
// atlas, or none for that zone).
import {guessAtlas} from "../../worldEditor/atlasLayout";
import {keyFromRef} from "../../zoneEditor/mapRef";
import {mapFile, worldFile, zoneFile} from "./worldPaths";

const zoneData = (draft, zone) => draft.read(zoneFile(draft.worldKey, zone));

// The map files the zone references, in its order (what import sees in
// its .full.json).
export function referencedMaps(draft, zone) {
  return (zoneData(draft, zone)?.maps ?? [])
    .filter((entry) => entry?.$ref)
    .map((entry) => draft.read(mapFile(draft.worldKey, zone, keyFromRef(entry.$ref))))
    .filter(Boolean);
}

// Replaces the world's atlas with a fresh guess (see atlasLayout.js).
export function resetAtlas(draft) {
  const path = worldFile(draft.worldKey);
  const world = draft.read(path) ?? {};
  const zones = Object.fromEntries(Object.keys(world.zones ?? {}).map((zone) => {
    const data = zoneData(draft, zone) ?? {};
    return [zone, {maps: referencedMaps(draft, zone), zoneLinks: data.zoneLinks ?? [], openConnections: data.openConnections ?? {}}];
  }));
  return draft.update(path, (data) => ({...data, atlas: guessAtlas({zones, worldLinks: world.worldLinks ?? []})}));
}

function updateAtlasZones(draft, fn) {
  const path = worldFile(draft.worldKey);
  const zones = draft.read(path)?.atlas?.zones;
  if (!zones) return draft;
  return draft.update(path, (data) => ({...data, atlas: {...data.atlas, zones: fn(data.atlas.zones)}}));
}

const renameKey = (dict, from, to) => Object.fromEntries(Object.entries(dict).map(([key, value]) => [key === from ? to : key, value]));
const dropKey = (dict, key) => Object.fromEntries(Object.entries(dict).filter(([k]) => k !== key));

export function renameAtlasZone(draft, from, to) {
  return updateAtlasZones(draft, (zones) => (from in zones ? renameKey(zones, from, to) : zones));
}

export function dropAtlasZone(draft, zone) {
  return updateAtlasZones(draft, (zones) => (zone in zones ? dropKey(zones, zone) : zones));
}

function updateAtlasMaps(draft, zone, fn) {
  return updateAtlasZones(draft, (zones) => (zones[zone]?.maps ? {...zones, [zone]: {...zones[zone], maps: fn(zones[zone].maps)}} : zones));
}

export function renameAtlasMap(draft, zone, from, to) {
  return updateAtlasMaps(draft, zone, (maps) => (from in maps ? renameKey(maps, from, to) : maps));
}

export function dropAtlasMap(draft, zone, map) {
  return updateAtlasMaps(draft, zone, (maps) => (map in maps ? dropKey(maps, map) : maps));
}
