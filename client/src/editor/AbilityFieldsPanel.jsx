import {entrySummary, formatValue, humanize, listFields} from "./abilityFormatting";

// The recognized top-level scalar fields (see Content::Ability / PowerValidator),
// shown regardless of whether the loaded ability happens to have them set, so a
// field can be added to an ability that never had it (e.g. giving a melee
// ability a cooldown). "name" is intentionally left out of edit mode for now.
const TOP_LEVEL_FIELDS = [
  {key: "name", type: "text", editable: false},
  {key: "iconURL", type: "text", editable: true},
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

export default function AbilityFieldsPanel({ability, dispatch}) {
  return (
    <div className="fields-panel">
      <table>
        <tbody>
          {TOP_LEVEL_FIELDS.map(({key, type, editable}) => (
            <tr key={key}>
              <th>{humanize(key)}</th>
              <td>
                {editable
                  ? <EditableField field={key} type={type} value={ability[key]} dispatch={dispatch} />
                  : formatValue(ability[key])}
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
