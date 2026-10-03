import ZoneGraphCanvas from "../../zoneEditor/ZoneGraphCanvas";
import ZoneMapsPanel from "../../zoneEditor/ZoneMapsPanel";
import ZoneItemsPanel from "../../zoneEditor/ZoneItemsPanel";
import ZoneUnitTypesPanel from "../../zoneEditor/ZoneUnitTypesPanel";
import {applyZoneAction, mapDetails, mapKeysInZone, missingZoneRefs, setZoneField, setZonePositions, zoneData, zonePositions} from "../state/zoneOps";
import {assetUrlFor} from "../state/assetUrls";

// The zone level: graph (top-left), zone fields (bottom-left), maps with
// their connections, unit types and items (right). Maps are edited
// elsewhere for now (plans/world-editor/02-maps.md); this level only
// links them into the zone. The old zone editor's graph and panels are
// reused unchanged, their actions applied to the zone's part of the live
// draft (zoneOps#applyZoneAction).
export default function ZoneLevel({draft, zone, onChange, repo}) {
  const data = zoneData(draft, zone);
  const details = mapDetails(draft, zone, (path) => assetUrlFor(draft, repo, path));
  const dispatch = (action) => onChange((current) => applyZoneAction(current, zone, action));
  const setField = (field, value) => onChange(setZoneField(draft, zone, field, value));
  const missing = missingZoneRefs(draft, zone);

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
        <ZoneMapsPanel
          zoneData={data}
          dispatch={dispatch}
          availableMapKeys={mapKeysInZone(draft, zone)}
          mapDetailsByKey={details}
          zoneKey={zone}
          mapEditHref={() => null}
        />
        <ZoneUnitTypesPanel zoneData={data} mapDetailsByKey={details} />
        <ZoneItemsPanel zoneData={data} mapDetailsByKey={details} zoneKey={zone} mapEditHref={() => null} />
      </div>
    </>
  );
}
