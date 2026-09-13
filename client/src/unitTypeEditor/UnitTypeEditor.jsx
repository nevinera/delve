import {useReducer, useState} from "react";
import {unitTypeReducer} from "./unitTypeReducer";
import UnitTypePreviewPane from "./UnitTypePreviewPane";
import UnitTypeFieldsPanel from "./UnitTypeFieldsPanel";
import {saveUnitType} from "./saveUnitType";
import {resolveFullUnitType} from "./resolveFullUnitType";
import {validateUnitType} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubAuthError} from "../github/commitFiles";

export default function UnitTypeEditor({unitTypeKey, initialUnitType, initialAvailableAbilities, stockAssets, newAbilityUrl, availableAbilitiesUrl}) {
  const [unitTypeData, rawDispatch] = useReducer(unitTypeReducer, initialUnitType);
  const [availableAbilities, setAvailableAbilities] = useState(initialAvailableAbilities);
  const [refreshStatus, setRefreshStatus] = useState("");
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  // Every draft edit drops a prior "valid" (or "invalid") result - see
  // useValidateThenSave.
  function dispatch(action) {
    markDirty();
    rawDispatch(action);
  }

  // Lets an ability created in another tab (via the "+ New ability" link)
  // show up here without reloading the whole editor and losing the draft.
  async function handleRefreshAbilities() {
    setRefreshStatus("Refreshing…");
    try {
      const res = await fetch(availableAbilitiesUrl);
      if (!res.ok) throw new Error(`request failed: ${res.status}`);
      setAvailableAbilities(await res.json());
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  async function handleValidate() {
    setValidating();
    try {
      const fullUnitType = await resolveFullUnitType(unitTypeKey, unitTypeData, availableAbilities);
      const {valid, error} = await validateUnitType(fullUnitType);
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
      await saveUnitType(unitTypeKey, unitTypeData, availableAbilities);
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
    <div className="unit-type-editor">
      <div className="unit-type-editor-preview">
        <UnitTypePreviewPane
          unitTypeKey={unitTypeKey}
          unitTypeData={unitTypeData}
          availableAbilities={availableAbilities}
          stockAssets={stockAssets}
        />
      </div>
      <div className="unit-type-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <UnitTypeFieldsPanel
          unitTypeKey={unitTypeKey}
          unitTypeData={unitTypeData}
          availableAbilities={availableAbilities}
          newAbilityUrl={newAbilityUrl}
          onRefreshAbilities={handleRefreshAbilities}
          refreshStatus={refreshStatus}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}
