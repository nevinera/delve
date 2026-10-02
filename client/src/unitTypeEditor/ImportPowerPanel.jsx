import {useState} from "react";

function label(path, dir) {
  return path.replace(new RegExp(`^${dir}/`), "").replace(/\.json$/, "");
}

// Copies a power into the unit type, either from the abilities/ library or
// from another unit type. The copy is independent - later edits to the
// source don't carry over.
export default function ImportPowerPanel({libraryPaths, unitTypePaths, loadLibraryPower, loadUnitTypePowers, onImport}) {
  const [libraryPath, setLibraryPath] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [sourcePowers, setSourcePowers] = useState(null);
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

  function importFromLibrary() {
    run(async () => onImport(await loadLibraryPower(libraryPath)));
  }

  function pickUnitType(path) {
    setSourcePath(path);
    setSourcePowers(null);
    if (path) run(async () => setSourcePowers(await loadUnitTypePowers(path)));
  }

  return (
    <div className="import-power">
      <h4>From the power library</h4>
      <div className="import-row">
        <select aria-label="Library power" value={libraryPath} onChange={(e) => setLibraryPath(e.target.value)}>
          <option value="">— pick a power —</option>
          {libraryPaths.map((path) => <option key={path} value={path}>{label(path, "abilities")}</option>)}
        </select>
        <button type="button" className="add-entry" disabled={!libraryPath || busy} onClick={importFromLibrary}>Import</button>
      </div>

      <h4>From another unit type</h4>
      <select aria-label="Unit type" value={sourcePath} onChange={(e) => pickUnitType(e.target.value)}>
        <option value="">— pick a unit type —</option>
        {unitTypePaths.map((path) => <option key={path} value={path}>{label(path, "unit_types")}</option>)}
      </select>
      {sourcePowers && sourcePowers.length === 0 && <p className="config-empty">That unit type has no powers.</p>}
      {sourcePowers?.map((power, i) => (
        <div className="import-row" key={i}>
          <span>{power.name || `Power ${i + 1}`}</span>
          <button type="button" className="add-entry" disabled={busy} onClick={() => onImport(power)}>Import</button>
        </div>
      ))}

      {busy && <p className="config-empty">Loading…</p>}
      {error && <p className="import-error">{error}</p>}
    </div>
  );
}
