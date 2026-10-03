// World unit type operations over the whole live draft (see
// plans/world-editor/README.md, "Two layers"): each edits one unit type's
// file, plus whatever must stay consistent with it (on a rename, every
// zone's unitTypes entry and every map unit using it), and returns the new
// draft. A world's unit types live at worlds/<w>/unit_types/<key>.json,
// powers inline.
import {blankUnitType} from "../../unitTypeEditor/blankUnitType";
import {normalizeUnitType} from "../../unitTypeEditor/UnitTypeWorkbench";
import {keyFromRef} from "../../zoneEditor/mapRef";
import {zoneData} from "./zoneOps";
import {zoneKeys} from "./worldOps";
import {isValidIdentifier, mapFile, relativePath, unitTypeFile, worldDir, zoneFile} from "./worldPaths";

const unitTypesDir = (draft) => `${worldDir(draft.worldKey)}/unit_types`;

export function unitTypeKeys(draft) {
  const dir = `${unitTypesDir(draft)}/`;
  return draft.paths(unitTypesDir(draft)).filter((p) => p.endsWith(".json") && !p.slice(dir.length).includes("/"))
    .map((p) => p.slice(dir.length, -".json".length)).sort();
}

// The unit type as the editor works on it (tokenImageUrl always an array).
export function unitTypeData(draft, key) {
  const data = draft.read(unitTypeFile(draft.worldKey, key));
  return data && normalizeUnitType(data);
}

export function updateUnitType(draft, key, data) {
  return draft.write(unitTypeFile(draft.worldKey, key), data);
}

function checkNewKey(draft, key) {
  if (!isValidIdentifier(key)) throw new Error(`"${key}" isn't a valid identifier (letters, digits, "_" and "-" only)`);
  if (draft.exists(unitTypeFile(draft.worldKey, key))) throw new Error(`Unit type "${key}" already exists`);
}

export function createUnitType(draft, key, name) {
  checkNewKey(draft, key);
  const blank = blankUnitType(key);
  return draft.write(unitTypeFile(draft.worldKey, key), name ? {...blank, name} : blank);
}

// Every map in the world, as [zone, mapKey, mapData].
function worldMaps(draft) {
  return zoneKeys(draft).flatMap((zone) => (zoneData(draft, zone)?.maps ?? [])
    .filter((entry) => entry?.$ref)
    .map((entry) => keyFromRef(entry.$ref))
    .map((map) => [zone, map, draft.read(mapFile(draft.worldKey, zone, map))])
    .filter(([, , data]) => data));
}

// Where the unit type is placed: [{zone, map, count}].
export function unitTypeUses(draft, key) {
  return worldMaps(draft).flatMap(([zone, map, data]) => {
    const count = (data.units ?? []).filter((unit) => unit.unitType === key).length;
    return count ? [{zone, map, count}] : [];
  });
}

// Moves the file and rewrites every reference: each map unit's unitType,
// and each zone's unitTypes entry (its key and $ref).
export function renameUnitType(draft, from, to) {
  if (from === to) return draft;
  checkNewKey(draft, to);
  const world = draft.worldKey;
  let next = draft.write(unitTypeFile(world, to), draft.read(unitTypeFile(world, from))).remove(unitTypeFile(world, from));
  for (const [zone, map, data] of worldMaps(next)) {
    if (!(data.units ?? []).some((unit) => unit.unitType === from)) continue;
    next = next.write(mapFile(world, zone, map), {...data, units: data.units.map((unit) => (unit.unitType === from ? {...unit, unitType: to} : unit))});
  }
  for (const zone of zoneKeys(next)) {
    const data = zoneData(next, zone);
    if (!Object.hasOwn(data?.unitTypes ?? {}, from)) continue;
    const unitTypes = Object.fromEntries(Object.entries(data.unitTypes).map(([key, ref]) => (key === from
      ? [to, {...ref, $ref: relativePath(zoneFile(world, zone), unitTypeFile(world, to))}]
      : [key, ref])));
    next = next.write(zoneFile(world, zone), {...data, unitTypes});
  }
  return next;
}

// Refused while any map places it (the error lists where); otherwise
// removes the file and every zone's unitTypes entry for it. Its token
// images stay - other unit types may use them.
export function deleteUnitType(draft, key) {
  const uses = unitTypeUses(draft, key);
  if (uses.length) {
    throw new Error(`"${key}" is still placed on ${uses.map(({zone, map, count}) => `${zone}/${map} (${count})`).join(", ")}`);
  }
  let next = draft.remove(unitTypeFile(draft.worldKey, key));
  for (const zone of zoneKeys(next)) {
    const data = zoneData(next, zone);
    if (!Object.hasOwn(data?.unitTypes ?? {}, key)) continue;
    const {[key]: _dropped, ...unitTypes} = data.unitTypes;
    next = next.write(zoneFile(draft.worldKey, zone), {...data, unitTypes});
  }
  return next;
}
