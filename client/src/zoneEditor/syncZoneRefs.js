import {aggregateItemUsage, aggregateUnitTypeUsage} from "./zoneRefUsage";

// unitTypes/items aren't directly editable in the zone editor (see
// ZoneUnitTypesPanel.jsx/ZoneItemsPanel.jsx) - a unit's type/lootTable is
// set in the map editor instead, which has no reason to know about (or
// touch) the zone-level dict that resolves it. Left alone, that meant a
// key used on a map but never separately added to the zone's own
// unitTypes/items dict would save "successfully" and only fail later, at
// instance-start time on the game server ("references unknown unit type").
// So instead: at validate/save time, fill in - never remove, since a
// manually-curated entry for a key no map currently uses isn't wrong, just
// unused - whichever of the zone's own unitTypes/items keys are missing,
// using the same key as the real unit_types/items file (this is the
// convention every hand-authored zone already follows, e.g.
// goblin-cave.json's "goblin-archer" -> "../../unit_types/goblin-archer.json").
// The zone file lives at zones/<zoneKey>/, and zoneKey's own "/"s (e.g.
// "small/forest") each add a directory level, so the climb back to the
// repo root is one ".." per zoneKey segment plus one for zones/ itself.
function toRepoRoot(zoneKey) {
  return "../".repeat(zoneKey.split("/").length + 1);
}

function withMissingKeys(existing, usedKeys, rootPrefix, dir, referenceTo) {
  const missing = usedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(existing ?? {}, key));
  if (missing.length === 0) return existing ?? {};
  const refFor = (key) => ({$ref: `${rootPrefix}${dir}/${key}.json`, referenceTo});
  return {...(existing ?? {}), ...Object.fromEntries(missing.map((key) => [key, refFor(key)]))};
}

// Returns a copy of zoneData whose unitTypes/items dicts include every key
// actually used by its own maps (per mapDetailsByKey - see
// zoneContentLoaders.js's mapDetailsFor), adding whatever's missing.
export function syncZoneRefs(zoneData, mapDetailsByKey, zoneKey) {
  const rootPrefix = toRepoRoot(zoneKey);
  const itemKeys = Object.keys(aggregateItemUsage(zoneData, mapDetailsByKey));
  const unitTypeKeys = Object.keys(aggregateUnitTypeUsage(zoneData, mapDetailsByKey));
  return {
    ...zoneData,
    items: withMissingKeys(zoneData.items, itemKeys, rootPrefix, "items", "item"),
    unitTypes: withMissingKeys(zoneData.unitTypes, unitTypeKeys, rootPrefix, "unit_types", "unit_type"),
  };
}
