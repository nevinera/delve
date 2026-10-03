import {useState} from "react";

// Save, then Validate, Expand, Publish (see plans/world-editor/README.md,
// "Pipeline"). Save never requires validity. Each later step needs the one
// before it to have passed on exactly the current content; `blockers`
// says why a step is unavailable ({expand, publish}: reason or null).
export default function Pipeline({canSave, defaultMessage, onSave, validating, onValidate, blockers, onExpand, defaultTag, onPublish, busy, status}) {
  const [prompt, setPrompt] = useState(null); // "save" | "publish"
  const [text, setText] = useState("");

  function open(kind) {
    setPrompt(kind);
    setText(kind === "publish" ? defaultTag ?? "" : "");
  }

  function submit(e) {
    e.preventDefault();
    const kind = prompt;
    setPrompt(null);
    if (kind === "save") onSave(text.trim() || defaultMessage);
    else onPublish(text.trim());
  }

  return (
    <>
      <div className="pipeline">
        {prompt ? (
          <form className="save-prompt" onSubmit={submit}>
            {prompt === "save"
              ? <input aria-label="Commit message" placeholder={defaultMessage} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              : <input aria-label="Release tag" value={text} onChange={(e) => setText(e.target.value)} autoFocus />}
            <button type="submit" className="save-button" disabled={prompt === "publish" && !text.trim()}>{prompt === "save" ? "Commit" : "Publish"}</button>
            <button type="button" onClick={() => setPrompt(null)}>Cancel</button>
          </form>
        ) : (
          <>
            <button type="button" className="save-button" disabled={!canSave || busy} onClick={() => open("save")}>Save</button>
            <button type="button" disabled={validating || busy} onClick={onValidate}>{validating ? "Validating…" : "Validate"}</button>
            <button type="button" disabled={Boolean(blockers.expand) || busy} title={blockers.expand ?? undefined} onClick={onExpand}>Expand</button>
            <button type="button" disabled={Boolean(blockers.publish) || busy || !onPublish} title={blockers.publish ?? undefined} onClick={() => open("publish")}>Publish</button>
          </>
        )}
      </div>
      {status && <div className={`pipeline-status${status.error ? " error" : ""}`} role="status">{status.text}</div>}
    </>
  );
}

// The last Validate's problems, each a link to where in the editor to
// look. Shown only while they still describe the current draft.
export function ValidationProblems({problems, onSelect}) {
  if (!problems?.length) return null;
  return (
    <details className="validation-problems" open>
      <summary>{problems.length} validation problem{problems.length === 1 ? "" : "s"}</summary>
      <ul>
        {problems.map((problem, i) => (
          <li key={i}>
            <button type="button" className="crumb-link" onClick={() => onSelect(problem.location)}>{problem.file}</button>: {problem.message}
          </li>
        ))}
      </ul>
    </details>
  );
}
