import {useState} from "react";

// Copies a power in, picked in three stages: a source type (power library,
// class, unit type - see powerSources.js#IMPORT_SOURCE_TYPES), then one
// source of that type, then one of its powers. The copy is independent -
// later edits to the source don't carry over.
//
// listSources(typeId) and loadPowers(typeId, sourceId) each resolve to a
// list; onImport(power) receives the copied power. `full` disables
// importing when the owner can't take another power.
export default function ImportPowerPanel({sourceTypes, listSources, loadPowers, onImport, full}) {
  const [typeId, setTypeId] = useState("");
  const [sources, setSources] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [powers, setPowers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function pickType(id) {
    setTypeId(id);
    setSources(null);
    setSourceId("");
    setPowers(null);
    if (id) run(async () => setSources(await listSources(id)));
  }

  function pickSource(id) {
    setSourceId(id);
    setPowers(null);
    if (id) run(async () => setPowers(await loadPowers(typeId, id)));
  }

  return (
    <div className="import-power">
      {full && <p className="config-empty">Every slot is full - remove a power before importing another.</p>}
      <select aria-label="Source type" value={typeId} onChange={(e) => pickType(e.target.value)}>
        <option value="">— import from —</option>
        {sourceTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
      </select>

      {sources && (
        <select aria-label="Source" value={sourceId} onChange={(e) => pickSource(e.target.value)}>
          <option value="">{sources.length ? "— pick one —" : "(none found)"}</option>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select>
      )}

      {powers && powers.length === 0 && <p className="config-empty">No powers there.</p>}
      {powers?.map((power, i) => (
        <div className="import-row" key={i}>
          <span>{power.name || `Power ${i + 1}`}</span>
          <button type="button" className="add-entry" disabled={busy || full} onClick={() => onImport(power)}>Import</button>
        </div>
      ))}

      {busy && <p className="config-empty">Loading…</p>}
      {error && <p className="import-error">{error}</p>}
    </div>
  );
}
