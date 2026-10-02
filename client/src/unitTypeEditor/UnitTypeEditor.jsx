import {useEffect, useRef, useState} from "react";
import {UnitTypeDraft} from "./UnitTypeDraft";
import {blankUnitType} from "./blankUnitType";
import UnitTypePreviewPane from "./UnitTypePreviewPane";
import UnitTypeFieldsPanel from "./UnitTypeFieldsPanel";
import DamageEstimatePanel from "./DamageEstimatePanel";
import AreaList from "./AreaList";
import PowerPanel from "../powersEditor/PowerPanel";
import StatusPanel from "../powersEditor/StatusPanel";
import ImportPowerPanel from "../powersEditor/ImportPowerPanel";
import Breadcrumbs from "../powersEditor/Breadcrumbs";
import {usePowerUploads} from "../powersEditor/usePowerUploads";
import {withoutIndex} from "../powersEditor/indexedMaps";
import {estimateDamage} from "./estimateDamage";
import {saveUnitType} from "./saveUnitType";
import {IMPORT_SOURCE_TYPES, expandPowers, resolveRepoPath} from "../powersEditor/powerSources";
import {AbilityDraft} from "../abilityEditor/AbilityDraft";
import {blankAbility} from "../abilityEditor/blankAbility";
import {collectAssetUrls} from "../abilityEditor/collectAssetUrls";
import {validateUnitType} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {redirectTo} from "../redirectTo";

// unitTypeKey's own "/"s each add a directory level beneath unit_types/, so
// a relative path from unit_types/<key>.json back up to the repo root needs
// one ".." per key segment.
function tokensUnitPrefix(unitTypeKey) {
  return "../".repeat(unitTypeKey.split("/").length);
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

function sourceType(id) {
  return IMPORT_SOURCE_TYPES.find((type) => type.id === id);
}

function withoutUpload(uploads, index) {
  if (!uploads[index]) return uploads;
  URL.revokeObjectURL(uploads[index]);
  const {[index]: _dropped, ...rest} = uploads;
  return rest;
}

// The trail shown at the top of the config pane - every crumb but the
// last can be clicked to go back up to it.
function breadcrumbsFor(selection, data) {
  const unit = {label: data.name || "Unit", target: {area: "unit"}};
  if (selection.area === "estimate") return [unit, {label: "Damage estimate"}];
  if (selection.area === "import") return [unit, {label: "Import power"}];
  if (selection.area === "power" || selection.area === "status") {
    const power = data.powers?.[selection.power] ?? {};
    const crumbs = [unit, {label: power.name || `Power ${selection.power + 1}`, target: {area: "power", power: selection.power}}];
    if (selection.area === "status") crumbs.push({label: power.effects?.[selection.effect]?.status?.name || "Status"});
    return crumbs;
  }
  return [unit];
}

// Layout: header (back link, save bar) across the top; the preview in the
// top-left and the list of areas (unit, damage estimate, each power, add/
// import) in the bottom-left; the selected area's config fills the right
// half. Powers are stored inline - anything copied in from the abilities/
// library or another unit type is an independent copy (see powerSources.js).
export default function UnitTypeEditor({unitTypeKey, stockAssets, backUrl}) {
  const ownPath = `unit_types/${unitTypeKey}.json`;
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selection, setSelection] = useState({area: "unit"});
  const [existingTokenImages, setExistingTokenImages] = useState([]);
  // A <key>.full.json left over from when powers were $refs - deleted on
  // the next save, since nothing reads it any more.
  const [staleFullPath, setStaleFullPath] = useState(null);
  // Maps each raw tokenImageUrl entry to its real, displayable
  // raw.githubusercontent.com URL. A just-uploaded, not-yet-saved file has
  // no repo content to resolve yet, so it stays unresolved until saved.
  const [resolvedTokenUrls, setResolvedTokenUrls] = useState({});
  // Same, for every asset URL the powers reference (icons, graphics, sounds).
  const [assetMap, setAssetMap] = useState({});
  // Unsaved token uploads, keyed by tokenImageUrl index, plus a blob:
  // preview URL for each so the preview can show it before it's saved.
  const pendingTokenFilesRef = useRef({});
  const [tokenUploadUrls, setTokenUploadUrls] = useState({});
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);
  const {validity, activity, markDirty, setValidating, setValid, setInvalid, setSaving, setSaved, setSaveError} = useValidateThenSave();
  const client = useRef(new GithubClient());
  const powerUploads = usePowerUploads(markDirty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const content = await client.current.fetchFile(ownPath);
        const raw = content === null ? blankUnitType(unitTypeKey) : JSON.parse(content);
        const data = normalizeUnitType(await expandPowers(client.current, raw, ownPath));
        if (cancelled) return;
        setDraft(new UnitTypeDraft(data, unitTypeKey));

        const [tokenPaths, unitTypeFiles] = await Promise.all([
          client.current.listDirectory("tokens/unit"),
          client.current.listDirectory("unit_types"),
        ]);
        if (cancelled) return;
        setExistingTokenImages(tokenPaths.map((p) => p.replace(/^tokens\/unit\//, "")).sort());
        const fullPath = ownPath.replace(/\.json$/, ".full.json");
        setStaleFullPath(unitTypeFiles.includes(fullPath) ? fullPath : null);
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
  }, [unitTypeKey, ownPath]);

  // Keyed by the raw url strings so unrelated edits don't re-resolve.
  // Skips token slots with a pending upload - their path doesn't exist on
  // GitHub yet.
  const tokenImageUrlKey = JSON.stringify(draft?.data.tokenImageUrl ?? []);
  useEffect(() => {
    const urls = JSON.parse(tokenImageUrlKey).filter((url, i) => url && !pendingTokenFilesRef.current[i]);
    if (!urls.length) return undefined;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(urls.map(async (url) => [url, await client.current.assetUrl(resolveRepoPath(ownPath, url))]));
      if (!cancelled) setResolvedTokenUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [ownPath, tokenImageUrlKey]);

  const powerUrlsKey = JSON.stringify([...new Set(collectAssetUrls(draft?.data.powers ?? []))]);
  useEffect(() => {
    const urls = JSON.parse(powerUrlsKey);
    if (!urls.length) return undefined;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(urls.map(async (url) => [url, await client.current.assetUrl(resolveRepoPath(ownPath, url))]));
      if (!cancelled) setAssetMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [ownPath, powerUrlsKey]);

  // Every draft edit drops a prior "valid" (or "invalid") result - see
  // useValidateThenSave - and any damage estimate, which no longer
  // describes the draft.
  function handleChange(nextDraft) {
    markDirty();
    setEstimate(null);
    setEstimateError(null);
    setDraft(nextDraft);
  }

  function uploadTokenImage(index, file) {
    pendingTokenFilesRef.current[index] = file;
    const url = URL.createObjectURL(file);
    setTokenUploadUrls((current) => {
      if (current[index]) URL.revokeObjectURL(current[index]);
      return {...current, [index]: url};
    });
    handleChange(draft.updateTokenImage(index, `${tokensUnitPrefix(unitTypeKey)}tokens/unit/${file.name}`));
  }

  function pickTokenImage(index, filename) {
    delete pendingTokenFilesRef.current[index];
    setTokenUploadUrls((current) => withoutUpload(current, index));
    handleChange(draft.updateTokenImage(index, `${tokensUnitPrefix(unitTypeKey)}tokens/unit/${filename}`));
  }

  function removeTokenImage(index) {
    pendingTokenFilesRef.current = withoutIndex(pendingTokenFilesRef.current, index);
    setTokenUploadUrls((current) => withoutIndex(current, index, (url) => URL.revokeObjectURL(url)));
    handleChange(draft.removeTokenImage(index));
  }

  function addPower(ability) {
    const next = draft.addPower(ability);
    handleChange(next);
    setSelection({area: "power", power: next.powers.length - 1});
  }

  function updatePower(index, ability) {
    handleChange(draft.updatePower(index, ability));
  }

  function removePower(index) {
    handleChange(draft.removePower(index));
    powerUploads.removePower(index);
    setSelection((current) => {
      if (current.power === undefined || current.power < index) return current;
      if (current.power === index) return {area: "unit"};
      return {...current, power: current.power - 1};
    });
  }

  function removePowerEntry(powerIndex, section, index) {
    updatePower(powerIndex, new AbilityDraft(draft.powers[powerIndex]).removeEntry(section, index).data);
    powerUploads.removeEntry(powerIndex, section, index);
  }

  function removeStatus(powerIndex, effectIndex) {
    updatePower(powerIndex, new AbilityDraft(draft.powers[powerIndex]).removeStatus(effectIndex).data);
    setSelection({area: "power", power: powerIndex});
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateUnitType(draft.data);
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
      setEstimate(await estimateDamage(draft.data));
    } catch (error) {
      setEstimate(null);
      setEstimateError(error.message);
    } finally {
      setEstimating(false);
    }
  }

  async function handleSave(commitMessage) {
    setSaving();
    try {
      await saveUnitType(unitTypeKey, draft.data, {
        tokenFiles: pendingTokenFilesRef.current,
        powerFiles: powerUploads.files(),
        deletePaths: staleFullPath ? [staleFullPath] : [],
      }, commitMessage);
      pendingTokenFilesRef.current = {};
      powerUploads.committed();
      setStaleFullPath(null);
      setSaved();
    } catch (error) {
      if (error instanceof GithubAuthError) {
        redirectTo(error.redirectUrl);
        return;
      }
      setSaveError(error.message);
    }
  }

  if (loadError) return <div className="unit-type-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="unit-type-editor-loading">Loading…</div>;

  // Saved tokens resolve to their GitHub URL; an unsaved upload previews
  // from its local blob: URL instead.
  const tokenPreviewUrls = {...resolvedTokenUrls};
  draft.tokenImageUrls.forEach((url, i) => {
    if (tokenUploadUrls[i]) tokenPreviewUrls[url] = tokenUploadUrls[i];
  });

  const selectedPower = selection.power === undefined ? null : draft.powers[selection.power];
  const area = (selection.area === "power" || selection.area === "status") && !selectedPower ? "unit" : selection.area;

  function renderConfig() {
    switch (area) {
      case "estimate":
        return <DamageEstimatePanel estimate={estimate} estimating={estimating} error={estimateError} onEstimate={handleEstimate} />;
      case "import":
        return (
          <ImportPowerPanel
            sourceTypes={IMPORT_SOURCE_TYPES}
            listSources={(typeId) => sourceType(typeId).listSources(client.current, ownPath)}
            loadPowers={(typeId, sourceId) => sourceType(typeId).loadPowers(client.current, sourceId, ownPath)}
            onImport={addPower}
          />
        );
      case "power":
        return (
          <PowerPanel
            key={selection.power}
            power={selectedPower}
            onChange={(ability) => updatePower(selection.power, ability)}
            onRemovePower={() => removePower(selection.power)}
            onOpenStatus={(effect) => setSelection({area: "status", power: selection.power, effect})}
            assetOverrides={powerUploads.overrides[selection.power] ?? {}}
            onUploadAsset={(field, file) => powerUploads.upload(selection.power, field, file)}
            onClearAsset={(field) => powerUploads.clear(selection.power, field)}
            onRemoveEntry={(section, index) => removePowerEntry(selection.power, section, index)}
            stockAssets={stockAssets}
          />
        );
      case "status":
        return (
          <StatusPanel
            key={`${selection.power}-${selection.effect}`}
            power={selectedPower}
            effectIndex={selection.effect}
            onChange={(ability) => updatePower(selection.power, ability)}
            onRemoveStatus={() => removeStatus(selection.power, selection.effect)}
            stockAssets={stockAssets}
          />
        );
      default:
        return (
          <UnitTypeFieldsPanel
            draft={draft}
            onChange={handleChange}
            existingTokenImages={existingTokenImages}
            onUploadTokenImage={uploadTokenImage}
            onRemoveTokenImage={removeTokenImage}
            onPickTokenImage={pickTokenImage}
          />
        );
    }
  }

  return (
    <div className="content-editor">
      <header className="content-editor-header">
        {backUrl && <a className="back-link" href={backUrl}>← Back</a>}
        <h1>{unitTypeKey}</h1>
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} defaultMessage={`Update ${draft.data.name || unitTypeKey}`} />
      </header>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <UnitTypePreviewPane
            unitTypeData={draft.data}
            assetMap={assetMap}
            powerAssetOverrides={powerUploads.overrides}
            stockAssets={stockAssets}
            resolvedTokenUrls={tokenPreviewUrls}
          />
        </div>
        <AreaList
          unitTypeData={draft.data}
          selection={{...selection, area}}
          onSelect={setSelection}
          onNewPower={() => addPower(blankAbility("new-power"))}
        />
      </div>
      <div className="content-editor-fields">
        <Breadcrumbs crumbs={breadcrumbsFor({...selection, area}, draft.data)} onSelect={setSelection} />
        {renderConfig()}
      </div>
    </div>
  );
}
