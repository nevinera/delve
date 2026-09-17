import {useReducer, useState} from "react";
import {zoneReducer} from "./zoneReducer";
import {saveZone} from "./saveZone";
import {GithubAuthError} from "../github/commitFiles";

// Step 2's skeleton: just the `name` field, with a plain Save (no
// Validate) - Build::ValidatorsController has no `zone` action yet (that's
// step 9, and it needs the $ref-resolved form per plans/zone-editor.md), so
// there's nothing real to gate Save behind until then. Swap in
// ValidateSaveBar/useValidateThenSave once that exists, same as every
// other editor.
export default function ZoneEditor({zoneKey, initialZone}) {
  const [zoneData, dispatch] = useReducer(zoneReducer, initialZone);
  const [activity, setActivity] = useState({status: "idle"});

  async function handleSave() {
    setActivity({status: "saving"});
    try {
      await saveZone(zoneKey, zoneData);
      setActivity({status: "success"});
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setActivity({status: "save_error", message: error.message});
    }
  }

  const saving = activity.status === "saving";

  return (
    <div className="zone-editor">
      <div className="zone-editor-fields">
        <div className="save-bar">
          <button type="button" className="save-button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          {activity.status === "save_error" && <span className="save-message save-error">{activity.message}</span>}
          {activity.status === "success" && <span className="save-message save-success">Saved.</span>}
        </div>
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
