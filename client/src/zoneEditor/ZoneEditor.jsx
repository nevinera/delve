import {useReducer, useState} from "react";
import {zoneReducer} from "./zoneReducer";
import ZoneMapsPanel from "./ZoneMapsPanel";
import ZoneItemsPanel from "./ZoneItemsPanel";
import ZoneUnitTypesPanel from "./ZoneUnitTypesPanel";
import ZoneGraphCanvas from "./ZoneGraphCanvas";
import ZoneSidebar from "./ZoneSidebar";
import {resolveZoneRefs} from "./resolveZoneRefs";
import {saveZone} from "./saveZone";
import {validateZone} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubAuthError} from "../github/commitFiles";

// Same two-pane layout every other editor uses: the graph fills the big
// left-hand canvas area, the collapsible right-hand sidebar holds the
// entry-list panels (Validate/Save, name field, maps list). Validate
// resolves the draft's $refs client-side (resolveZoneRefs.js) before
// posting - same resolved-form requirement the class/unit type editors'
// own Validate has. Save commits the abstract zone.json, a resolved
// .full.json companion, and the graph's own layout metadata together in
// one atomic commit (saveZone.js) - see docs/schema/common.md#assetreference
// for why an abstract config needs that .full.json alongside it.
//
// mapDetailsByKey only ever holds full detail for maps this zone's draft
// actually references - availableMapKeys is the cheap, full directory
// listing (bare keys, no file opens) "Add Map" offers candidates from.
// Picking one fetches just that map's detail lazily (see handleAddMap) -
// see Build::ZonesController for the matching server-side split.
export default function ZoneEditor({
  zoneKey, initialZone, initialPositions, initialAvailableMapKeys, initialAvailableMapDetails, availableMapsUrl, newMapUrl,
}) {
  const [zoneData, rawDispatch] = useReducer(zoneReducer, initialZone);
  const [availableMapKeys, setAvailableMapKeys] = useState(initialAvailableMapKeys ?? []);
  const [mapDetailsByKey, setMapDetailsByKey] = useState(initialAvailableMapDetails ?? {});
  const [refreshStatus, setRefreshStatus] = useState("");
  // The graph's own live drag-override map (see ZoneGraphCanvas's
  // onPositionsChange/initialPositions) - tracked here without
  // ZoneGraphCanvas needing to know anything about persistence itself.
  const [graphPositions, setGraphPositions] = useState(initialPositions ?? {});
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  function dispatch(action) {
    markDirty();
    rawDispatch(action);
  }

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

  async function handleValidate() {
    setValidating();
    try {
      const fullZone = await resolveZoneRefs(zoneData, `zones/${zoneKey}`);
      const {valid, error} = await validateZone(fullZone);
      if (valid) setValid();
      else setInvalid(error.message);
    } catch (error) {
      setInvalid(error.message);
    }
  }

  async function handleSave() {
    setSaving();
    try {
      await saveZone(zoneKey, zoneData, graphPositions);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setSaveError(error.message);
    }
  }

  return (
    <div className="zone-editor">
      <div className="zone-editor-canvas-area">
        <ZoneGraphCanvas
          zoneData={zoneData}
          mapDetailsByKey={mapDetailsByKey}
          dispatch={dispatch}
          initialPositions={initialPositions}
          onPositionsChange={setGraphPositions}
        />
      </div>
      <ZoneSidebar>
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
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
        <ZoneUnitTypesPanel zoneData={zoneData} mapDetailsByKey={mapDetailsByKey} />
      </ZoneSidebar>
    </div>
  );
}
