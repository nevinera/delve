import {useState} from "react";

// Publish tags whatever is saved on the repo's default branch, not the
// editor's draft - so it's disabled while there are unsaved edits. Clicking
// it asks for the tag name (prefilled with the next "<key>/v<N>").
export default function PublishBar({unsaved, defaultTag, onPublish}) {
  const [asking, setAsking] = useState(false);
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState({state: "idle"});
  const publishing = status.state === "publishing";

  function handlePublishClick() {
    setTag(defaultTag ?? "");
    setAsking(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setAsking(false);
    setStatus({state: "publishing"});
    try {
      await onPublish(tag.trim());
    } catch (error) {
      setStatus({state: "error", message: error.message});
    }
  }

  return (
    <div className="publish-bar">
      <button
        type="button"
        className="publish-button"
        onClick={handlePublishClick}
        disabled={unsaved || publishing}
        title={unsaved ? "Save your changes before publishing" : undefined}
      >
        {publishing ? "Publishing…" : "Publish"}
      </button>
      {asking && (
        <form className="publish-prompt" onSubmit={handleSubmit}>
          <input type="text" className="publish-tag-input" aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)} autoFocus />
          <button type="submit" className="publish-confirm-button" disabled={tag.trim() === ""}>Tag &amp; publish</button>
          <button type="button" className="publish-cancel-button" onClick={() => setAsking(false)}>Cancel</button>
        </form>
      )}
      {unsaved && <span className="publish-message">Save before publishing.</span>}
      {status.state === "error" && <span className="publish-message publish-error">{status.message}</span>}
    </div>
  );
}
