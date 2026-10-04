import {entryHeading, humanize} from "../abilityEditor/abilityFormatting";
import {MAX_RESOURCES, MAX_STAT_PRIORITIES, PRIMARY_STATS, SECONDARY_STATS, STAT_PRIORITY_NAMES, WIELD_TYPES} from "./classFieldOptions";

const RESOURCE_FIELDS = [
  {key: "name", type: "text"},
  {key: "color", type: "text"},
  {key: "max", type: "number"},
  {key: "defaultValue", type: "number"},
  {key: "returnRate", type: "number"},
  {key: "isFluid", type: "checkbox"},
  {key: "hasteAffected", type: "checkbox"},
  {key: "recoveryAffected", type: "checkbox"},
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

// One named gearing: five ranked picks (highest priority first) from the
// seven secondary stats - duplicates aren't blocked here (this editor does
// no validation before saving, same as the ability editor), just left for
// the class's eventual release-time validation to catch.
function StatPriorityEntry({priority, index, draft, onChange}) {
  const ranks = Array.from({length: 5}, (_, i) => priority.secondaryStats?.[i] ?? "");
  return (
    <div className="entry-block">
      <label>
        Name{" "}
        <select value={priority.name ?? ""} onChange={(e) => onChange(draft.setStatPriorityName(index, e.target.value))}>
          {STAT_PRIORITY_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      {index === 0 && <span> (used for Trainee Gear)</span>}
      <table>
        <tbody>
          {ranks.map((value, i) => (
            <tr key={i}>
              <th>Rank {i + 1}</th>
              <td>
                <select value={value} onChange={(e) => onChange(draft.setStatPriorityRank(index, i, e.target.value))}>
                  <option value="">—</option>
                  {SECONDARY_STATS.map((stat) => <option key={stat} value={stat}>{humanize(stat)}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => onChange(draft.removeStatPriority(index))}>Remove</button>
    </div>
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

// Purely presentational - every domain rule (what a fresh resource starts
// as, the secondary-stat ranking's padding) lives on ClassDraft; this just
// renders draft's current values and calls its mutator methods. Powers and
// passives aren't edited here - each one is its own area in the editor.
export default function ClassFieldsPanel({draft, onChange}) {
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

      <h3>Stat priorities</h3>
      {(classData.statPriorities ?? []).map((priority, index) => (
        <StatPriorityEntry key={index} priority={priority} index={index} draft={draft} onChange={onChange} />
      ))}
      <button
        type="button" className="add-entry"
        disabled={(classData.statPriorities ?? []).length >= MAX_STAT_PRIORITIES}
        onClick={() => onChange(draft.addStatPriority())}
      >
        Add stat priority
      </button>

      <h3>Wields</h3>
      <WieldsFields wields={classData.wields ?? []} draft={draft} onChange={onChange} />

      <h3>Resources</h3>
      {(classData.resources ?? []).map((resource, index) => (
        <ResourceEntry key={index} resource={resource} index={index} draft={draft} onChange={onChange} />
      ))}
      <button
        type="button" className="add-entry"
        disabled={(classData.resources ?? []).length >= MAX_RESOURCES}
        onClick={() => onChange(draft.addResource())}
      >
        + Add resource
      </button>
    </div>
  );
}
