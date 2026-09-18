import {useEffect, useRef, useState} from "react";
import {UnitTypeDraft} from "./UnitTypeDraft";
import {blankUnitType} from "./blankUnitType";
import {loadAvailableAbilities} from "./loadAvailableAbilities";
import UnitTypePreviewPane from "./UnitTypePreviewPane";
import UnitTypeFieldsPanel from "./UnitTypeFieldsPanel";
import {saveUnitType} from "./saveUnitType";
import {resolveFullUnitType} from "./resolveFullUnitType";
import {validateUnitType} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

// tokenImageUrl is schema-legal as a bare string (see docs/schema/unit_type.md)
// and real content uses that form - but this editor always edits/saves it as
// an array (a one-entry array behaves identically for every consumer), so
// normalize once here rather than guarding every place that reads it.
function normalizeUnitType(unitType) {
  const url = unitType.tokenImageUrl;
  if (Array.isArray(url)) return unitType;
  return {...unitType, tokenImageUrl: url ? [url] : []};
}

// Neither the unit type's own content nor its available-abilities map is
// bootstrapped from the server any more (see plans/editor-git.md) - both
// are fetched here, client-side, on mount, via one shared GithubClient
// instance.
export default function UnitTypeEditor({unitTypeKey, stockAssets, newAbilityUrl}) {
  const [draft, setDraft] = useState(null);
  const [availableAbilities, setAvailableAbilities] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState("");
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await client.current.fetchFile(`unit_types/${unitTypeKey}.json`);
        if (cancelled) return;
        const data = normalizeUnitType(content === null ? blankUnitType(unitTypeKey) : JSON.parse(content));
        setDraft(new UnitTypeDraft(data, unitTypeKey));

        const abilities = await loadAvailableAbilities(client.current);
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
  }, [unitTypeKey]);

  // Every draft edit drops a prior "valid" (or "invalid") result - see
  // useValidateThenSave.
  function handleChange(nextDraft) {
    markDirty();
    setDraft(nextDraft);
  }

  // Lets an ability created in another tab (via the "+ New ability" link)
  // show up here without reloading the whole editor and losing the draft -
  // just re-runs the same client-side load, no server round trip needed
  // any more.
  async function handleRefreshAbilities() {
    setRefreshStatus("Refreshing…");
    try {
      setAvailableAbilities(await loadAvailableAbilities(client.current));
      setRefreshStatus("Refreshed.");
    } catch (error) {
      setRefreshStatus(`Refresh failed: ${error.message}`);
    }
  }

  async function handleValidate() {
    setValidating();
    try {
      const fullUnitType = await resolveFullUnitType(unitTypeKey, draft.data, availableAbilities);
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
      await saveUnitType(unitTypeKey, draft.data, availableAbilities);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        window.location.href = error.redirectUrl;
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="unit-type-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="unit-type-editor-loading">Loading…</div>;

  return (
    <div className="unit-type-editor">
      <div className="unit-type-editor-preview">
        <UnitTypePreviewPane
          unitTypeKey={unitTypeKey}
          unitTypeData={draft.data}
          availableAbilities={availableAbilities}
          stockAssets={stockAssets}
        />
      </div>
      <div className="unit-type-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <UnitTypeFieldsPanel
          draft={draft}
          availableAbilities={availableAbilities}
          newAbilityUrl={newAbilityUrl}
          onRefreshAbilities={handleRefreshAbilities}
          refreshStatus={refreshStatus}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
