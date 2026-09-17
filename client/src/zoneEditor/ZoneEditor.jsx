import {useReducer} from "react";
import {zoneReducer} from "./zoneReducer";

// Step 2's skeleton: just the `name` field, editable in-browser but not yet
// persisted anywhere - saving is deliberately deferred to step 11
// (plans/zone-editor.md), once there's a real expand/layout step for it to
// commit alongside. Until then, test by loading an already-created zone and
// editing it in memory; a reload discards the edit.
export default function ZoneEditor({initialZone}) {
  const [zoneData, dispatch] = useReducer(zoneReducer, initialZone);

  return (
    <div className="zone-editor">
      <div className="zone-editor-fields">
        <table>
          <tbody>
            <tr>
              <th><label htmlFor="zone-name">Name</label></th>
              <td>
                <input
                  id="zone-name"
                  type="text"
                  value={zoneData.name ?? ""}
                  onChange={(e) => dispatch({type: "SET_FIELD", field: "name", value: e.target.value})}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
