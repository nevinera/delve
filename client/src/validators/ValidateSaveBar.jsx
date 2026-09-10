// Shared Validate/Save controls for the ability and class editors - see
// useValidateThenSave.js for the state this renders. Save stays disabled
// until validity is "valid" (a Validate click that passed since the last
// edit); a failed Save doesn't itself require revalidating.
export default function ValidateSaveBar({validity, activity, onValidate, onSave}) {
  const validating = activity.status === "validating";
  const saving = activity.status === "saving";

  return (
    <div className="save-bar">
      <button type="button" className="validate-button" onClick={onValidate} disabled={validating || saving}>
        {validating ? "Validating…" : "Validate"}
      </button>
      <button type="button" className="save-button" onClick={onSave} disabled={validity !== "valid" || saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      {(activity.status === "invalid" || activity.status === "save_error") && (
        <span className="save-message save-error">{activity.message}</span>
      )}
      {activity.status === "success" && <span className="save-message save-success">Saved.</span>}
    </div>
  );
}
