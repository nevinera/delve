import {useState} from "react";
import {createUnitType, deleteUnitType, renameUnitType, unitTypeData, unitTypeKeys, unitTypeUses} from "../state/unitTypeOps";
import {resolvePath, unitTypeFile} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";
import ImportUnitTypeForm from "./ImportUnitTypeForm";

// The world's own unit types: open one, create, import from the shared
// library, rename (rewriting every map unit and zone entry using it), or
// delete (refused while it's placed anywhere). Errors from an operation
// show inline; the draft is untouched.
export default function UnitTypeList({draft, onChange, onOpen, repo, library}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [error, setError] = useState(null);
  const keys = unitTypeKeys(draft);

  function attempt(fn) {
    try {
      onChange(fn());
      setError(null);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  function tokenUrl(key, data) {
    const first = data.tokenImageUrl[0];
    return first && !first.startsWith(":") ? assetUrlFor(draft, repo, resolvePath(unitTypeFile(draft.worldKey, key), first)) : null;
  }

  return (
    <section className="zone-list unit-type-list" aria-label="Unit types">
      <div className="zone-list-heading">
        <h3>Unit types</h3>
        {!creating && !importing && (
          <span className="unit-type-list-actions">
            {library && <button type="button" className="add-entry" onClick={() => setImporting(true)}>Import…</button>}
            <button type="button" className="add-entry" onClick={() => setCreating(true)}>+ New unit type</button>
          </span>
        )}
      </div>
      {creating && (
        <NewUnitTypeForm
          onCancel={() => setCreating(false)}
          onCreate={(key, name) => {
            if (attempt(() => createUnitType(draft, key, name))) {
              setCreating(false);
              onOpen(key);
            }
          }}
        />
      )}
      {importing && (
        <ImportUnitTypeForm
          draft={draft} library={library} onChange={onChange}
          onCancel={() => setImporting(false)}
          onImported={(key, missing) => {
            setImporting(false);
            setNotice(missing.length ? `Imported "${key}", but the library is missing: ${missing.join(", ")}` : null);
          }}
        />
      )}
      {notice && <p className="zone-list-error" role="status">{notice}</p>}
      {error && <p className="zone-list-error" role="alert">{error}</p>}
      {keys.length === 0 && !creating && <p className="config-empty">No unit types yet.</p>}
      <ul>
        {keys.map((key) => {
          const data = unitTypeData(draft, key);
          const placed = unitTypeUses(draft, key).reduce((sum, {count}) => sum + count, 0);
          const url = tokenUrl(key, data);
          return (
            <li key={key} className="zone-row">
              {renaming === key ? (
                <RenameForm
                  current={key}
                  onCancel={() => setRenaming(null)}
                  onRename={(to) => attempt(() => renameUnitType(draft, key, to)) && setRenaming(null)}
                />
              ) : (
                <>
                  <button type="button" className="zone-row-open unit-type-row-open" onClick={() => onOpen(key)}>
                    {url ? <img className="unit-type-row-token" src={url} alt="" /> : <span className="unit-type-row-token" />}
                    <span>
                      <span className="zone-row-name">{data.name || key}</span>
                      <span className="zone-row-key">{key} · {placed ? `${placed} placed` : "not placed"}</span>
                    </span>
                  </button>
                  <button type="button" className="add-entry" onClick={() => setRenaming(key)} aria-label={`Rename ${key}`}>Rename</button>
                  <button
                    type="button" className="remove-entry" aria-label={`Delete ${key}`}
                    onClick={() => window.confirm(`Delete unit type "${key}"? Nothing is committed until you save.`) && attempt(() => deleteUnitType(draft, key))}
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NewUnitTypeForm({onCreate, onCancel}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  return (
    <form className="zone-form" onSubmit={(e) => {
      e.preventDefault();
      onCreate(key.trim(), name.trim());
    }}>
      <input aria-label="Unit type identifier" placeholder="identifier (a-z, 0-9, _ -)" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
      <input aria-label="Unit type name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="add-entry" disabled={!key.trim()}>Create</button>
      <button type="button" className="remove-entry" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function RenameForm({current, onRename, onCancel}) {
  const [to, setTo] = useState(current);
  return (
    <form className="zone-form" onSubmit={(e) => {
      e.preventDefault();
      onRename(to.trim());
    }}>
      <input aria-label={`New identifier for ${current}`} value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
      <button type="submit" className="add-entry" disabled={!to.trim() || to.trim() === current}>Rename</button>
      <button type="button" className="remove-entry" onClick={onCancel}>Cancel</button>
    </form>
  );
}
