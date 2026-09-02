import {useReducer, useRef, useState} from "react";
import {abilityReducer} from "./abilityReducer";
import AbilityPreviewPane from "./AbilityPreviewPane";
import AbilityFieldsPanel from "./AbilityFieldsPanel";

export default function AbilityEditor({initialAbility, assetMap}) {
  const [ability, dispatch] = useReducer(abilityReducer, initialAbility);
  const [assetOverrides, setAssetOverrides] = useState({});
  const overrideUrlsRef = useRef({});

  // "Uploads" a local file as a stand-in for a not-yet-saved asset (preview
  // only - see resolveAbilityForPlayback). Keyed by field name, not by the
  // field's current value, so it works even before iconURL is set.
  function uploadAsset(field, file) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);

    const url = URL.createObjectURL(file);
    overrideUrlsRef.current[field] = url;
    setAssetOverrides((current) => ({...current, [field]: url}));
  }

  // Reverts a field to whatever the server-resolved assetMap (or the field's
  // own value) would show, dropping the local upload.
  function clearAssetOverride(field) {
    const previous = overrideUrlsRef.current[field];
    if (previous) URL.revokeObjectURL(previous);
    delete overrideUrlsRef.current[field];

    setAssetOverrides((current) => {
      const next = {...current};
      delete next[field];
      return next;
    });
  }

  return (
    <div className="ability-editor">
      <div className="ability-editor-preview">
        <AbilityPreviewPane ability={ability} assetMap={assetMap} assetOverrides={assetOverrides} />
      </div>
      <div className="ability-editor-fields">
        <AbilityFieldsPanel
          ability={ability}
          dispatch={dispatch}
          assetOverrides={assetOverrides}
          onUploadAsset={uploadAsset}
          onClearAsset={clearAssetOverride}
        />
      </div>
    </div>
  );
}
