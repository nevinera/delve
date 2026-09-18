import {useEffect, useRef, useState} from "react";
import {ZoneDraft} from "./ZoneDraft";
import ZoneMapsPanel from "./ZoneMapsPanel";
import ZoneItemsPanel from "./ZoneItemsPanel";
import ZoneUnitTypesPanel from "./ZoneUnitTypesPanel";
import ZoneGraphCanvas from "./ZoneGraphCanvas";
import ZoneSidebar from "./ZoneSidebar";
import {loadZone, loadLayoutPositions, listZoneMapKeys, referencedMapKeys, mapDetailsFor} from "./zoneContentLoaders";
import {resolveZoneRefs} from "./resolveZoneRefs";
import {saveZone} from "./saveZone";
import {validateZone} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

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
// Neither the zone's own content, its layout positions, nor the maps
// lists/details are bootstrapped from the server any more (see
// plans/editor-git.md) - all fetched here, client-side, on mount.
// mapDetailsByKey only ever holds full detail for maps this zone's draft
// actually references - availableMapKeys is the cheap, full directory
// listing (bare keys, no file opens) "Add Map" offers candidates from.
// Picking one fetches just that map's detail lazily (see handleAddMap).
export default function ZoneEditor({zoneKey, newMapUrl}) {
  const [draft, setDraft] = useState(null);
  const [availableMapKeys, setAvailableMapKeys] = useState([]);
  const [mapDetailsByKey, setMapDetailsByKey] = useState({});
  const [refreshStatus, setRefreshStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const client = useRef(new GithubClient());
  // The graph's own live drag-override map (see ZoneGraphCanvas's
  // onPositionsChange/initialPositions) - tracked here without
  // ZoneGraphCanvas needing to know anything about persistence itself.
  const [graphPositions, setGraphPositions] = useState({});
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, positions] = await Promise.all([loadZone(client.current, zoneKey), loadLayoutPositions(client.current, zoneKey)]);
        if (cancelled) return;
        setDraft(new ZoneDraft(data));
        setGraphPositions(positions);

        const mapKeys = await listZoneMapKeys(client.current, zoneKey);
        if (cancelled) return;
        setAvailableMapKeys(mapKeys);

        const referenced = referencedMapKeys(data);
        if (referenced.length > 0) {
          const details = await mapDetailsFor(client.current, zoneKey, referenced);
          if (!cancelled) setMapDetailsByKey(details);
        }
        setLoaded(true);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          window.location.href = error.redirectUrl;
          return;
        }
        setLoadError(error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoneKey]);

  const zoneData = draft?.data;

  // Translates every action shape ZoneMapsPanel/ZoneMapConnectionsPanel/
  // ZoneGraphCanvas (still)/this component's own field inputs send into
  // ZoneDraft method calls - keeps every one of those components exactly as
  // they were, same "dispatch shim" MapEditor.jsx's own rewrite uses.
  function dispatch(action) {
    markDirty();
    setDraft((d) => {
      switch (action.type) {
        case "SET_FIELD":
          return d.setField(action.field, action.value);
        case "ADD_ENTRY":
          return d.addEntry(action.section, action.entry);
        case "REMOVE_ENTRY":
          return d.removeEntry(action.section, action.index);
        case "UPDATE_ENTRY_FIELD":
          return d.updateEntryField(action.section, action.index, action.field, action.value);
        case "UPDATE_ENTRY_FIELDS":
          return d.updateEntryFields(action.section, action.index, action.fields);
        case "REMOVE_MAP":
          return d.removeMap(action.index, action.mapIdentifier);
        case "SET_ENTRY_POINT":
          return d.setEntryPoint(action.key, action.requiredKey);
        case "REMOVE_ENTRY_POINT":
          return d.removeEntryPoint(action.key);
        case "SET_OPEN_CONNECTION":
          return d.setOpenConnection(action.key, action.name);
        case "REMOVE_OPEN_CONNECTION":
          return d.removeOpenConnection(action.key);
        case "REMOVE_ZONE_LINK":
          return d.removeZoneLink(action.index);
        case "ADD_ZONE_LINK":
          return d.addZoneLink(action.connectionA, action.connectionB);
        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    });
  }

  // Picks up a map created in another tab (via the "Create Map ↗" link)
  // without reloading the whole editor and losing the draft - re-fetches
  // just the cheap key list, same idea as MapEditor's own handleRefresh
  // for unit types/items (which likewise only re-fetches the cheap list,
  // not every detail).
  async function handleRefreshMaps() {
    setRefreshStatus("Refreshing…");
    try {
      setAvailableMapKeys(await listZoneMapKeys(client.current, zoneKey));
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
      const details = await mapDetailsFor(client.current, zoneKey, [key]);
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

  if (loadError) return <div className="zone-editor-load-error">Failed to load: {loadError}</div>;
  if (!loaded) return <div className="zone-editor-loading">Loading…</div>;

  return (
    <div className="zone-editor">
      <div className="zone-editor-canvas-area">
        <ZoneGraphCanvas
          zoneData={zoneData}
          mapDetailsByKey={mapDetailsByKey}
          dispatch={dispatch}
          initialPositions={graphPositions}
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
            <tr>
              <th><label htmlFor="zone-elvl">Elevation</label></th>
              <td>
                <input
                  id="zone-elvl"
                  type="number"
                  step="1"
                  min="0"
                  value={zoneData.elvl ?? ""}
                  onChange={(e) => dispatch({type: "SET_FIELD", field: "elvl", value: e.target.value === "" ? null : parseInt(e.target.value, 10)})}
                />
              </td>
            </tr>
            <tr>
              <th><label htmlFor="zone-private">Private</label></th>
              <td>
                <input
                  id="zone-private"
                  type="checkbox"
                  checked={zoneData.private ?? false}
                  onChange={(e) => dispatch({type: "SET_FIELD", field: "private", value: e.target.checked})}
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
