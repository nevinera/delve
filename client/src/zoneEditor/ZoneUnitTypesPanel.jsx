import {useState} from "react";
import {keyFromRef} from "./mapRef";

// Every unitType key referenced by any unit, anywhere in this zone's
// referenced-and-resolved maps - read-only (see plans/zone-editor.md step
// 8). Same aggregation/validity pattern as ZoneItemsPanel, but simpler: no
// per-map breakdown or token image (unlike the map editor's own unit
// picker) - just a total count across the zone. Editing a unit's type
// happens in the map editor, not here.
function aggregateUnitTypeUsage(zoneData, mapDetailsByKey) {
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

export default function ZoneUnitTypesPanel({zoneData, mapDetailsByKey}) {
  const [collapsed, setCollapsed] = useState(true);
  const usage = aggregateUnitTypeUsage(zoneData, mapDetailsByKey);
  const unitTypeKeys = Object.keys(usage).sort();

  return (
    <div className="zone-unit-types-panel">
      <div className="map-sidebar-section-heading" onClick={() => setCollapsed((c) => !c)}>
        <span className="map-sidebar-section-toggle">{collapsed ? "▸" : "▾"}</span>
        <h3>Unit Types ({unitTypeKeys.length})</h3>
      </div>
      {!collapsed && (
        <div className="zone-unit-types-list">
          {unitTypeKeys.length === 0 && <p className="map-sidebar-hint">No unit types referenced yet.</p>}
          {unitTypeKeys.map((unitTypeKey) => {
            const valid = Object.prototype.hasOwnProperty.call(zoneData.unitTypes ?? {}, unitTypeKey);
            const count = usage[unitTypeKey];
            return (
              <div className="entry-block zone-item-row" key={unitTypeKey}>
                <div className="map-row-summary">
                  {!valid && <span className="zone-item-invalid" title="Not found in this zone's unitTypes">⚠</span>}
                  <span className="zone-item-name">{unitTypeKey}</span>
                </div>
                <div className="zone-item-usage">{count} {count === 1 ? "unit" : "units"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
