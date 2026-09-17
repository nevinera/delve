import {useEffect, useReducer, useRef, useState} from "react";
import {itemReducer} from "./itemReducer";
import {blankItem} from "./blankItem";
import ItemPreviewPane from "./ItemPreviewPane";
import ItemFieldsPanel from "./ItemFieldsPanel";
import {saveItem} from "./saveItem";
import {validateItem} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

// The item's own content is no longer bootstrapped from the server (see
// plans/editor-git.md) - it's fetched here, client-side, on mount, via
// GithubClient (one instance per mount, so its cached token/repo carry
// across this and any future reads the editor adds). A 404 means the key
// doesn't exist yet - blankItem's the same fallback Build::ItemsController
// used to build server-side.
export default function ItemEditor({itemKey}) {
  const [itemData, rawDispatch] = useReducer(itemReducer, null);
  const [loadError, setLoadError] = useState(null);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    client.current
      .fetchFile(`items/${itemKey}.json`)
      .then((content) => {
        if (cancelled) return;
        rawDispatch({type: "LOAD", data: content === null ? blankItem(itemKey) : JSON.parse(content)});
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          window.location.href = error.redirectUrl;
          return;
        }
        setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [itemKey]);

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

  if (loadError) return <div className="item-editor-load-error">Failed to load: {loadError}</div>;
  if (itemData === null) return <div className="item-editor-loading">Loading…</div>;

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
