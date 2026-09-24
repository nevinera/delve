import {useEffect, useRef, useState} from "react";
import {UnitTypeDraft} from "./UnitTypeDraft";
import {blankUnitType} from "./blankUnitType";
import {loadAvailableAbilities} from "./loadAvailableAbilities";
import UnitTypePreviewPane from "./UnitTypePreviewPane";
import UnitTypeFieldsPanel from "./UnitTypeFieldsPanel";
import DamageEstimatePanel from "./DamageEstimatePanel";
import {estimateDamage} from "./estimateDamage";
import {saveUnitType} from "./saveUnitType";
import {resolveFullUnitType} from "./resolveFullUnitType";
import {validateUnitType} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";

// unitTypeKey's own "/"s each add a directory level beneath unit_types/, so
// a relative path from unit_types/<key>.json back up to the repo root needs
// one ".." per key segment - same reasoning as powerRefs.js's relativePrefix.
function tokensUnitPrefix(unitTypeKey) {
  return "../".repeat(unitTypeKey.split("/").length);
}

// tokenImageUrl entries are relative to unit_types/<key>.json (same as a
// power's $ref) - resolve one to its real repo path so it can be fetched/
// linked, same URL trick saveUnitType.js uses to find an upload's commit path.
function resolveTokenRepoPath(unitTypeKey, relativeUrl) {
  const url = new URL(relativeUrl, `https://_/unit_types/${unitTypeKey}.json`);
  return url.pathname.replace(/^\//, "");
}

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
  const [existingTokenImages, setExistingTokenImages] = useState([]);
  // Maps each raw tokenImageUrl entry to its real, displayable
  // raw.githubusercontent.com URL, so the preview pane can actually show the
  // unit's own token instead of always falling back to the stock goblin -
  // resolved here (not in the preview pane) since only this component holds
  // the GithubClient. Only covers already-committed images (picked from
  // existingTokenImages, or saved in a prior session) - a just-uploaded,
  // not-yet-saved file has no repo content to resolve yet (see
  // pendingFilesRef), so it's left unresolved until the next save+reload.
  const [resolvedTokenUrls, setResolvedTokenUrls] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState("");
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  // The uploaded File objects pending a save, keyed by tokenImageUrl array
  // index - GithubClient has no writable preview URL for an unsaved local
  // file, so (unlike AbilityEditor's assetOverrides) there's no live
  // preview here, just the slot's own path updating immediately on upload.
  const pendingFilesRef = useRef({});
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

        const tokenPaths = await client.current.listDirectory("tokens/unit");
        if (!cancelled) setExistingTokenImages(tokenPaths.map((p) => p.replace(/^tokens\/unit\//, "")).sort());
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

  // Re-resolves whenever the draft's own token list changes (upload, pick,
  // remove, or a fresh load) - keyed by the raw url string so a url reused
  // across slots is only resolved once. Skips any slot with a pending
  // upload (see pendingFilesRef) - its path doesn't exist on GitHub yet, so
  // resolving it would only produce a broken (404) raw.githubusercontent.com
  // URL; the preview simply won't show that slot until it's saved.
  const tokenImageUrlKey = JSON.stringify(draft?.data.tokenImageUrl ?? []);
  useEffect(() => {
    if (!draft) return undefined;
    let cancelled = false;
    const urls = (draft.data.tokenImageUrl ?? [])
      .filter((url, i) => url && !pendingFilesRef.current[i]);
    (async () => {
      const entries = await Promise.all(
        urls.map(async (url) => [url, await client.current.assetUrl(resolveTokenRepoPath(unitTypeKey, url))])
      );
      if (!cancelled) setResolvedTokenUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitTypeKey, tokenImageUrlKey]);

  // "Uploads" a local file as a stand-in for a not-yet-saved token image -
  // sets the slot's own path immediately, unlike AbilityEditor's upload
  // flow (which requires a path to already be set, since an ability's
  // assets can live at any relative path).
  function uploadTokenImage(index, file) {
    pendingFilesRef.current[index] = file;
    handleChange(draft.updateTokenImage(index, `${tokensUnitPrefix(unitTypeKey)}tokens/unit/${file.name}`));
  }

  // Picking an existing tokens/unit/ file (see existingTokenImages) needs
  // the same prefix as a fresh upload - just no pending file to track.
  function pickTokenImage(index, filename) {
    handleChange(draft.updateTokenImage(index, `${tokensUnitPrefix(unitTypeKey)}tokens/unit/${filename}`));
  }

  // Removing a slot shifts every later slot's index down by one (see
  // UnitTypeDraft#removeTokenImage), so any pending upload keyed by index
  // needs to move with it, same reasoning as AbilityEditor's reindexBySection.
  function removeTokenImage(index) {
    const next = {};
    for (const [key, file] of Object.entries(pendingFilesRef.current)) {
      const i = Number(key);
      if (i === index) continue;
      next[i > index ? i - 1 : i] = file;
    }
    pendingFilesRef.current = next;
    handleChange(draft.removeTokenImage(index));
  }

  // Every draft edit drops a prior "valid" (or "invalid") result - see
  // useValidateThenSave.
  // It also drops any damage estimate, which no longer describes the draft.
  function handleChange(nextDraft) {
    markDirty();
    setEstimate(null);
    setEstimateError(null);
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

  async function handleEstimate() {
    setEstimating(true);
    setEstimateError(null);
    try {
      const fullUnitType = await resolveFullUnitType(unitTypeKey, draft.data, availableAbilities);
      setEstimate(await estimateDamage(fullUnitType));
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
      await saveUnitType(unitTypeKey, draft.data, availableAbilities, pendingFilesRef.current);
      pendingFilesRef.current = {};
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
          resolvedTokenUrls={resolvedTokenUrls}
        />
      </div>
      <div className="unit-type-editor-fields">
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} />
        <DamageEstimatePanel estimate={estimate} estimating={estimating} error={estimateError} onEstimate={handleEstimate} />
        <UnitTypeFieldsPanel
          draft={draft}
          availableAbilities={availableAbilities}
          newAbilityUrl={newAbilityUrl}
          onRefreshAbilities={handleRefreshAbilities}
          refreshStatus={refreshStatus}
          onChange={handleChange}
          existingTokenImages={existingTokenImages}
          onUploadTokenImage={uploadTokenImage}
          onRemoveTokenImage={removeTokenImage}
          onPickTokenImage={pickTokenImage}
        />
      </div>
    </div>
  );
}
