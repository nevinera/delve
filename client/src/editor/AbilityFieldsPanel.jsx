import {useEffect, useRef, useState} from "react";
import {entryHeading, entryTypeLabel, formatValue, humanize} from "./abilityFormatting";
import {entryFieldsFor, placeholderEntry, selectOptions, widgetFor} from "./entryFieldSchema";
import {assetOverrideKey} from "./resolveAbilityForPlayback";
import {graphicFieldsFor, soundFieldsFor} from "./stockAssetFields";
import StatusEditor from "./StatusEditor";

// Order entries are added/listed in - graphic, then sound, then effect.
const EFFECT_SECTIONS = ["graphicEffects", "soundEffects", "effects"];

// The recognized top-level scalar fields (see Content::Ability / PowerValidator),
// shown regardless of whether the loaded ability happens to have them set, so a
// field can be added to an ability that never had it (e.g. giving a melee
// ability a cooldown).
const TOP_LEVEL_FIELDS = [
  {key: "name", type: "text", editable: true},
  {key: "description", type: "text", editable: true},
  {key: "iconURL", type: "text", editable: true, upload: true},
  {key: "castTime", type: "number", editable: true},
  {key: "globalCooldown", type: "number", editable: true},
  {key: "cooldown", type: "number", editable: true},
  {key: "maxRange", type: "number", editable: true},
  {key: "speed", type: "number", editable: true},
  {key: "tags", type: "tags", editable: true},
];

function EditableField({field, type, value, dispatch}) {
  if (type === "tags") {
    return <TagsField value={value} onChange={(newValue) => dispatch({type: "SET_FIELD", field, value: newValue})} />;
  }

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

// Lists the recognized `:name:` stock assets for one kind (icons/graphics/
// sounds - see Content::StockAssets). Always resets to the placeholder after
// a pick, since the picked value lives in sourceURL/iconURL itself, not in
// this dropdown's own selection.
export function StockAssetPicker({options, onPick}) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
        e.target.value = "";
      }}
    >
      <option value="">— stock asset —</option>
      {Object.keys(options)
        .sort()
        .map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
    </select>
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

// Displays the raw text being typed rather than value.join(", ") - if it
// re-derived from the parsed array on every keystroke, a trailing comma or
// space (typed to start the next tag) would immediately be stripped back
// out, making it look like commas/spaces do nothing. `value` is only a
// ref-equal echo of what this field itself last emitted (see
// abilityReducer's SET_FIELD/UPDATE_ENTRY_FIELD, which assign it verbatim),
// so lastValueRef lets us tell "value changed under us" (e.g. switching to
// a different entry) from "value changed because we changed it".
function TagsField({value, onChange}) {
  const [text, setText] = useState((value ?? []).join(", "));
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value !== lastValueRef.current) {
      lastValueRef.current = value;
      setText((value ?? []).join(", "));
    }
  }, [value]);

  function handleChange(e) {
    const raw = e.target.value;
    setText(raw);
    const parsed = raw.split(",").map((tag) => tag.trim()).filter(Boolean);
    lastValueRef.current = parsed;
    onChange(parsed);
  }

  return <input type="text" value={text} onChange={handleChange} />;
}

function EntryField({field, value, onChange, stockAssets}) {
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
    case "status":
      return <StatusEditor value={value} onChange={onChange} stockAssets={stockAssets} />;
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

function EntryFieldsTable({section, index, entry, dispatch, assetOverrides, onUploadAsset, onClearAsset, stockAssets}) {
  const stockOptions = section === "soundEffects" ? stockAssets.sounds : stockAssets.graphics;

  function pickStockAsset(name) {
    const fields = section === "soundEffects"
      ? soundFieldsFor(name, stockOptions[name])
      : graphicFieldsFor(name, stockOptions[name]);
    dispatch({type: "UPDATE_ENTRY_FIELDS", section, index, fields});
  }

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
                  stockAssets={stockAssets}
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
                {field === "sourceURL" && <StockAssetPicker options={stockOptions} onPick={pickStockAsset} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AddButtonsRow({onAdd}) {
  return (
    <div className="add-buttons-row">
      {EFFECT_SECTIONS.map((section) => (
        <button key={section} type="button" className="add-entry" onClick={() => onAdd(section)}>
          + Add {entryTypeLabel(section)}
        </button>
      ))}
    </div>
  );
}

const HIGHLIGHT_MS = 1500;

const EMPTY_STOCK_ASSETS = {icons: {}, graphics: {}, sounds: {}};

export default function AbilityFieldsPanel({ability, dispatch, assetOverrides, onUploadAsset, onClearAsset, onRemoveEntry, stockAssets = EMPTY_STOCK_ASSETS}) {
  // Scrolls the fields panel to a newly-added entry, and briefly highlights
  // it, since it's appended at the end of a (possibly long) list and might
  // otherwise be easy to miss.
  const [justAddedKey, setJustAddedKey] = useState(null);
  const [highlightedKey, setHighlightedKey] = useState(null);
  const newestEntryRef = useRef(null);

  useEffect(() => {
    if (justAddedKey && newestEntryRef.current) {
      newestEntryRef.current.scrollIntoView({behavior: "smooth", block: "start"});
      setJustAddedKey(null);
    }
  }, [justAddedKey]);

  function handleAdd(section) {
    const index = (ability[section] ?? []).length;
    dispatch({type: "ADD_ENTRY", section, entry: placeholderEntry(section)});
    const key = `${section}-${index}`;
    setJustAddedKey(key);
    setHighlightedKey(key);
    setTimeout(() => setHighlightedKey((current) => (current === key ? null : current)), HIGHLIGHT_MS);
  }

  return (
    <div className="fields-panel">
      <AddButtonsRow onAdd={handleAdd} />

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
                {key === "iconURL" && (
                  <StockAssetPicker
                    options={stockAssets.icons}
                    onPick={(name) => dispatch({type: "SET_FIELD", field: "iconURL", value: `:${name}:`})}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {EFFECT_SECTIONS.flatMap((section) =>
        (ability[section] ?? []).map((entry, index) => {
          const key = `${section}-${index}`;
          const className = `entry-block${key === highlightedKey ? " entry-block-highlight" : ""}`;
          return (
            <div className={className} key={key} ref={key === justAddedKey ? newestEntryRef : null}>
              <div className="entry-heading-row">
                <h3>{entryHeading(section, index, entry)}</h3>
                <button type="button" className="remove-entry" onClick={() => onRemoveEntry(section, index)}>
                  Remove
                </button>
              </div>
              <EntryFieldsTable
                section={section}
                index={index}
                entry={entry}
                dispatch={dispatch}
                assetOverrides={assetOverrides}
                onUploadAsset={onUploadAsset}
                onClearAsset={onClearAsset}
                stockAssets={stockAssets}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
