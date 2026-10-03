import {useEffect, useState} from "react";

const suggestedKey = (label) => label.split("/").pop().replace(/[^A-Za-z0-9_-]/g, "-");

// Copies one of the shared library's files of a kind (unit types, items)
// into the world, under a key of the user's choosing (its own name by
// default), with every asset it uses. list(library) gives the choices
// ([{path, label}]); prepare(draft, library, path, key) reads it and
// resolves to {apply(draft), missing} (see importing.js).
// onImported(key, missing) - missing lists any asset the library lacks.
export default function ImportForm({noun, draft, library, list, prepare, onChange, onImported, onCancel}) {
  const [options, setOptions] = useState(null);
  const [path, setPath] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    list(library).then((found) => !cancelled && setOptions(found), (e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [library, list]);

  function pick(nextPath) {
    setPath(nextPath);
    const option = options.find((o) => o.path === nextPath);
    setKey(option ? suggestedKey(option.label) : "");
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepare(draft, library, path, key.trim());
      onChange((current) => prepared.apply(current));
      onImported(key.trim(), prepared.missing);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="zone-form import-form" onSubmit={submit}>
      <select aria-label={`Library ${noun}`} value={path} onChange={(e) => pick(e.target.value)} disabled={!options}>
        <option value="">{options ? "— import from the library —" : "Loading…"}</option>
        {options?.map((option) => <option key={option.path} value={option.path}>{option.label}</option>)}
      </select>
      <input aria-label={`Imported ${noun} identifier`} placeholder="identifier" value={key} onChange={(e) => setKey(e.target.value)} />
      <button type="submit" className="add-entry" disabled={busy || !path || !key.trim()}>{busy ? "Importing…" : "Import"}</button>
      <button type="button" className="remove-entry" onClick={onCancel}>Cancel</button>
      {error && <p className="zone-list-error" role="alert">{error}</p>}
    </form>
  );
}
