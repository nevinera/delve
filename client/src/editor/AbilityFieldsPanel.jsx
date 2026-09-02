import {useState} from "react";
import {entrySummary, formatValue, humanize, listFields} from "./abilityFormatting";

// The recognized top-level scalar fields (see Content::Ability / PowerValidator),
// shown regardless of whether the loaded ability happens to have them set, so a
// field can be added to an ability that never had it (e.g. giving a melee
// ability a cooldown). "name" is intentionally left out of edit mode for now.
const TOP_LEVEL_FIELDS = [
  {key: "name", type: "text", editable: false},
  {key: "iconURL", type: "text", editable: true, upload: true},
  {key: "castTime", type: "number", editable: true},
  {key: "globalCooldown", type: "number", editable: true},
  {key: "cooldown", type: "number", editable: true},
  {key: "maxRange", type: "number", editable: true},
  {key: "speed", type: "number", editable: true},
];

function EntryFieldsTable({entry}) {
  return (
    <table>
      <tbody>
        {Object.entries(entry).map(([key, value]) => (
          <tr key={key}>
            <th>{humanize(key)}</th>
            <td>{formatValue(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EditableField({field, type, value, dispatch}) {
  return (
    <input
      type={type}
      step={type === "number" ? "any" : undefined}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = raw === "" ? null : (type === "number" ? parseFloat(raw) : raw);
        dispatch({type: "SET_FIELD", field, value: parsed});
      }}
    />
  );
}

// Uploading a file doesn't change the field's own text value - it only
// swaps what the preview renders (see resolveAbilityForPlayback). Saving a
// real upload back to the content repo isn't built yet. The file input is
// remounted (via `resetKey`) on clear, since its displayed filename can't
// be reset programmatically any other way.
function AssetUploadField({field, hasOverride, onUploadAsset, onClearAsset}) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="asset-upload">
      <input
        key={resetKey}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) onUploadAsset(field, file);
        }}
      />
      {hasOverride && (
        <button
          type="button"
          onClick={() => {
            onClearAsset(field);
            setResetKey((k) => k + 1);
          }}
        >
          Restore
        </button>
      )}
    </div>
  );
}

export default function AbilityFieldsPanel({ability, dispatch, assetOverrides, onUploadAsset, onClearAsset}) {
  return (
    <div className="fields-panel">
      <table>
        <tbody>
          {TOP_LEVEL_FIELDS.map(({key, type, editable, upload}) => (
            <tr key={key}>
              <th>{humanize(key)}</th>
              <td>
                {editable
                  ? <EditableField field={key} type={type} value={ability[key]} dispatch={dispatch} />
                  : formatValue(ability[key])}
                {upload && (
                  <AssetUploadField
                    field={key}
                    hasOverride={Boolean(assetOverrides[key])}
                    onUploadAsset={onUploadAsset}
                    onClearAsset={onClearAsset}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {listFields(ability).map(([key, entries]) => (
        <details key={key}>
          <summary>{humanize(key)} ({entries.length})</summary>
          {entries.map((entry, index) => (
            <details key={index}>
              <summary>{entrySummary(entry, index)}</summary>
              <EntryFieldsTable entry={entry} />
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
