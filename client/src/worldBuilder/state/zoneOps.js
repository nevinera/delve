// Zone-level operations over the whole live draft (see
// plans/world-editor/README.md, "Two layers"): each edits one zone's part
// of the draft, plus whatever must stay consistent with it (the world's
// cached zone name/description), and returns the new draft.
//
// Per-file logic is reused from the old zone editor's ZoneDraft class,
// applied to the zone file's data in place. Map details come straight
// from the draft, so there's nothing to fetch.
import {ZoneDraft as ZoneFile} from "../../zoneEditor/ZoneDraft";
import {keyFromRef, refFromKey} from "../../zoneEditor/mapRef";
import {aggregateItemUsage, aggregateUnitTypeUsage} from "../../zoneEditor/zoneRefUsage";
import {rebaseRelativeUrls, dirname} from "../../content/rebaseRelativeUrls";
import {syncZoneEntry} from "./worldOps";
import {stableStringify} from "./WorldDraft";
import {itemFile, mapFile, relativePath, resolvePath, unitTypeFile, zoneDir, zoneFile, zoneLayoutFile} from "./worldPaths";

export const zoneData = (draft, zone) => draft.read(zoneFile(draft.worldKey, zone));

// Applies a ZoneFile (old ZoneDraft class) method chain to the zone file,
// then re-syncs the world's cached copy of its name/description.
export function updateZone(draft, zone, fn) {
  const path = zoneFile(draft.worldKey, zone);
  return syncZoneEntry(draft.write(path, fn(new ZoneFile(draft.read(path))).data), zone);
}

export const setZoneField = (draft, zone, field, value) => updateZone(draft, zone, (z) => z.setField(field, value));

export function zonePositions(draft, zone) {
  return draft.read(zoneLayoutFile(draft.worldKey, zone))?.positions ?? {};
}

// A no-op when nothing moved (see worldOps#setWorldPositions).
export function setZonePositions(draft, zone, positions) {
  if (stableStringify(positions) === stableStringify(zonePositions(draft, zone))) return draft;
  return draft.write(zoneLayoutFile(draft.worldKey, zone), {positions});
}

// Every map directory in the zone (<zone>/<map>/<map>.json), whether or
// not the zone references it yet.
export function mapKeysInZone(draft, zone) {
  const dir = zoneDir(draft.worldKey, zone);
  return draft.paths(dir)
    .map((path) => path.slice(dir.length + 1).split("/"))
    .filter((parts) => parts.length === 2 && parts[1] === `${parts[0]}.json`)
    .map((parts) => parts[0]);
}

// {[mapKey]: {identifier, name, connections, units, thumbnailUrl}} for
// every map the zone references - the shape the zone graph and panels
// already take (see zoneEditor/zoneContentLoaders.js#mapDetailsFor).
// assetUrl(repoPath), if given, turns thumbnailUrl into something
// displayable; otherwise it's left as the map file has it.
export function mapDetails(draft, zone, assetUrl = null) {
  const details = {};
  for (const entry of zoneData(draft, zone)?.maps ?? []) {
    if (!entry?.$ref) continue;
    const key = keyFromRef(entry.$ref);
    const path = mapFile(draft.worldKey, zone, key);
    const map = draft.read(path);
    if (!map) continue;
    const thumbnail = map.thumbnailUrl && assetUrl ? assetUrl(resolvePath(path, map.thumbnailUrl)) : map.thumbnailUrl;
    details[key] = {
      identifier: map.identifier,
      name: map.name,
      connections: map.connections ?? [],
      units: (map.units ?? []).map((unit) => ({unitType: unit.unitType, itemKeys: Object.keys(unit.lootTable ?? {})})),
      thumbnailUrl: thumbnail ?? null,
    };
  }
  return details;
}

// Fills in the zone's unitTypes/items dicts with a $ref to the world's own
// file for every key its maps use and it doesn't list yet (never removes:
// see zoneEditor/syncZoneRefs.js for why).
export function syncZoneRefs(draft, zone) {
  const world = draft.worldKey;
  const data = zoneData(draft, zone);
  const details = mapDetails(draft, zone);
  const fill = (existing, keys, fileFor, referenceTo) => {
    const missing = keys.filter((key) => !Object.hasOwn(existing ?? {}, key));
    if (!missing.length) return existing ?? {};
    const refs = missing.map((key) => [key, {$ref: relativePath(zoneFile(world, zone), fileFor(world, key)), referenceTo}]);
    return {...(existing ?? {}), ...Object.fromEntries(refs)};
  };
  const synced = {
    ...data,
    unitTypes: fill(data.unitTypes, Object.keys(aggregateUnitTypeUsage(data, details)), unitTypeFile, "unit_type"),
    items: fill(data.items, Object.keys(aggregateItemUsage(data, details)), itemFile, "item"),
  };
  return draft.write(zoneFile(world, zone), synced);
}

export function addMap(draft, zone, mapKey) {
  const next = updateZone(draft, zone, (z) => z.addEntry("maps", {$ref: refFromKey(mapKey), referenceTo: "map"}));
  return syncZoneRefs(next, zone);
}

// Drops the map from the zone (its files stay), along with every zone
// link, entry point and open connection that used it.
export function removeMap(draft, zone, index) {
  const ref = zoneData(draft, zone)?.maps?.[index]?.$ref;
  const key = ref ? keyFromRef(ref) : null;
  const identifier = key ? draft.read(mapFile(draft.worldKey, zone, key))?.identifier ?? key : null;
  return updateZone(draft, zone, (z) => z.removeMap(index, identifier));
}

function isRef(value) {
  return Boolean(value) && typeof value === "object" && typeof value.$ref === "string";
}

// The zone with every $ref inlined (recursively), asset URLs rebased to
// the zone's directory - what Validate checks and Expand writes as
// <zone>.full.json. Throws naming any $ref that doesn't resolve.
export function resolveZone(draft, zone) {
  const path = zoneFile(draft.worldKey, zone);
  const zoneDirPath = dirname(path);

  function inline(node, containingFile) {
    if (Array.isArray(node)) return node.map((item) => inline(item, containingFile));
    if (node && typeof node === "object") {
      if (isRef(node)) {
        const target = resolvePath(containingFile, node.$ref);
        const content = target && draft.read(target);
        if (!content) throw new Error(`${containingFile}: $ref ${node.$ref} doesn't resolve`);
        return inline(rebaseRelativeUrls(content, dirname(target), zoneDirPath), target);
      }
      return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, inline(value, containingFile)]));
    }
    return node;
  }

  return {...inline(zoneData(draft, zone), path), flags: zoneFlags(zone)};
}

// The flags a zone preloads for each character on entry (see
// plans/flags.md): compiled from the zone's nested data, never edited.
// For now that's only the one every character gets on reaching it.
export function zoneFlags(zone) {
  return [`zone/reached/${zone}`];
}

// The old zone editor's action shapes (see zoneEditor/ZoneEditor.jsx's
// dispatch), applied to the zone's part of the live draft - so its graph
// and panels work unchanged. Adding a map also fills in the zone's refs
// to whatever unit types and items the map uses.
export function applyZoneAction(draft, zone, action) {
  switch (action.type) {
    case "ADD_ENTRY": {
      const next = updateZone(draft, zone, (z) => z.addEntry(action.section, action.entry));
      return action.section === "maps" ? syncZoneRefs(next, zone) : next;
    }
    case "REMOVE_MAP":
      return removeMap(draft, zone, action.index);
    default:
      return updateZone(draft, zone, (z) => {
        switch (action.type) {
          case "SET_FIELD": return z.setField(action.field, action.value);
          case "REMOVE_ENTRY": return z.removeEntry(action.section, action.index);
          case "UPDATE_ENTRY_FIELD": return z.updateEntryField(action.section, action.index, action.field, action.value);
          case "UPDATE_ENTRY_FIELDS": return z.updateEntryFields(action.section, action.index, action.fields);
          case "SET_ENTRY_POINT": return z.setEntryPoint(action.key, action.requiredKey);
          case "REMOVE_ENTRY_POINT": return z.removeEntryPoint(action.key);
          case "SET_OPEN_CONNECTION": return z.setOpenConnection(action.key, action.name);
          case "REMOVE_OPEN_CONNECTION": return z.removeOpenConnection(action.key);
          case "ADD_ZONE_LINK": return z.addZoneLink(action.connectionA, action.connectionB);
          case "REMOVE_ZONE_LINK": return z.removeZoneLink(action.index);
          default: throw new Error(`Unknown zone action: ${action.type}`);
        }
      });
  }
}

// Every unit type or item $ref in the zone whose file the world doesn't
// have - shown as a warning, and a Validate error.
export function missingZoneRefs(draft, zone) {
  const path = zoneFile(draft.worldKey, zone);
  const data = zoneData(draft, zone) ?? {};
  const missing = (section) => Object.entries(data[section] ?? {})
    .filter(([, ref]) => isRef(ref) && !draft.exists(resolvePath(path, ref.$ref) ?? ""))
    .map(([key]) => key);
  return {unitTypes: missing("unitTypes"), items: missing("items")};
}
