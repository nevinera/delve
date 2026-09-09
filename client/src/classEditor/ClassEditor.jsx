import {useReducer, useState} from "react";
import {classReducer} from "./classReducer";
import ClassPreviewPane from "./ClassPreviewPane";
import ClassFieldsPanel from "./ClassFieldsPanel";
import {saveClass} from "./saveClass";
import {GithubAuthError} from "../github/commitFiles";

export default function ClassEditor({classKey, initialClass, availableAbilities, stockAssets, newAbilityUrl}) {
  const [classData, dispatch] = useReducer(classReducer, initialClass);
  const [saveState, setSaveState] = useState({status: "idle"});

  async function handleSave() {
    setSaveState({status: "saving"});
    try {
      const {commitSha} = await saveClass(classKey, classData);
      setSaveState({status: "success", commitSha});
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setSaveState({status: "error", message: error.message});
    }
  }

  return (
    <div className="class-editor">
      <div className="class-editor-preview">
        <ClassPreviewPane classKey={classKey} powers={classData.powers ?? []} availableAbilities={availableAbilities} stockAssets={stockAssets} />
      </div>
      <div className="class-editor-fields">
        <div className="save-bar">
          <button type="button" className="save-button" onClick={handleSave} disabled={saveState.status === "saving"}>
            {saveState.status === "saving" ? "Saving…" : "Save"}
          </button>
          {saveState.status === "success" && <span className="save-message save-success">Saved.</span>}
          {saveState.status === "error" && <span className="save-message save-error">{saveState.message}</span>}
        </div>
        <ClassFieldsPanel
          classKey={classKey}
          classData={classData}
          availableAbilities={availableAbilities}
          newAbilityUrl={newAbilityUrl}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}
