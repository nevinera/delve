import {useState} from "react";

// Save, then Validate, Expand, Publish (see plans/world-editor/README.md,
// "Pipeline"). Save never requires validity; the other three are wired up
// in later steps (1f-1h).
export default function Pipeline({canSave, defaultMessage, onSave, status}) {
  const [prompting, setPrompting] = useState(false);
  const [message, setMessage] = useState("");

  function submit(e) {
    e.preventDefault();
    setPrompting(false);
    onSave(message.trim() || defaultMessage);
    setMessage("");
  }

  return (
    <>
      <div className="pipeline">
        {prompting ? (
          <form className="save-prompt" onSubmit={submit}>
            <input aria-label="Commit message" placeholder={defaultMessage} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
            <button type="submit" className="save-button">Commit</button>
            <button type="button" onClick={() => setPrompting(false)}>Cancel</button>
          </form>
        ) : (
          <button type="button" className="save-button" disabled={!canSave} onClick={() => setPrompting(true)}>Save</button>
        )}
        <button type="button" disabled title="Coming soon">Validate</button>
        <button type="button" disabled title="Coming soon">Expand</button>
        <button type="button" disabled title="Coming soon">Publish</button>
      </div>
      {status && <div className={`pipeline-status${status.error ? " error" : ""}`} role="status">{status.text}</div>}
    </>
  );
}
