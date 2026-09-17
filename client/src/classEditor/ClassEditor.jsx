import {useEffect, useReducer, useRef, useState} from "react";
import {classReducer} from "./classReducer";
import {blankClass} from "./blankClass";
import {loadAvailableAbilities} from "./loadAvailableAbilities";
import ClassPreviewPane from "./ClassPreviewPane";
import ClassFieldsPanel from "./ClassFieldsPanel";
import {saveClass} from "./saveClass";
import {resolveFullClass} from "./resolveFullClass";
import {validateCharacterClass} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

// Neither the class's own content nor its available-abilities map is
// bootstrapped from the server any more (see plans/editor-git.md) - both
// are fetched here, client-side, on mount, via one shared GithubClient
// instance (so the token/branch lookups its reads need are only ever
// fetched once).
export default function ClassEditor({classKey, stockAssets, newAbilityUrl}) {
  const [classData, rawDispatch] = useReducer(classReducer, null);
  const [availableAbilities, setAvailableAbilities] = useState({});
  const [loadError, setLoadError] = useState(null);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await client.current.fetchFile(`classes/${classKey}.json`);
        if (cancelled) return;
        rawDispatch({type: "LOAD", data: content === null ? blankClass(classKey) : JSON.parse(content)});

        const abilities = await loadAvailableAbilities(client.current, classKey);
        if (!cancelled) setAvailableAbilities(abilities);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          window.location.href = error.redirectUrl;
          return;
        }
        setLoadError(error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classKey]);

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

  if (loadError) return <div className="class-editor-load-error">Failed to load: {loadError}</div>;
  if (classData === null) return <div className="class-editor-loading">Loading…</div>;

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
