import {entryHeading, humanize} from "../abilityEditor/abilityFormatting";
import {PRIMARY_STATS, SECONDARY_STATS, SLOT_COUNT, WIELD_TYPES} from "./classFieldOptions";

const RESOURCE_FIELDS = [
  {key: "name", type: "text"},
  {key: "color", type: "text"},
  {key: "max", type: "number"},
  {key: "defaultValue", type: "number"},
  {key: "returnRate", type: "number"},
  {key: "isFluid", type: "checkbox"},
  {key: "hasteAffected", type: "checkbox"},
];

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

function ResourceEntry({resource, index, draft, onChange}) {
  return (
    <div className="entry-block">
      <div className="entry-heading-row">
        <h3>{entryHeading("resources", index, resource)}</h3>
        <button type="button" className="remove-entry" onClick={() => onChange(draft.removeResource(index))}>
          Remove
        </button>
      </div>
      <table>
        <tbody>
          <tr>
            <th>Primary</th>
            <td>
              <input
                type="radio" name="primary-resource" checked={resource.displayType === "primary"}
                onChange={() => onChange(draft.setPrimaryResource(index))}
              />
            </td>
          </tr>
          {RESOURCE_FIELDS.map(({key, type}) => (
            <tr key={key}>
              <th>{humanize(key)}</th>
              <td>
                {type === "checkbox"
                  ? (
                    <input
                      type="checkbox" checked={Boolean(resource[key])}
                      onChange={(e) => onChange(draft.updateResourceField(index, key, e.target.checked))}
                    />
                  )
                  : type === "number"
                    ? <NumberField value={resource[key]} onChange={(value) => onChange(draft.updateResourceField(index, key, value))} />
                    : <TextField value={resource[key]} onChange={(value) => onChange(draft.updateResourceField(index, key, value))} />}
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
function SecondaryStatsRanking({stats, draft, onChange}) {
  const ranks = Array.from({length: 5}, (_, i) => stats[i] ?? "");
  return (
    <table>
      <tbody>
        {ranks.map((value, i) => (
          <tr key={i}>
            <th>Rank {i + 1}</th>
            <td>
              <select value={value} onChange={(e) => onChange(draft.setSecondaryStatRank(i, e.target.value))}>
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

function WieldsFields({wields, draft, onChange}) {
  const [main, off] = [wields[0] ?? "", wields[1] ?? ""];

  return (
    <table>
      <tbody>
        <tr>
          <th>Main hand</th>
          <td>
            <select value={main} onChange={(e) => onChange(draft.setWields(e.target.value, off))}>
              <option value="">—</option>
              {WIELD_TYPES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
            </select>
          </td>
        </tr>
        <tr>
          <th>Off hand</th>
          <td>
            <select value={off} onChange={(e) => onChange(draft.setWields(main, e.target.value))}>
              <option value="">—</option>
              {WIELD_TYPES.map((w) => <option key={w} value={w}>{humanize(w)}</option>)}
            </select>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// Slot i is only pickable once slot i-1 is filled (see ClassDraft#setPowerSlot -
// clearing a middle slot reflows the ones after it, rather than leaving a
// gap the saved `powers` array has no way to represent).
function PowerSlots({powers, availableAbilities, draft, onChange}) {
  const abilityKeys = Object.keys(availableAbilities).sort();

  return (
    <table>
      <tbody>
        {Array.from({length: SLOT_COUNT}, (_, i) => {
          const filled = i < powers.length;
          const disabled = i > powers.length;
          const selectedKey = draft.abilityKeyForPowerSlot(i);
          return (
            <tr key={i}>
              <th>Slot {i + 1}</th>
              <td>
                <select
                  value={selectedKey ?? ""}
                  disabled={disabled}
                  onChange={(e) => onChange(draft.setPowerSlot(i, e.target.value))}
                >
                  <option value="">{disabled ? "(fill earlier slots first)" : "— empty —"}</option>
                  {abilityKeys.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
                {filled && (
                  <button type="button" className="remove-entry" onClick={() => onChange(draft.clearPowerSlot(i))}>
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

// Purely presentational - every domain rule (what a fresh resource starts
// as, the power-slot fill-in-order/ref math, the secondary-stat ranking's
// padding) lives on ClassDraft now; this just renders draft's current
// values and calls its mutator methods.
export default function ClassFieldsPanel({draft, availableAbilities, newAbilityUrl, onChange}) {
  const classData = draft.data;
  return (
    <div className="fields-panel">
      <table>
        <tbody>
          <tr>
            <th>Name</th>
            <td><TextField value={classData.name} onChange={(value) => onChange(draft.setField("name", value))} /></td>
          </tr>
          <tr>
            <th>Description</th>
            <td><TextField value={classData.description} onChange={(value) => onChange(draft.setField("description", value))} /></td>
          </tr>
          <tr>
            <th>Major color</th>
            <td>
              <TextField
                value={classData.colors?.major}
                onChange={(value) => onChange(draft.setColor("major", value))}
              />
            </td>
          </tr>
          <tr>
            <th>Minor color</th>
            <td>
              <TextField
                value={classData.colors?.minor}
                onChange={(value) => onChange(draft.setColor("minor", value))}
              />
            </td>
          </tr>
          <tr>
            <th>Primary stats</th>
            <td>
              <StatCheckboxList
                stats={classData.primaryStats ?? []}
                options={PRIMARY_STATS}
                onToggle={(stat) => onChange(draft.togglePrimaryStat(stat))}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <h3>Secondary stats (ranked)</h3>
      <SecondaryStatsRanking stats={classData.secondaryStats ?? []} draft={draft} onChange={onChange} />

      <h3>Wields</h3>
      <WieldsFields wields={classData.wields ?? []} draft={draft} onChange={onChange} />

      <div className="add-buttons-row">
        <button type="button" className="add-entry" onClick={() => onChange(draft.addResource())}>
          + Add Resource
        </button>
      </div>
      {(classData.resources ?? []).map((resource, index) => (
        <ResourceEntry key={index} resource={resource} index={index} draft={draft} onChange={onChange} />
      ))}

      <h3>Powers</h3>
      <p className="new-ability-link">
        <a href={newAbilityUrl} target="_blank" rel="noreferrer">+ New ability</a>
      </p>
      <PowerSlots
        powers={classData.powers ?? []}
        availableAbilities={availableAbilities}
        draft={draft}
        onChange={onChange}
      />
    </div>
  );
}
