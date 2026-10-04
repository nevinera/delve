import {useState} from "react";

const capitalized = (text) => text[0].toUpperCase() + text.slice(1);

// A world-level list of one kind of the world's own content (unit types,
// items): open one, create, import (renderImport, if given), rename, or
// delete. The operations are the kind's own (see unitTypeOps/itemOps) -
// each returns the next draft or throws, and a throw shows inline with the
// draft untouched. describe(key) gives each row's {name, detail, thumbUrl}.
export default function ContentList({title, noun, keys, describe, create, rename, remove, onChange, onOpen, renderImport}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

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

  return (
    <section className="zone-list content-list" aria-label={title}>
      <div className="zone-list-heading">
        <h3>{title}</h3>
        {!creating && !importing && (
          <span className="content-list-actions">
            {renderImport && <button type="button" className="add-entry" onClick={() => setImporting(true)}>Import…</button>}
            <button type="button" className="add-entry" onClick={() => setCreating(true)}>+ New {noun}</button>
          </span>
        )}
      </div>
      {creating && (
        <NewEntryForm
          noun={noun}
          onCancel={() => setCreating(false)}
          onCreate={(key, name) => {
            if (attempt(() => create(key, name))) {
              setCreating(false);
              onOpen(key);
            }
          }}
        />
      )}
      {importing && renderImport({
        onCancel: () => setImporting(false),
        onImported: (key, missing) => {
          setImporting(false);
          setNotice(missing.length ? `Imported "${key}", but the library is missing: ${missing.join(", ")}` : null);
        },
      })}
      {notice && <p className="zone-list-error" role="status">{notice}</p>}
      {error && <p className="zone-list-error" role="alert">{error}</p>}
      {keys.length === 0 && !creating && <p className="config-empty">No {noun}s yet.</p>}
      <ul>
        {keys.map((key) => {
          const {name, detail, thumbUrl} = describe(key);
          return (
            <li key={key} className="zone-row">
              {renaming === key ? (
                <RenameForm
                  current={key}
                  onCancel={() => setRenaming(null)}
                  onRename={(to) => attempt(() => rename(key, to)) && setRenaming(null)}
                />
              ) : (
                <>
                  <button type="button" className="zone-row-open content-row-open" onClick={() => onOpen(key)}>
                    {thumbUrl !== undefined && (thumbUrl ? <img className="content-row-thumb" src={thumbUrl} alt="" /> : <span className="content-row-thumb" />)}
                    <span>
                      <span className="zone-row-name">{name || key}</span>
                      <span className="zone-row-key">{key} · {detail}</span>
                    </span>
                  </button>
                  <button type="button" className="add-entry" onClick={() => setRenaming(key)} aria-label={`Rename ${key}`}>Rename</button>
                  <button
                    type="button" className="remove-entry" aria-label={`Delete ${key}`}
                    onClick={() => window.confirm(`Delete ${noun} "${key}"? Nothing is committed until you save.`) && attempt(() => remove(key))}
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

export function NewEntryForm({noun, onCreate, onCancel}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  return (
    <form className="zone-form" onSubmit={(e) => {
      e.preventDefault();
      onCreate(key.trim(), name.trim());
    }}>
      <input aria-label={`${capitalized(noun)} identifier`} placeholder="identifier (a-z, 0-9, _ -)" value={key} onChange={(e) => setKey(e.target.value)} autoFocus />
      <input aria-label={`${capitalized(noun)} name`} placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
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
