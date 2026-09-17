import {useReducer, useState} from "react";
import {zoneReducer} from "./zoneReducer";
import ZoneMapsPanel from "./ZoneMapsPanel";
import ZoneGraphCanvas from "./ZoneGraphCanvas";

// Step 2's skeleton has grown a `maps` list (step 3) - still no Save
// (deferred to step 11, see plans/zone-editor.md) and no zoneKey-driven
// persistence, but there's now real in-memory structure worth editing:
// `name`, and the zone's maps list with add/remove.
export default function ZoneEditor({zoneKey, initialZone, initialAvailableMapDetails, availableMapsUrl, newMapUrl}) {
  const [zoneData, dispatch] = useReducer(zoneReducer, initialZone);
  const [mapDetailsByKey, setMapDetailsByKey] = useState(initialAvailableMapDetails ?? {});
  const [refreshStatus, setRefreshStatus] = useState("");

  // Picks up a map created in another tab (via the "Create Map ↗" link)
  // without reloading the whole editor and losing the draft - same idea as
  // MapEditor's own handleRefresh for unit types/items.
  async function handleRefreshMaps() {
    setRefreshStatus("Refreshing…");
    try {
      const res = await fetch(availableMapsUrl);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      setMapDetailsByKey(await res.json());
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  return (
    <div className="zone-editor">
      <div className="zone-editor-fields">
        <table>
          <tbody>
            <tr>
              <th><label htmlFor="zone-name">Name</label></th>
              <td>
                <input
                  id="zone-name"
                  type="text"
                  value={zoneData.name ?? ""}
                  onChange={(e) => dispatch({type: "SET_FIELD", field: "name", value: e.target.value})}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <ZoneMapsPanel
          zoneData={zoneData}
          dispatch={dispatch}
          mapDetailsByKey={mapDetailsByKey}
          zoneKey={zoneKey}
          newMapUrl={newMapUrl}
          onRefresh={handleRefreshMaps}
          refreshStatus={refreshStatus}
        />
        <ZoneGraphCanvas zoneData={zoneData} mapDetailsByKey={mapDetailsByKey} dispatch={dispatch} />
      </div>
    </div>
  );
}
