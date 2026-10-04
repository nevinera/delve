import {useState} from "react";
import ImportForm from "./ImportForm";
import {NewEntryForm} from "./ContentList";

// The map level's extra ways to get one of the world's own unit types or
// items while placing units (the Units tab's palette, a unit's loot
// table): import one from the shared library (list/prepare - see
// ImportForm), or create one (create(draft, key, name)), which is opened
// for editing first (onCreated) and used once that's done.
export default function ContentAdder({noun, draft, library, list, prepare, create, onChange, onAdded, onCreated}) {
  const [mode, setMode] = useState(null);
  const [error, setError] = useState(null);

  if (mode === "import") {
    return (
      <ImportForm
        noun={noun} draft={draft} library={library} list={list} prepare={prepare}
        onChange={onChange} onImported={(key) => onAdded(key)} onCancel={() => setMode(null)}
      />
    );
  }
  if (mode === "create") {
    return (
      <>
        <NewEntryForm
          noun={noun}
          onCancel={() => setMode(null)}
          onCreate={(key, name) => {
            try {
              onChange(create(draft, key, name));
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
    <div className="content-adder">
      {library && <button type="button" className="add-entry" onClick={() => setMode("import")}>Import from library…</button>}
      <button type="button" className="add-entry" onClick={() => setMode("create")}>Create new…</button>
    </div>
  );
}
