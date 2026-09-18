import {useState} from "react";
import {worldEntryPointKey} from "./worldLinkStatus";

function TextField({value, onChange, placeholder}) {
  return <input type="text" value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function Select({value, options, onChange, placeholder}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

// entryPoints maps a serialized WorldEntryPointIdentifier ("zoneId/entryPointKey",
// see docs/schema/world.md) to a required key. A world's own entryPoints
// always target one of a zone's own entryPoints specifically - never an
// openConnection - since that's the only pool a character can actually
// spawn on. Once a zone's in a world, its entryPoints stop being reachable
// by entering that zone directly (see WorldGraphCanvas's own comment) - a
// world's entryPoints are what take over that job instead.
export default function EntryPointsPanel({draft, onChange, zoneDetailsByKey}) {
  const [pendingZone, setPendingZone] = useState("");
  const [pendingEntryPoint, setPendingEntryPoint] = useState("");
  const zoneKeys = Object.keys(draft.data.zones ?? {});
  const entryPoints = draft.data.entryPoints ?? {};
  const usedKeys = Object.keys(entryPoints);

  const pendingEntryPointOptions = Object.keys(zoneDetailsByKey[pendingZone]?.entryPoints ?? {})
    .filter((entryPoint) => !usedKeys.includes(worldEntryPointKey(pendingZone, entryPoint)));

  function handleZoneChange(zone) {
    setPendingZone(zone);
    setPendingEntryPoint("");
  }

  function handleAdd() {
    if (!pendingZone || !pendingEntryPoint) return;
    onChange(draft.setEntryPoint(worldEntryPointKey(pendingZone, pendingEntryPoint), null));
    setPendingZone("");
    setPendingEntryPoint("");
  }

  return (
    <div>
      <h3>Entry Points</h3>
      {usedKeys.length === 0 && <p className="map-sidebar-hint">No entry points yet - a world needs at least one.</p>}
      {usedKeys.map((key) => (
        <div className="entry-block zone-connection-row" key={key}>
          <div className="map-row-summary">
            <span className="zone-connection-name">{key}</span>
          </div>
          <div className="zone-connection-status">
            <span className="zone-connection-status-label">Required key:</span>
            <TextField value={entryPoints[key]} onChange={(v) => onChange(draft.setEntryPoint(key, v))} placeholder="none" />
            <button type="button" className="remove-entry" onClick={() => onChange(draft.removeEntryPoint(key))}>Remove</button>
          </div>
        </div>
      ))}
      <div className="add-buttons-row">
        <Select value={pendingZone} options={zoneKeys} onChange={handleZoneChange} placeholder="Select a zone…" />
        {pendingZone && (
          <Select value={pendingEntryPoint} options={pendingEntryPointOptions} onChange={setPendingEntryPoint} placeholder="Select an entry point…" />
        )}
        <button type="button" className="add-entry" disabled={!pendingZone || !pendingEntryPoint} onClick={handleAdd}>
          + Add Entry Point
        </button>
      </div>
    </div>
  );
}
