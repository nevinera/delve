import {useReducer, useRef, useState} from "react";
import {abilityReducer} from "./abilityReducer";
import AbilityPreviewPane from "./AbilityPreviewPane";
import AbilityFieldsPanel from "./AbilityFieldsPanel";
import {assetOverrideKey} from "./resolveAbilityForPlayback";
import {saveAbility} from "./saveAbility";
import {validateAbility} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubAuthError} from "../github/commitFiles";

// Removing an entry shifts every later entry's index down by one, so any
// value keyed by section+index (see assetOverrideKey) needs to move with
// it - used for both the preview-URL map and the pending-File map, which
// share the same keys. Drops (rather than shifts) the entry that was
// actually removed.
function reindexBySection(map, section, removedIndex, onRemoved) {
  const prefix = `${section}[`;
  const next = {};
  for (const [key, value] of Object.entries(map)) {
    if (!key.startsWith(prefix)) {
      next[key] = value;
      continue;
    }
    const [, entryIndex, field] = key.match(/^(?:.+)\[(\d+)\]\.(.+)$/);
    const i = Number(entryIndex);
    if (i === removedIndex) {
      onRemoved?.(value);
      continue;
    }
    next[assetOverrideKey(section, i > removedIndex ? i - 1 : i, field)] = value;
  }
  return next;
}

export default function AbilityEditor({abilityKey, initialAbility, assetMap, stockAssets}) {
  const [ability, rawDispatch] = useReducer(abilityReducer, initialAbility);
  const [assetOverrides, setAssetOverrides] = useState({});
  const overrideUrlsRef = useRef({});
  // The actual uploaded File objects, keyed the same way as assetOverrides -
  // needed at save time (assetOverrides only holds blob: URLs, which are
  // for preview only and can't be read back into bytes for a commit).
  const pendingFilesRef = useRef({});
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();

  // Every draft edit needs to drop a prior "valid" (or "invalid") result -
  // see useValidateThenSave - so this wraps the reducer's dispatch rather
  // than calling markDirty at each of the several call sites below.
  function dispatch(action) {
    markDirty();
    rawDispatch(action);
  }

  // "Uploads" a local file as a stand-in for a not-yet-saved asset (preview
  // only - see resolveAbilityForPlayback). Keyed by field name, not by the
  // field's current value, so it works even before iconURL is set.
  function uploadAsset(field, file) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);

    const url = URL.createObjectURL(file);
    overrideUrlsRef.current[field] = url;
    pendingFilesRef.current[field] = file;
    setAssetOverrides((current) => ({...current, [field]: url}));
    markDirty();
  }

  // Reverts a field to whatever the server-resolved assetMap (or the field's
  // own value) would show, dropping the local upload.
  function clearAssetOverride(field) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);
    delete overrideUrlsRef.current[field];
    delete pendingFilesRef.current[field];

    setAssetOverrides((current) => {
      const next = {...current};
      delete next[field];
      return next;
    });
  }

  function removeEntry(section, index) {
    dispatch({type: "REMOVE_ENTRY", section, index});

    overrideUrlsRef.current = reindexBySection(overrideUrlsRef.current, section, index, (url) => URL.revokeObjectURL(url));
    pendingFilesRef.current = reindexBySection(pendingFilesRef.current, section, index);
    setAssetOverrides((current) => reindexBySection(current, section, index));
  }

  async function handleValidate() {
    setValidating();
    const {valid, error} = await validateAbility(ability);
    if (valid) {
      setValid();
    } else {
      setInvalid(error.message);
    }
  }

  async function handleSave() {
    setSaving();
    try {
      await saveAbility(abilityKey, ability, pendingFilesRef.current);
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
    <div className="ability-editor">
      <div className="ability-editor-preview">
        <AbilityPreviewPane ability={ability} assetMap={assetMap} assetOverrides={assetOverrides} stockAssets={stockAssets} />
      </div>
      <div className="ability-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <AbilityFieldsPanel
          ability={ability}
          dispatch={dispatch}
          assetOverrides={assetOverrides}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAssetOverride}
          onRemoveEntry={removeEntry}
          stockAssets={stockAssets}
        />
      </div>
    </div>
  );
}
