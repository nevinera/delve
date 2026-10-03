import {useState} from "react";
import ZoneGraphCanvas from "../../zoneEditor/ZoneGraphCanvas";
import ZoneMapsPanel from "../../zoneEditor/ZoneMapsPanel";
import ZoneItemsPanel from "../../zoneEditor/ZoneItemsPanel";
import ZoneUnitTypesPanel from "../../zoneEditor/ZoneUnitTypesPanel";
import {applyZoneAction, mapDetails, mapKeysInZone, missingZoneRefs, setZoneField, setZonePositions, zoneData, zonePositions} from "../state/zoneOps";
import {assetUrlFor} from "../state/assetUrls";
import {createMap, deleteMap, renameMap} from "../state/mapOps";

// The zone level: graph (top-left), zone fields (bottom-left), maps with
// their connections, unit types and items (right). Maps open into the map
// level (from their row, or by double-clicking their graph node), and can
// be created, renamed and deleted here. The old zone editor's graph and
// panels are reused, their actions applied to the zone's part of the live
// draft (zoneOps#applyZoneAction).
export default function ZoneLevel({draft, zone, onChange, navigate, repo}) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [mapError, setMapError] = useState(null);
  const data = zoneData(draft, zone);
  const details = mapDetails(draft, zone, (path) => assetUrlFor(draft, repo, path));
  const dispatch = (action) => onChange((current) => applyZoneAction(current, zone, action));
  const setField = (field, value) => onChange(setZoneField(draft, zone, field, value));
  const missing = missingZoneRefs(draft, zone);
  const openMap = (map) => navigate({zone, map});

  function attempt(fn) {
    try {
      onChange(fn());
      setMapError(null);
      return true;
    } catch (e) {
      setMapError(e.message);
      return false;
    }
  }

  function confirmDelete(map) {
    if (window.confirm(`Delete map "${map}" and all its files? Nothing is committed until you save.`)) attempt(() => deleteMap(draft, zone, map));
  }

  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <ZoneGraphCanvas
            key={`${zone}@${draft.snapshot.commitSha}`}
            zoneData={data}
            mapDetailsByKey={details}
            dispatch={dispatch}
            initialPositions={zonePositions(draft, zone)}
            onPositionsChange={(positions) => onChange((current) => setZonePositions(current, zone, positions))}
            onOpenNode={openMap}
          />
        </div>
        <div className="world-attributes">
          <h3>Zone</h3>
          <p className="world-key">Identifier: <code>{zone}</code></p>
          <table>
            <tbody>
              <tr>
                <th><label htmlFor="zone-name">Name</label></th>
                <td><input id="zone-name" type="text" value={data.name ?? ""} onChange={(e) => setField("name", e.target.value)} /></td>
              </tr>
              <tr>
                <th><label htmlFor="zone-description">Description</label></th>
                <td><input id="zone-description" type="text" value={data.description ?? ""} onChange={(e) => setField("description", e.target.value || null)} /></td>
              </tr>
              <tr>
                <th><label htmlFor="zone-elvl">Elevation</label></th>
                <td>
                  <input
                    id="zone-elvl"
                    type="number"
                    step="1"
                    min="0"
                    value={data.elvl ?? ""}
                    onChange={(e) => setField("elvl", e.target.value === "" ? null : parseInt(e.target.value, 10))}
                  />
                </td>
              </tr>
              <tr>
                <th><label htmlFor="zone-private">Private</label></th>
                <td><input id="zone-private" type="checkbox" checked={data.private ?? false} onChange={(e) => setField("private", e.target.checked)} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="content-editor-fields">
        {(missing.unitTypes.length > 0 || missing.items.length > 0) && (
          <div className="zone-missing-refs" role="alert">
            This world has no file for:
            {missing.unitTypes.length > 0 && <span> unit type(s) {missing.unitTypes.join(", ")}</span>}
            {missing.items.length > 0 && <span> item(s) {missing.items.join(", ")}</span>}
            . Validate will fail until they exist.
          </div>
        )}
        <section className="map-actions" aria-label="Map actions">
          {creating ? (
            <KeyForm
              fields={[["Map identifier", "identifier (a-z, 0-9, _ -)"], ["Map name", "name"]]}
              submitLabel="Create"
              onCancel={() => setCreating(false)}
              onSubmit={([key, name]) => {
                if (attempt(() => createMap(draft, zone, key, name || key))) {
                  setCreating(false);
                  openMap(key);
                }
              }}
            />
          ) : renaming ? (
            <KeyForm
              fields={[[`New identifier for ${renaming}`, "identifier"]]}
              initial={[renaming]}
              submitLabel="Rename"
              onCancel={() => setRenaming(null)}
              onSubmit={([to]) => attempt(() => renameMap(draft, zone, renaming, to)) && setRenaming(null)}
            />
          ) : (
            <button type="button" className="add-entry" onClick={() => setCreating(true)}>+ New map</button>
          )}
          {mapError && <p className="zone-list-error" role="alert">{mapError}</p>}
        </section>
        <ZoneMapsPanel
          zoneData={data}
          dispatch={dispatch}
          availableMapKeys={mapKeysInZone(draft, zone)}
          mapDetailsByKey={details}
          zoneKey={zone}
          mapEditHref={() => null}
          rowActions={(map) => (
            <>
              <button type="button" className="add-entry" onClick={() => openMap(map)} aria-label={`Open ${map}`}>Open</button>
              <button type="button" className="add-entry" onClick={() => setRenaming(map)} aria-label={`Rename ${map}`}>Rename</button>
              <button type="button" className="remove-entry" onClick={() => confirmDelete(map)} aria-label={`Delete ${map}`} title="Delete the map and its files (Remove only takes it out of this zone)">Delete</button>
            </>
          )}
        />
        <ZoneUnitTypesPanel zoneData={data} mapDetailsByKey={details} />
        <ZoneItemsPanel zoneData={data} mapDetailsByKey={details} zoneKey={zone} mapEditHref={() => null} />
      </div>
    </>
  );
}

// A small inline form of text fields; onSubmit gets their trimmed values.
function KeyForm({fields, initial = [], submitLabel, onSubmit, onCancel}) {
  const [values, setValues] = useState(() => fields.map((_, i) => initial[i] ?? ""));
  return (
    <form className="zone-form" onSubmit={(e) => {
      e.preventDefault();
      onSubmit(values.map((v) => v.trim()));
    }}>
      {fields.map(([label, placeholder], i) => (
        <input
          key={label}
          aria-label={label}
          placeholder={placeholder}
          value={values[i]}
          autoFocus={i === 0}
          onChange={(e) => setValues((current) => current.map((v, j) => (j === i ? e.target.value : v)))}
        />
      ))}
      <button type="submit" className="add-entry" disabled={!values[0].trim()}>{submitLabel}</button>
      <button type="button" className="remove-entry" onClick={onCancel}>Cancel</button>
    </form>
  );
}
