import {useReducer} from "react";
import {itemReducer} from "./itemReducer";
import ItemPreviewPane from "./ItemPreviewPane";
import ItemFieldsPanel from "./ItemFieldsPanel";
import {saveItem} from "./saveItem";
import {validateItem} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubAuthError} from "../github/commitFiles";

export default function ItemEditor({itemKey, initialItem}) {
  const [itemData, rawDispatch] = useReducer(itemReducer, initialItem);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  function dispatch(action) {
    markDirty();
    rawDispatch(action);
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateItem(itemData);
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
      await saveItem(itemKey, itemData);
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
    <div className="item-editor">
      <div className="item-editor-preview">
        <ItemPreviewPane itemData={itemData} />
      </div>
      <div className="item-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <ItemFieldsPanel itemData={itemData} dispatch={dispatch} />
      </div>
    </div>
  );
}
