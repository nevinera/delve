import {useEffect, useRef, useState} from "react";
import {ClassDraft} from "./ClassDraft";
import {blankClass} from "./blankClass";
import {loadAvailableAbilities} from "./loadAvailableAbilities";
import ClassPreviewPane from "./ClassPreviewPane";
import ClassFieldsPanel from "./ClassFieldsPanel";
import ClassDpsEstimatePanel from "./ClassDpsEstimatePanel";
import {estimateClassDps} from "./estimateClassDps";
import {abilityKeyForRef} from "./powerRefs";
import {saveClass} from "./saveClass";
import {resolveFullClass} from "./resolveFullClass";
import {validateCharacterClass} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {redirectTo} from "../redirectTo";

// Neither the class's own content nor its available-abilities map is
// bootstrapped from the server any more (see plans/editor-git.md) - both
// are fetched here, client-side, on mount, via one shared GithubClient
// instance (so the token/branch lookups its reads need are only ever
// fetched once).
export default function ClassEditor({classKey, stockAssets, newAbilityUrl}) {
  const [draft, setDraft] = useState(null);
  const [availableAbilities, setAvailableAbilities] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [strategy, setStrategy] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await client.current.fetchFile(`classes/${classKey}.json`);
        if (cancelled) return;
        setDraft(new ClassDraft(content === null ? blankClass(classKey) : JSON.parse(content), classKey));

        const abilities = await loadAvailableAbilities(client.current, classKey);
        if (!cancelled) setAvailableAbilities(abilities);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof GithubAuthError) {
          redirectTo(error.redirectUrl);
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
  // useValidateThenSave. It also drops any DPS estimate, which no longer
  // describes the draft.
  function handleChange(nextDraft) {
    markDirty();
    setEstimate(null);
    setEstimateError(null);
    setDraft(nextDraft);
  }

  async function handleValidate() {
    setValidating();
    try {
      const fullClass = await resolveFullClass(classKey, draft.data, availableAbilities);
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

  async function handleEstimate() {
    setEstimating(true);
    setEstimateError(null);
    try {
      const fullClass = await resolveFullClass(classKey, draft.data, availableAbilities);
      setEstimate(await estimateClassDps(fullClass, strategy));
    } catch (error) {
      setEstimate(null);
      setEstimateError(error.message);
    } finally {
      setEstimating(false);
    }
  }

  async function handleSave() {
    setSaving();
    try {
      await saveClass(classKey, draft.data, availableAbilities);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="class-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="class-editor-loading">Loading…</div>;

  const powerNames = (draft.data.powers ?? [])
    .map((entry) => availableAbilities[abilityKeyForRef(classKey, entry)]?.ability?.name)
    .filter(Boolean);

  return (
    <div className="class-editor">
      <div className="class-editor-preview">
        <ClassPreviewPane classKey={classKey} powers={draft.data.powers ?? []} availableAbilities={availableAbilities} stockAssets={stockAssets} />
      </div>
      <div className="class-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <ClassDpsEstimatePanel
          strategy={strategy}
          onStrategyChange={setStrategy}
          powerNames={powerNames}
          estimate={estimate}
          estimating={estimating}
          error={estimateError}
          onEstimate={handleEstimate}
        />
        <ClassFieldsPanel
          draft={draft}
          availableAbilities={availableAbilities}
          newAbilityUrl={newAbilityUrl}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
