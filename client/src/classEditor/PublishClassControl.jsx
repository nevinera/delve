import {useState} from "react";

// The class editor's Publish button: asks for a version (prefilled with the
// next one), then hands it to onPublish. `blocker` says why it can't
// publish right now (e.g. unsaved changes), or is null.
export default function PublishClassControl({nextVersion, blocker, onPublish}) {
  const [asking, setAsking] = useState(false);
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState(null); // {kind: "busy" | "done" | "error", message}

  function open() {
    setVersion(nextVersion ?? "");
    setStatus(null);
    setAsking(true);
  }

  async function submit(event) {
    event.preventDefault();
    setAsking(false);
    setStatus({kind: "busy", message: "Publishing…"});
    try {
      const published = await onPublish(version.trim());
      setStatus({kind: "done", message: `Published ${published.identifier} ${published.version}.`});
    } catch (error) {
      setStatus({kind: "error", message: error.message});
    }
  }

  return (
    <div className="publish-bar">
      <button type="button" className="publish-button" disabled={Boolean(blocker) || status?.kind === "busy"} title={blocker ?? undefined} onClick={open}>
        Publish
      </button>
      {asking && (
        <form className="commit-prompt" onSubmit={submit}>
          <input type="text" aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value)} autoFocus />
          <button type="submit" disabled={!version.trim()}>Publish</button>
          <button type="button" onClick={() => setAsking(false)}>Cancel</button>
        </form>
      )}
      {status && <span className={`save-message ${status.kind === "error" ? "save-error" : "save-success"}`}>{status.message}</span>}
    </div>
  );
}
