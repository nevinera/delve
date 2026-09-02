import {entrySummary, formatValue, humanize, listFields, scalarFields} from "./abilityFormatting";

// Fields with real editing UX wired up so far. Everything else renders
// read-only, same as the show page, until we build the rest.
const EDITABLE_NUMBER_FIELDS = new Set(["speed", "maxRange"]);

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

function EditableNumberField({field, value, dispatch}) {
  return (
    <input
      type="number"
      step="any"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        dispatch({type: "SET_FIELD", field, value: raw === "" ? null : parseFloat(raw)});
      }}
    />
  );
}

export default function AbilityFieldsPanel({ability, dispatch}) {
  return (
    <div className="fields-panel">
      <table>
        <tbody>
          {scalarFields(ability).map(([key, value]) => (
            <tr key={key}>
              <th>{humanize(key)}</th>
              <td>
                {EDITABLE_NUMBER_FIELDS.has(key)
                  ? <EditableNumberField field={key} value={value} dispatch={dispatch} />
                  : formatValue(value)}
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
