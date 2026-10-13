// Keeps the world's atlas (docs/schema/world.md#atlas) in step with its
// zones and maps: renaming or dropping one renames or drops its place in
// the atlas. A no-op for a world with no atlas, or none for that zone.
import {worldFile} from "./worldPaths";

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
