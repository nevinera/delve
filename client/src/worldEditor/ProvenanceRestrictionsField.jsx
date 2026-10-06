// Edits a {worlds, maxElevation} provenance restrictions object (see
// docs/schema/common.md#provenancerestrictions), shared by World and Zone.
// A blank field omits its key, and blanking both omits the whole object
// (value null). `worldsDefault` says what a blank worlds list means here.
export function parseWorldKeys(text) {
  const keys = text.split(",").map((key) => key.trim()).filter(Boolean);
  return keys.length > 0 ? keys : null;
}

export function withRestriction(value, field, fieldValue) {
  const next = {...(value ?? {})};
  if (fieldValue === null || fieldValue === undefined) {
    delete next[field];
  } else {
    next[field] = fieldValue;
  }
  return Object.keys(next).length === 0 ? null : next;
}

export default function ProvenanceRestrictionsField({value, onChange, worldsDefault, idPrefix = "provenance"}) {
  const worlds = value?.worlds ?? [];
  return (
    <div className="provenance-restrictions-field">
      <label htmlFor={`${idPrefix}-worlds`}>Other worlds allowed (keys, comma-separated)</label>
      <input
        id={`${idPrefix}-worlds`}
        type="text"
        defaultValue={worlds.join(", ")}
        key={worlds.join(",")}
        placeholder={worldsDefault}
        onBlur={(e) => onChange(withRestriction(value, "worlds", parseWorldKeys(e.target.value)))}
      />
      <label htmlFor={`${idPrefix}-max-elevation`}>Max item elevation</label>
      <input
        id={`${idPrefix}-max-elevation`}
        type="number" step="1" min="0"
        value={value?.maxElevation ?? ""}
        placeholder="any"
        onChange={(e) => onChange(withRestriction(value, "maxElevation", e.target.value === "" ? null : parseInt(e.target.value, 10)))}
      />
    </div>
  );
}
