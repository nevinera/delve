import {useState} from "react";
import {entrySummary, formatValue, humanize, listFields} from "./abilityFormatting";
import {entryFieldsFor, selectOptions, widgetFor} from "./entryFieldSchema";
import {assetOverrideKey} from "./resolveAbilityForPlayback";

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
function AssetUploadField({field, accept = "image/*", hasOverride, onUploadAsset, onClearAsset}) {
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="asset-upload">
      <input
        key={resetKey}
        type="file"
        accept={accept}
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

function SelectField({field, value, onChange}) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
      {selectOptions(field).map((option) => (
        <option key={option || "(none)"} value={option}>{option === "" ? "—" : option}</option>
      ))}
    </select>
  );
}

// amount/range may be a single number or a [min, max] pair - edited as two
// number inputs, collapsing back to a scalar when they're equal (same
// approach as Content::FloatOrRange server-side).
function RangeField({value, onChange}) {
  const min = Array.isArray(value) ? value[0] : value;
  const max = Array.isArray(value) ? value[1] : value;

  function update(newMin, newMax) {
    if (newMin == null || newMax == null) {
      onChange(newMin ?? newMax ?? null);
      return;
    }
    onChange(newMin === newMax ? newMin : [newMin, newMax]);
  }

  return (
    <span className="range-field">
      <input
        type="number" step="any" value={min ?? ""}
        onChange={(e) => update(e.target.value === "" ? null : parseFloat(e.target.value), max)}
      />
      <span className="range-sep">–</span>
      <input
        type="number" step="any" value={max ?? ""}
        onChange={(e) => update(min, e.target.value === "" ? null : parseFloat(e.target.value))}
      />
    </span>
  );
}

function TagsField({value, onChange}) {
  return (
    <input
      type="text"
      value={(value ?? []).join(", ")}
      onChange={(e) => onChange(e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean))}
    />
  );
}

function EntryField({field, value, onChange}) {
  switch (widgetFor(field)) {
    case "select":
      return <SelectField field={field} value={value} onChange={onChange} />;
    case "range":
      return <RangeField value={value} onChange={onChange} />;
    case "tags":
      return <TagsField value={value} onChange={onChange} />;
    case "number":
      return (
        <input
          type="number" step="any" value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
        />
      );
    case "readonly":
      return formatValue(value);
    default:
      return (
        <input
          type="text" value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        />
      );
  }
}

function EntryFieldsTable({section, index, entry, dispatch, assetOverrides, onUploadAsset, onClearAsset}) {
  return (
    <table>
      <tbody>
        {entryFieldsFor(section, entry).map((field) => {
          const value = entry[field];
          const uploadKey = field === "sourceURL" ? assetOverrideKey(section, index, field) : null;
          return (
            <tr key={field}>
              <th>{humanize(field)}</th>
              <td>
                <EntryField
                  field={field}
                  value={value}
                  onChange={(newValue) => dispatch({type: "UPDATE_ENTRY_FIELD", section, index, field, value: newValue})}
                />
                {uploadKey && (
                  <AssetUploadField
                    field={uploadKey}
                    accept={section === "soundEffects" ? "audio/*" : "image/*"}
                    hasOverride={Boolean(assetOverrides[uploadKey])}
                    onUploadAsset={onUploadAsset}
                    onClearAsset={onClearAsset}
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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

      {listFields(ability).map(([section, entries]) => (
        <details key={section}>
          <summary>{humanize(section)} ({entries.length})</summary>
          {entries.map((entry, index) => (
            <details key={index}>
              <summary>{entrySummary(entry, index)}</summary>
              <EntryFieldsTable
                section={section}
                index={index}
                entry={entry}
                dispatch={dispatch}
                assetOverrides={assetOverrides}
                onUploadAsset={onUploadAsset}
                onClearAsset={onClearAsset}
              />
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
