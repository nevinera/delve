import {useReducer, useRef, useState} from "react";
import {abilityReducer} from "./abilityReducer";
import AbilityPreviewPane from "./AbilityPreviewPane";
import AbilityFieldsPanel from "./AbilityFieldsPanel";
import {assetOverrideKey} from "./resolveAbilityForPlayback";
import {saveAbility} from "./saveAbility";
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
  const [ability, dispatch] = useReducer(abilityReducer, initialAbility);
  const [assetOverrides, setAssetOverrides] = useState({});
  const overrideUrlsRef = useRef({});
  // The actual uploaded File objects, keyed the same way as assetOverrides -
  // needed at save time (assetOverrides only holds blob: URLs, which are
  // for preview only and can't be read back into bytes for a commit).
  const pendingFilesRef = useRef({});
  const [saveState, setSaveState] = useState({status: "idle"});

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
    setSaveState({status: "idle"});
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

  async function handleSave() {
    setSaveState({status: "saving"});
    try {
      const {commitSha} = await saveAbility(abilityKey, ability, pendingFilesRef.current);
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
    <div className="ability-editor">
      <div className="ability-editor-preview">
        <AbilityPreviewPane ability={ability} assetMap={assetMap} assetOverrides={assetOverrides} />
      </div>
      <div className="ability-editor-fields">
        <div className="save-bar">
          <button type="button" className="save-button" onClick={handleSave} disabled={saveState.status === "saving"}>
            {saveState.status === "saving" ? "Saving…" : "Save"}
          </button>
          {saveState.status === "success" && <span className="save-message save-success">Saved.</span>}
          {saveState.status === "error" && <span className="save-message save-error">{saveState.message}</span>}
        </div>
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
