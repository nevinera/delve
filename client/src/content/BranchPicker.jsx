import {useState} from "react";

const CREATE = "\0create";

// Picks the branch the whole editor reads and writes. Disabled while the
// draft has unsaved changes - switching then is how work gets lost or
// committed to the wrong branch. "Create new…" branches from the default
// branch's head.
export default function BranchPicker({branches, branch, disabled, onSelect, onCreate}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setCreating(false);
      setName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <form className="branch-picker" onSubmit={create}>
        <input aria-label="New branch name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" disabled={busy || !name.trim()}>Create</button>
        <button type="button" onClick={() => setCreating(false)}>Cancel</button>
        {error && <span className="branch-error">{error}</span>}
      </form>
    );
  }

  return (
    <label className="branch-picker" title={disabled ? "Save or discard your changes before switching branches" : undefined}>
      Branch
      <select
        aria-label="Branch"
        value={branch}
        disabled={disabled}
        onChange={(e) => (e.target.value === CREATE ? setCreating(true) : onSelect(e.target.value))}
      >
        {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        <option value={CREATE}>Create new…</option>
      </select>
    </label>
  );
}
