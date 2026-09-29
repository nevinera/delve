import {useState} from "react";

// Shared Validate/Save controls for the ability and class editors - see
// useValidateThenSave.js for the state this renders. Save stays disabled
// until validity is "valid" (a Validate click that passed since the last
// edit); a failed Save doesn't itself require revalidating. When a
// defaultMessage is given, clicking Save first asks for a commit message
// (prefilled with it) and passes the result to onSave; without one, Save
// calls onSave() straight away.
export default function ValidateSaveBar({validity, activity, onValidate, onSave, defaultMessage}) {
  const validating = activity.status === "validating";
  const saving = activity.status === "saving";
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");

  function handleSaveClick() {
    if (defaultMessage === undefined) {
      onSave();
      return;
    }
    setMessage(defaultMessage);
    setAsking(true);
  }

  function handleCommit(event) {
    event.preventDefault();
    setAsking(false);
    onSave(message.trim() || defaultMessage);
  }

  return (
    <div className="save-bar">
      <button type="button" className="validate-button" onClick={onValidate} disabled={validating || saving}>
        {validating ? "Validating…" : "Validate"}
      </button>
      <button type="button" className="save-button" onClick={handleSaveClick} disabled={validity !== "valid" || saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {asking && (
        <form className="commit-prompt" onSubmit={handleCommit}>
          <input
            type="text"
            className="commit-message-input"
            aria-label="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            autoFocus
          />
          <button type="submit" className="commit-button">Commit</button>
          <button type="button" className="commit-cancel-button" onClick={() => setAsking(false)}>Cancel</button>
        </form>
      )}
      {(activity.status === "invalid" || activity.status === "save_error") && (
        <span className="save-message save-error">{activity.message}</span>
      )}
      {activity.status === "success" && <span className="save-message save-success">Saved.</span>}
    </div>
  );
}
