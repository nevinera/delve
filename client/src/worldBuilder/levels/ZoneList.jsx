import {useState} from "react";
import {createZone, deleteZone, renameZone, worldData, zoneDeletionImpact, zoneKeys} from "../state/worldOps";

// The world's zones: open one, create, rename (moves its files and
// rewrites every world reference), or delete (after a confirm listing
// what goes with it). Errors from an operation (a taken or malformed
// identifier) show inline; the draft is untouched.
export default function ZoneList({draft, onChange, onOpen}) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [error, setError] = useState(null);
  const zones = worldData(draft).zones ?? {};

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

  function confirmDelete(key) {
    const {files, worldLinks, entryPoints} = zoneDeletionImpact(draft, key);
    const message = `Delete zone "${key}"? This removes ${files} file(s), ${worldLinks} world link(s) and ${entryPoints} entry point(s). Nothing is committed until you save.`;
    if (window.confirm(message)) attempt(() => deleteZone(draft, key));
  }

  return (
    <section className="zone-list" aria-label="Zones">
      <div className="zone-list-heading">
        <h3>Zones</h3>
        {!creating && <button type="button" className="add-entry" onClick={() => setCreating(true)}>+ New zone</button>}
      </div>
      {creating && (
        <NewZoneForm
          onCancel={() => setCreating(false)}
          onCreate={(key, name) => {
            if (attempt(() => createZone(draft, key, name))) {
              setCreating(false);
              onOpen(key);
            }
          }}
        />
      )}
      {error && <p className="zone-list-error" role="alert">{error}</p>}
      {zoneKeys(draft).length === 0 && !creating && <p className="config-empty">No zones yet.</p>}
      <ul>
        {zoneKeys(draft).map((key) => (
          <li key={key} className="zone-row">
            {renaming === key ? (
              <RenameForm
                current={key}
                onCancel={() => setRenaming(null)}
                onRename={(to) => attempt(() => renameZone(draft, key, to)) && setRenaming(null)}
              />
            ) : (
              <>
                <button type="button" className="zone-row-open" onClick={() => onOpen(key)}>
                  <span className="zone-row-name">{zones[key].name || key}</span>
                  <span className="zone-row-key">{key}{draft.dirtyUnder(`worlds/${draft.worldKey}/zones/${key}`).length > 0 ? " • unsaved" : ""}</span>
                </button>
                <button type="button" className="add-entry" onClick={() => setRenaming(key)} aria-label={`Rename ${key}`}>Rename</button>
                <button type="button" className="remove-entry" onClick={() => confirmDelete(key)} aria-label={`Delete ${key}`}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewZoneForm({onCreate, onCancel}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  return (
    <form className="zone-form" onSubmit={(e) => {
      e.preventDefault();
      onCreate(key.trim(), name.trim() || key.trim());
    }}>
      <input aria-label="Zone identifier" placeholder="identifier (a-z, 0-9, _ -)" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
      <input aria-label="Zone name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
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
