import {useEffect, useRef, useState} from "react";
import {ItemDraft} from "./ItemDraft";
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
//
// The draft itself is an ItemDraft (see ItemDraft.js) - an immutable
// domain object owning the data and every mutation (setSlot, setShield,
// toggleSecondary, ...). React only ever holds "the current instance" and
// replaces it wholesale via setDraft; none of the field-clearing/cap rules
// live here or in ItemFieldsPanel any more (see plans/editors-as-classes.md).
export default function ItemEditor({itemKey}) {
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    client.current
      .fetchFile(`items/${itemKey}.json`)
      .then((content) => {
        if (cancelled) return;
        setDraft(new ItemDraft(content === null ? blankItem(itemKey) : JSON.parse(content)));
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

  function handleChange(nextDraft) {
    markDirty();
    setDraft(nextDraft);
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateItem(draft.data);
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
      await saveItem(itemKey, draft.data);
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
  if (draft === null) return <div className="item-editor-loading">Loading…</div>;

  return (
    <div className="item-editor">
      <div className="item-editor-preview">
        <ItemPreviewPane itemData={draft.data} />
      </div>
      <div className="item-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <ItemFieldsPanel draft={draft} onChange={handleChange} />
      </div>
    </div>
  );
}
