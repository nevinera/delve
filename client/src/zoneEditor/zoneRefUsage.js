import {keyFromRef} from "./mapRef";

// Every item identifier referenced by any unit's lootTable, anywhere in
// this zone's referenced-and-resolved maps. Shared between ZoneItemsPanel
// (display only) and syncZoneRefs.js (which uses the same keys to fill in
// any the zone's own `items` dict is missing).
export function aggregateItemUsage(zoneData, mapDetailsByKey) {
  const usage = {}; // itemKey -> {count, mapKeys: Set<string>, mapNames: {[mapKey]: name}}
  for (const entry of zoneData.maps) {
    const key = entry?.$ref ? keyFromRef(entry.$ref) : null;
    const detail = key ? mapDetailsByKey[key] : null;
    if (!detail) continue;
    for (const unit of detail.units ?? []) {
      for (const itemKey of unit.itemKeys ?? []) {
        if (!usage[itemKey]) usage[itemKey] = {count: 0, mapKeys: new Set(), mapNames: {}};
        usage[itemKey].count += 1;
        usage[itemKey].mapKeys.add(key);
        usage[itemKey].mapNames[key] = detail.name ?? key;
      }
    }
  }
  return usage;
}

// Every unitType key referenced by any unit, anywhere in this zone's
// referenced-and-resolved maps. Shared between ZoneUnitTypesPanel (display
// only) and syncZoneRefs.js.
export function aggregateUnitTypeUsage(zoneData, mapDetailsByKey) {
  const usage = {}; // unitType -> count
  for (const entry of zoneData.maps) {
    const key = entry?.$ref ? keyFromRef(entry.$ref) : null;
    const detail = key ? mapDetailsByKey[key] : null;
    if (!detail) continue;
    for (const unit of detail.units ?? []) {
      if (!unit.unitType) continue;
      usage[unit.unitType] = (usage[unit.unitType] ?? 0) + 1;
    }
  }
  return usage;
}
