// The world's atlas (docs/schema/world.md#atlas): a first guess at it, and
// keeping it in step with the world's zones and maps (renaming or dropping
// one renames or drops its place in the atlas; a no-op for a world with no
// atlas, or none for that zone).
import {guessAtlas} from "../../worldEditor/atlasLayout";
import {keyFromRef} from "../../zoneEditor/mapRef";
import {mapFile, resolvePath, worldFile, zoneFile} from "./worldPaths";

const zoneData = (draft, zone) => draft.read(zoneFile(draft.worldKey, zone));

// The map files the zone references, in its order (what import sees in
// its .full.json).
export function referencedMaps(draft, zone) {
  return (zoneData(draft, zone)?.maps ?? [])
    .filter((entry) => entry?.$ref)
    .map((entry) => draft.read(mapFile(draft.worldKey, zone, keyFromRef(entry.$ref))))
    .filter(Boolean);
}

export const atlasData = (draft) => draft.read(worldFile(draft.worldKey))?.atlas ?? null;

// What the atlas is laid out from: {zones: {zone: {maps, zoneLinks,
// openConnections}}, worldLinks}, each map its map file (as guessAtlas and
// atlasLinks take it).
export function atlasInput(draft) {
  const world = draft.read(worldFile(draft.worldKey)) ?? {};
  const zones = Object.fromEntries(Object.keys(world.zones ?? {}).map((zone) => {
    const data = zoneData(draft, zone) ?? {};
    return [zone, {maps: referencedMaps(draft, zone), zoneLinks: data.zoneLinks ?? [], openConnections: data.openConnections ?? {}}];
  }));
  return {zones, worldLinks: world.worldLinks ?? []};
}

// {zone: {map: {width, height}}} for every referenced map.
export function atlasSizes(input) {
  return Object.fromEntries(Object.entries(input.zones).map(([zone, {maps}]) => [zone, Object.fromEntries(maps.map((m) => [m.identifier, {width: m.feetDimensions?.width ?? 0, height: m.feetDimensions?.height ?? 0}]))]));
}

// {zone: {map: repoPath}} of each referenced map's thumbnail, where it has
// one.
export function atlasThumbnails(draft) {
  return Object.fromEntries(Object.keys(draft.read(worldFile(draft.worldKey))?.zones ?? {}).map((zone) => [zone, Object.fromEntries(
    (zoneData(draft, zone)?.maps ?? []).filter((entry) => entry?.$ref).flatMap((entry) => {
      const path = mapFile(draft.worldKey, zone, keyFromRef(entry.$ref));
      const map = draft.read(path);
      return map?.thumbnailUrl ? [[map.identifier, resolvePath(path, map.thumbnailUrl)]] : [];
    }),
  )]));
}

export function setAtlas(draft, atlas) {
  return draft.update(worldFile(draft.worldKey), (data) => ({...data, atlas}));
}

// Replaces the world's atlas with a fresh guess (see atlasLayout.js).
export function resetAtlas(draft) {
  return setAtlas(draft, guessAtlas(atlasInput(draft)));
}

function updateAtlas(draft, fn) {
  const path = worldFile(draft.worldKey);
  const atlas = draft.read(path)?.atlas;
  if (!atlas?.zones) return draft;
  const next = fn(atlas);
  return next === atlas ? draft : draft.update(path, (data) => ({...data, atlas: next}));
}

const renameKey = (dict, from, to) => Object.fromEntries(Object.entries(dict).map(([key, value]) => [key === from ? to : key, value]));
const dropKey = (dict, key) => Object.fromEntries(Object.entries(dict).filter(([k]) => k !== key));

// The atlas with each bend key's ends ("zone/map/connection") passed
// through end(parts), which returns new parts or null to drop the bend.
function mapBendEnds(atlas, end) {
  if (!atlas.bends) return atlas;
  const bends = {};
  for (const [key, offset] of Object.entries(atlas.bends)) {
    const ends = key.split("|").map((e) => end(e.split("/")));
    if (ends.every(Boolean)) bends[ends.map((parts) => parts.join("/")).sort().join("|")] = offset;
  }
  const {bends: _, ...rest} = atlas;
  return Object.keys(bends).length ? {...rest, bends} : rest;
}

export function renameAtlasZone(draft, from, to) {
  return updateAtlas(draft, (atlas) => (from in atlas.zones || atlas.bends
    ? mapBendEnds({...atlas, zones: renameKey(atlas.zones, from, to)}, ([zone, ...rest]) => [zone === from ? to : zone, ...rest])
    : atlas));
}

export function dropAtlasZone(draft, zone) {
  return updateAtlas(draft, (atlas) => (zone in atlas.zones || atlas.bends
    ? mapBendEnds({...atlas, zones: dropKey(atlas.zones, zone)}, (parts) => (parts[0] === zone ? null : parts))
    : atlas));
}

function withMaps(atlas, zone, fn) {
  return atlas.zones[zone]?.maps ? {...atlas, zones: {...atlas.zones, [zone]: {...atlas.zones[zone], maps: fn(atlas.zones[zone].maps)}}} : atlas;
}

export function renameAtlasMap(draft, zone, from, to) {
  return updateAtlas(draft, (atlas) => mapBendEnds(withMaps(atlas, zone, (maps) => renameKey(maps, from, to)),
    ([z, map, connection]) => [z, z === zone && map === from ? to : map, connection]));
}

export function dropAtlasMap(draft, zone, map) {
  return updateAtlas(draft, (atlas) => mapBendEnds(withMaps(atlas, zone, (maps) => dropKey(maps, map)),
    (parts) => (parts[0] === zone && parts[1] === map ? null : parts)));
}
