import {useState} from "react";
import {keyFromRef, mapEditPath} from "./mapRef";

// Every item identifier referenced by any unit's lootTable, anywhere in
// this zone's referenced-and-resolved maps - read-only (see
// plans/zone-editor.md step 7). Editing a unit's lootTable happens in the
// map editor, not here; this is purely "what's used, and is it valid".
function aggregateItemUsage(zoneData, mapDetailsByKey) {
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

export default function ZoneItemsPanel({zoneData, mapDetailsByKey, zoneKey}) {
  const [collapsed, setCollapsed] = useState(true);
  const usage = aggregateItemUsage(zoneData, mapDetailsByKey);
  const itemKeys = Object.keys(usage).sort();

  return (
    <div className="zone-items-panel">
      <div className="map-sidebar-section-heading" onClick={() => setCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{collapsed ? "▸" : "▾"}</span>
        <h3>Items ({itemKeys.length})</h3>
      </div>
      {!collapsed && (
        <div className="zone-items-list">
          {itemKeys.length === 0 && <p className="map-sidebar-hint">No items referenced yet.</p>}
          {itemKeys.map((itemKey) => {
            const info = usage[itemKey];
            const valid = Object.prototype.hasOwnProperty.call(zoneData.items ?? {}, itemKey);
            const mapKeys = [...info.mapKeys];
            const unitWord = info.count === 1 ? "unit" : "units";
            return (
              <div className="entry-block zone-item-row" key={itemKey}>
                <div className="map-row-summary">
                  {!valid && <span className="zone-item-invalid" title="Not found in this zone's items">⚠</span>}
                  <span className="zone-item-name">{itemKey}</span>
                </div>
                <div className="zone-item-usage">
                  {mapKeys.length === 1 ? (
                    <>
                      {info.count} {unitWord} on{" "}
                      <a href={mapEditPath(zoneKey, mapKeys[0])} target="_blank" rel="noreferrer">{info.mapNames[mapKeys[0]]} ↗</a>
                    </>
                  ) : (
                    `${info.count} ${unitWord} across ${mapKeys.length} maps`
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
