import {useState} from "react";
import {aggregateUnitTypeUsage} from "./zoneRefUsage";

// Every unitType key referenced by any unit, anywhere in this zone's
// referenced-and-resolved maps - same aggregation/validity pattern as
// ZoneItemsPanel, but simpler: no per-map breakdown or token image (unlike
// the map editor's own unit picker), just a total count across the zone.
// Not directly editable here (see plans/zone-editor.md step 8) - a unit's
// type is set in the map editor, and any key that isn't yet in the zone's
// own `unitTypes` dict gets added automatically at save time instead (see
// syncZoneRefs.js), so a key shown as invalid here is expected to only
// ever be transient, between placing a unit and saving.
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
