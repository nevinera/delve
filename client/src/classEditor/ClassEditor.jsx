import {useReducer} from "react";
import {classReducer} from "./classReducer";
import ClassPreviewPane from "./ClassPreviewPane";
import ClassFieldsPanel from "./ClassFieldsPanel";
import {saveClass} from "./saveClass";
import {resolveFullClass} from "./resolveFullClass";
import {validateCharacterClass} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubAuthError} from "../github/commitFiles";

export default function ClassEditor({classKey, initialClass, availableAbilities, stockAssets, newAbilityUrl}) {
  const [classData, rawDispatch] = useReducer(classReducer, initialClass);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  // Every draft edit drops a prior "valid" (or "invalid") result - see
  // useValidateThenSave.
  function dispatch(action) {
    markDirty();
    rawDispatch(action);
  }

  async function handleValidate() {
    setValidating();
    try {
      const fullClass = await resolveFullClass(classKey, classData, availableAbilities);
      const {valid, error} = await validateCharacterClass(fullClass);
      if (valid) {
        setValid();
      } else {
        setInvalid(error.message);
      }
    } catch (error) {
      setInvalid(error.message);
    }
  }

  async function handleSave() {
    setSaving();
    try {
      await saveClass(classKey, classData, availableAbilities);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setSaveError(error.message);
    }
  }

  return (
    <div className="class-editor">
      <div className="class-editor-preview">
        <ClassPreviewPane classKey={classKey} powers={classData.powers ?? []} availableAbilities={availableAbilities} stockAssets={stockAssets} />
      </div>
      <div className="class-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
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
