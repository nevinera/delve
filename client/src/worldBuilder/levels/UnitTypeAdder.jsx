import {useState} from "react";
import ImportUnitTypeForm from "./ImportUnitTypeForm";
import {NewUnitTypeForm} from "./UnitTypeList";
import {createUnitType} from "../state/unitTypeOps";

// The map level's extra ways into the Units tab's palette (see
// MapWorkbench's renderUnitTypeAdder): import one of the shared library's
// unit types, or create a new one - which opens it for editing first
// (onCreated), joining the palette when that's done.
export default function UnitTypeAdder({draft, library, onChange, onAdded, onCreated}) {
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);

  if (mode === "import") {
    return <ImportUnitTypeForm draft={draft} library={library} onChange={onChange} onImported={(key) => onAdded(key)} onCancel={() => setMode(null)} />;
  }
  if (mode === "create") {
    return (
      <>
        <NewUnitTypeForm
          onCancel={() => setMode(null)}
          onCreate={(key, name) => {
            try {
              onChange(createUnitType(draft, key, name));
              onCreated(key);
            } catch (e) {
              setError(e.message);
            }
          }}
        />
        {error && <p className="zone-list-error" role="alert">{error}</p>}
      </>
    );
  }
  return (
    <div className="unit-type-adder">
      {library && <button type="button" className="add-entry" onClick={() => setMode("import")}>Import from library…</button>}
      <button type="button" className="add-entry" onClick={() => setMode("create")}>Create new…</button>
    </div>
  );
}
