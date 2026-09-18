import {useState} from "react";

// zones is a plain "<zoneKey>" -> {path, name, description} dict (see
// docs/schema/world.md). A zone is always referenced by path, never
// inlined - name/description are cached copies of the referenced zone's
// own fields, kept in sync by WorldEditor (see WorldDraft#syncZoneDetails)
// whenever a zone is added or the graph's own "Refresh Connections" is
// clicked, never typed by hand here, so they're rendered as plain text,
// not fields. This panel's own "Refresh" button (below) only re-lists
// zones/ itself, cheaply (no file opens) - it can't guess a zone's real
// name/description without opening its file, same reasoning "Pick an
// existing zone…" stays keys-only. A zone key can't be typed by hand and
// guessed right either - it has to come from a real tree-listing of
// what's actually registered under zones/ (see
// worldContentLoaders.js#listAvailableZoneKeys), same reasoning
// ZoneMapsPanel's own "Add Map" picker uses one level down.
export default function ZonesPanel({draft, onChange, availableZoneKeys, onAddZone, onRefresh, refreshStatus, newZoneUrl}) {
  const [pendingKey, setPendingKey] = useState("");
  const zones = draft.data.zones ?? {};
  const keys = Object.keys(zones);
  const candidateKeys = availableZoneKeys.filter((key) => !zones[key]);

  function handleAdd() {
    if (!pendingKey || zones[pendingKey]) return;
    onAddZone(pendingKey);
    setPendingKey("");
  }

  return (
    <div>
      <h3>Zones</h3>
      {keys.length === 0 && <p className="map-sidebar-hint">No zones yet.</p>}
      {keys.map((key) => {
        const zone = zones[key];
        return (
          <div className="entry-block" key={key}>
            <div className="entry-heading-row">
              <h4>{zone.name || key}</h4>
              <button type="button" className="remove-entry" onClick={() => onChange(draft.removeZone(key))}>Remove</button>
            </div>
            <table>
              <tbody>
                <tr>
                  <th>Path</th>
                  <td>{zone.path}</td>
                </tr>
                {zone.description && (
                  <tr>
                    <th>Description</th>
                    <td>{zone.description}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
      <div className="add-buttons-row">
        {candidateKeys.length > 0 && (
          <>
            {/* Bare key, not a fetched name - showing a friendly name here
                would mean opening every candidate's file just to populate
                this dropdown, same reasoning ZoneMapsPanel's own picker
                gives for staying cheap. */}
            <select value={pendingKey} onChange={(e) => setPendingKey(e.target.value)}>
              <option value="">Pick an existing zone…</option>
              {candidateKeys.map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
            <button type="button" className="add-entry" disabled={!pendingKey} onClick={handleAdd}>Add</button>
          </>
        )}
        {newZoneUrl && <a href={newZoneUrl} target="_blank" rel="noreferrer">Create Zone ↗</a>}
        <button type="button" className="add-entry" onClick={onRefresh}>Refresh</button>
        {refreshStatus && <span className="map-sidebar-hint">{refreshStatus}</span>}
      </div>
    </div>
  );
}
