import {entryHeading, humanize} from "../editor/abilityFormatting";
import {PRIMARY_STATS, SECONDARY_STATS, SLOT_COUNT, WIELD_TYPES} from "./classFieldOptions";
import {abilityKeyForRef, refForAbilityKey} from "./powerRefs";

const RESOURCE_FIELDS = [
  {key: "name", type: "text"},
  {key: "color", type: "text"},
  {key: "max", type: "number"},
  {key: "defaultValue", type: "number"},
  {key: "returnRate", type: "number"},
  {key: "isFluid", type: "checkbox"},
];

const BLANK_RESOURCE = {name: "", color: "888888", max: 100, defaultValue: 0, returnRate: 0, isFluid: false};

function TextField({value, onChange}) {
  return <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} />;
}

function NumberField({value, onChange}) {
  return (
    <input
      type="number" step="any" value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
    />
  );
}

function ResourceEntry({resource, index, dispatch}) {
  return (
    <div className="entry-block">
      <div className="entry-heading-row">
        <h3>{entryHeading("resources", index, resource)}</h3>
        <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_ENTRY", section: "resources", index})}>
          Remove
        </button>
      </div>
      <table>
        <tbody>
          {RESOURCE_FIELDS.map(({key, type}) => (
            <tr key={key}>
              <th>{humanize(key)}</th>
              <td>
                {type === "checkbox"
                  ? (
                    <input
                      type="checkbox" checked={Boolean(resource[key])}
                      onChange={(e) => dispatch({type: "UPDATE_ENTRY_FIELD", section: "resources", index, field: key, value: e.target.checked})}
                    />
                  )
                  : type === "number"
                    ? <NumberField value={resource[key]} onChange={(value) => dispatch({type: "UPDATE_ENTRY_FIELD", section: "resources", index, field: key, value})} />
                    : <TextField value={resource[key]} onChange={(value) => dispatch({type: "UPDATE_ENTRY_FIELD", section: "resources", index, field: key, value})} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCheckboxList({stats, options, onToggle}) {
  return (
    <div className="checkbox-list">
      {options.map((option) => (
        <label key={option}>
          <input type="checkbox" checked={stats.includes(option)} onChange={() => onToggle(option)} />
          {humanize(option)}
        </label>
      ))}
    </div>
  );
}

// Five ranked picks (highest priority first) from the seven secondary
// stats - duplicates aren't blocked here (this editor does no validation
// before saving, same as the ability editor), just left for the class's
// eventual release-time validation to catch.
function SecondaryStatsRanking({stats, dispatch}) {
  const ranks = Array.from({length: 5}, (_, i) => stats[i] ?? "");
  return (
    <table>
      <tbody>
        {ranks.map((value, i) => (
          <tr key={i}>
            <th>Rank {i + 1}</th>
            <td>
              <select
                value={value}
                onChange={(e) => {
                  const next = [...ranks];
                  next[i] = e.target.value;
                  dispatch({type: "SET_FIELD", field: "secondaryStats", value: next});
                }}
              >
                <option value="">—</option>
                {SECONDARY_STATS.map((stat) => <option key={stat} value={stat}>{humanize(stat)}</option>)}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WieldsFields({wields, dispatch}) {
  const [main, off] = [wields[0] ?? "", wields[1] ?? ""];

  function update(newMain, newOff) {
    dispatch({type: "SET_FIELD", field: "wields", value: [newMain, newOff].filter(Boolean)});
  }

  return (
    <table>
      <tbody>
        <tr>
          <th>Main hand</th>
          <td>
            <select value={main} onChange={(e) => update(e.target.value, off)}>
              <option value="">—</option>
              {WIELD_TYPES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
            </select>
          </td>
        </tr>
        <tr>
          <th>Off hand</th>
          <td>
            <select value={off} onChange={(e) => update(main, e.target.value)}>
              <option value="">—</option>
              {WIELD_TYPES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Slot i is only pickable once slot i-1 is filled (see powerRefs.js -
// clearing a middle slot reflows the ones after it, rather than leaving a
// gap the saved `powers` array has no way to represent).
function PowerSlots({classKey, powers, availableAbilities, dispatch}) {
  const abilityKeys = Object.keys(availableAbilities).sort();

  function setSlot(index, abilityKey) {
    const entry = {$ref: refForAbilityKey(classKey, abilityKey), referenceTo: "ability"};
    if (index < powers.length) {
      dispatch({type: "UPDATE_ENTRY_FIELDS", section: "powers", index, fields: entry});
    } else {
      dispatch({type: "ADD_ENTRY", section: "powers", entry});
    }
  }

  return (
    <table>
      <tbody>
        {Array.from({length: SLOT_COUNT}, (_, i) => {
          const filled = i < powers.length;
          const disabled = i > powers.length;
          const selectedKey = filled ? abilityKeyForRef(classKey, powers[i]) : "";
          return (
            <tr key={i}>
              <th>Slot {i + 1}</th>
              <td>
                <select
                  value={selectedKey ?? ""}
                  disabled={disabled}
                  onChange={(e) => setSlot(i, e.target.value)}
                >
                  <option value="">{disabled ? "(fill earlier slots first)" : "— empty —"}</option>
                  {abilityKeys.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
                {filled && (
                  <button type="button" className="remove-entry" onClick={() => dispatch({type: "REMOVE_ENTRY", section: "powers", index: i})}>
                    Clear
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ClassFieldsPanel({classKey, classData, availableAbilities, newAbilityUrl, dispatch}) {
  return (
    <div className="fields-panel">
      <table>
        <tbody>
          <tr>
            <th>Name</th>
            <td><TextField value={classData.name} onChange={(value) => dispatch({type: "SET_FIELD", field: "name", value})} /></td>
          </tr>
          <tr>
            <th>Description</th>
            <td><TextField value={classData.description} onChange={(value) => dispatch({type: "SET_FIELD", field: "description", value})} /></td>
          </tr>
          <tr>
            <th>Major color</th>
            <td>
              <TextField
                value={classData.colors?.major}
                onChange={(value) => dispatch({type: "SET_FIELD", field: "colors", value: {...classData.colors, major: value}})}
              />
            </td>
          </tr>
          <tr>
            <th>Minor color</th>
            <td>
              <TextField
                value={classData.colors?.minor}
                onChange={(value) => dispatch({type: "SET_FIELD", field: "colors", value: {...classData.colors, minor: value}})}
              />
            </td>
          </tr>
          <tr>
            <th>Primary stats</th>
            <td>
              <StatCheckboxList
                stats={classData.primaryStats ?? []}
                options={PRIMARY_STATS}
                onToggle={(stat) => {
                  const current = classData.primaryStats ?? [];
                  const next = current.includes(stat) ? current.filter((s) => s !== stat) : [...current, stat];
                  dispatch({type: "SET_FIELD", field: "primaryStats", value: next});
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Secondary stats (ranked)</h3>
      <SecondaryStatsRanking stats={classData.secondaryStats ?? []} dispatch={dispatch} />

      <h3>Wields</h3>
      <WieldsFields wields={classData.wields ?? []} dispatch={dispatch} />

      <div className="add-buttons-row">
        <button type="button" className="add-entry" onClick={() => dispatch({type: "ADD_ENTRY", section: "resources", entry: BLANK_RESOURCE})}>
          + Add Resource
        </button>
      </div>
      {(classData.resources ?? []).map((resource, index) => (
        <ResourceEntry key={index} resource={resource} index={index} dispatch={dispatch} />
      ))}

      <h3>Powers</h3>
      <p className="new-ability-link">
        <a href={newAbilityUrl} target="_blank" rel="noreferrer">+ New ability</a>
      </p>
      <PowerSlots
        classKey={classKey}
        powers={classData.powers ?? []}
        availableAbilities={availableAbilities}
        dispatch={dispatch}
      />
    </div>
  );
}
