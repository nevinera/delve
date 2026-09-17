import {useReducer, useState} from "react";
import {zoneReducer} from "./zoneReducer";
import ZoneMapsPanel from "./ZoneMapsPanel";
import ZoneItemsPanel from "./ZoneItemsPanel";
import ZoneGraphCanvas from "./ZoneGraphCanvas";
import ZoneSidebar from "./ZoneSidebar";

// Same two-pane layout every other editor uses: the graph fills the big
// left-hand canvas area, the collapsible right-hand sidebar holds the
// entry-list panels (name field, maps list). Still no Save (deferred to
// step 11, see plans/zone-editor.md) and no zoneKey-driven persistence.
//
// mapDetailsByKey only ever holds full detail for maps this zone's draft
// actually references - availableMapKeys is the cheap, full directory
// listing (bare keys, no file opens) "Add Map" offers candidates from.
// Picking one fetches just that map's detail lazily (see handleAddMap) -
// see Build::ZonesController for the matching server-side split.
export default function ZoneEditor({zoneKey, initialZone, initialAvailableMapKeys, initialAvailableMapDetails, availableMapsUrl, newMapUrl}) {
  const [zoneData, dispatch] = useReducer(zoneReducer, initialZone);
  const [availableMapKeys, setAvailableMapKeys] = useState(initialAvailableMapKeys ?? []);
  const [mapDetailsByKey, setMapDetailsByKey] = useState(initialAvailableMapDetails ?? {});
  const [refreshStatus, setRefreshStatus] = useState("");

  // Picks up a map created in another tab (via the "Create Map ↗" link)
  // without reloading the whole editor and losing the draft - re-fetches
  // just the cheap key list, same idea as MapEditor's own handleRefresh
  // for unit types/items (which likewise only re-fetches the cheap list,
  // not every detail).
  async function handleRefreshMaps() {
    setRefreshStatus("Refreshing…");
    try {
      const res = await fetch(availableMapsUrl);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      setAvailableMapKeys(await res.json());
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  // Fetches {identifier, name, connections, units, thumbnailUrl} for a map
  // just picked from "Add Map" - it was only ever a bare key in
  // availableMapKeys until now, never opened.
  async function fetchMapDetail(key) {
    try {
      const res = await fetch(`${availableMapsUrl}?${new URLSearchParams({"keys[]": key})}`);
      if (!res.ok) return;
      const details = await res.json();
      setMapDetailsByKey((current) => ({...current, ...details}));
    } catch {
      // best-effort, same as MapEditor's own fetchUnitTypeDetails/fetchItemDetails
    }
  }

  return (
    <div className="zone-editor">
      <div className="zone-editor-canvas-area">
        <ZoneGraphCanvas zoneData={zoneData} mapDetailsByKey={mapDetailsByKey} dispatch={dispatch} />
      </div>
      <ZoneSidebar>
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
          availableMapKeys={availableMapKeys}
          mapDetailsByKey={mapDetailsByKey}
          onAddMap={fetchMapDetail}
          zoneKey={zoneKey}
          newMapUrl={newMapUrl}
          onRefresh={handleRefreshMaps}
          refreshStatus={refreshStatus}
        />
        <ZoneItemsPanel zoneData={zoneData} mapDetailsByKey={mapDetailsByKey} zoneKey={zoneKey} />
      </ZoneSidebar>
    </div>
  );
}
