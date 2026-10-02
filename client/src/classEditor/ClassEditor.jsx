import {useEffect, useRef, useState} from "react";
import {ClassDraft} from "./ClassDraft";
import {blankClass} from "./blankClass";
import ClassPreviewPane from "./ClassPreviewPane";
import ClassFieldsPanel from "./ClassFieldsPanel";
import ClassDpsEstimatePanel from "./ClassDpsEstimatePanel";
import ClassAreaList from "./ClassAreaList";
import PassivePanel from "./PassivePanel";
import {estimateClassDps} from "./estimateClassDps";
import {saveClass} from "./saveClass";
import PowerPanel from "../powersEditor/PowerPanel";
import StatusPanel from "../powersEditor/StatusPanel";
import ImportPowerPanel from "../powersEditor/ImportPowerPanel";
import Breadcrumbs from "../powersEditor/Breadcrumbs";
import {usePowerUploads} from "../powersEditor/usePowerUploads";
import {IMPORT_SOURCE_TYPES, expandPowers, resolveRepoPath} from "../powersEditor/powerSources";
import {AbilityDraft} from "../abilityEditor/AbilityDraft";
import {blankAbility} from "../abilityEditor/blankAbility";
import {collectAssetUrls} from "../abilityEditor/collectAssetUrls";
import {validateCharacterClass} from "../validators/validateContent";
import {useValidateThenSave} from "../validators/useValidateThenSave";
import ValidateSaveBar from "../validators/ValidateSaveBar";
import {GithubClient, GithubAuthError} from "../github/delve-github";
import {redirectTo} from "../redirectTo";

function sourceType(id) {
  return IMPORT_SOURCE_TYPES.find((type) => type.id === id);
}

// The trail shown at the top of the config pane.
function breadcrumbsFor(selection, data) {
  const root = {label: data.name || "Class", target: {area: "class"}};
  switch (selection.area) {
    case "estimate":
      return [root, {label: "DPS estimate"}];
    case "import":
      return [root, {label: "Import power"}];
    case "passive":
      return [root, {label: data.passives?.[selection.passive]?.name || "Passive"}];
    case "power":
    case "status": {
      const power = data.powers?.[selection.power] ?? {};
      const crumbs = [root, {label: power.name || `Power ${selection.power + 1}`, target: {area: "power", power: selection.power}}];
      if (selection.area === "status") crumbs.push({label: power.effects?.[selection.effect]?.status?.name || "Status"});
      return crumbs;
    }
    default:
      return [root];
  }
}

// Falls back to the class's own config when the selected power/passive no
// longer exists.
function effectiveArea(selection, draft) {
  if ((selection.area === "power" || selection.area === "status") && !draft.powers[selection.power]) return "class";
  if (selection.area === "passive" && !draft.passives[selection.passive]) return "class";
  return selection.area;
}

// Layout: header (back link, save bar) across the top; the preview in the
// top-left and the list of areas (class, DPS estimate, action-bar powers,
// passives) in the bottom-left; the selected area's config fills the right
// half. Powers are stored inline - anything copied in from the abilities/
// library, another class, or a unit type is an independent copy (see
// powersEditor/powerSources.js).
export default function ClassEditor({classKey, stockAssets, backUrl}) {
  const ownPath = `classes/${classKey}.json`;
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [selection, setSelection] = useState({area: "class"});
  // A <key>.full.json left over from when powers were $refs - deleted on
  // the next save, since nothing reads it any more.
  const [staleFullPath, setStaleFullPath] = useState(null);
  // Every asset URL the powers reference (icons, graphics, sounds), mapped
  // to its displayable raw.githubusercontent.com URL.
  const [assetMap, setAssetMap] = useState({});
  const [strategy, setStrategy] = useState([]);
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
        const raw = content === null ? blankClass(classKey) : JSON.parse(content);
        const data = await expandPowers(client.current, raw, ownPath);
        if (cancelled) return;
        setDraft(new ClassDraft(data, classKey));

        const classFiles = await client.current.listDirectory("classes");
        if (cancelled) return;
        const fullPath = ownPath.replace(/\.json$/, ".full.json");
        setStaleFullPath(classFiles.includes(fullPath) ? fullPath : null);
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
  }, [classKey, ownPath]);

  // Keyed by the raw url strings so unrelated edits don't re-resolve.
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
  // useValidateThenSave - and any DPS estimate, which no longer describes
  // the draft.
  function handleChange(nextDraft) {
    markDirty();
    setEstimate(null);
    setEstimateError(null);
    setDraft(nextDraft);
  }

  function addPower(ability) {
    const next = draft.addPower(ability);
    if (next === draft) return;
    handleChange(next);
    setSelection({area: "power", power: next.powers.length - 1});
  }

  // The DPS strategy names powers too, so a rename carries through to it.
  function updatePower(index, ability) {
    const oldName = draft.powers[index]?.name;
    if (oldName && oldName !== ability.name) {
      setStrategy((current) => current.map((entry) => (entry.power === oldName ? {...entry, power: ability.name ?? ""} : entry)));
    }
    handleChange(draft.updatePower(index, ability));
  }

  function removePower(index) {
    handleChange(draft.removePower(index));
    powerUploads.removePower(index);
    setSelection({area: "class"});
  }

  function movePower(index, delta) {
    const next = draft.movePower(index, delta);
    if (next === draft) return;
    handleChange(next);
    powerUploads.swapPowers(index, index + delta);
    setSelection((current) => {
      if (current.power === index) return {...current, power: index + delta};
      if (current.power === index + delta) return {...current, power: index};
      return current;
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

  function addPassive() {
    const next = draft.addPassive();
    if (next === draft) return;
    handleChange(next);
    setSelection({area: "passive", passive: next.passives.length - 1});
  }

  function removePassive(index) {
    handleChange(draft.removePassive(index));
    setSelection({area: "class"});
  }

  async function handleValidate() {
    setValidating();
    try {
      const {valid, error} = await validateCharacterClass(draft.data);
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
      setEstimate(await estimateClassDps(draft.data, strategy));
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
      await saveClass(classKey, draft.data, {
        powerFiles: powerUploads.files(),
        deletePaths: staleFullPath ? [staleFullPath] : [],
      }, commitMessage);
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

  if (loadError) return <div className="class-editor-load-error">Failed to load: {loadError}</div>;
  if (draft === null) return <div className="class-editor-loading">Loading…</div>;

  const area = effectiveArea(selection, draft);
  const current = {...selection, area};
  const selectedPower = draft.powers[selection.power];

  function renderConfig() {
    switch (area) {
      case "estimate":
        return (
          <ClassDpsEstimatePanel
            strategy={strategy}
            onStrategyChange={setStrategy}
            powerNames={draft.powerNames}
            estimate={estimate}
            estimating={estimating}
            error={estimateError}
            onEstimate={handleEstimate}
          />
        );
      case "import":
        return (
          <ImportPowerPanel
            sourceTypes={IMPORT_SOURCE_TYPES}
            listSources={(typeId) => sourceType(typeId).listSources(client.current, ownPath)}
            loadPowers={(typeId, sourceId) => sourceType(typeId).loadPowers(client.current, sourceId, ownPath)}
            onImport={addPower}
            full={draft.actionBarFull}
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
      case "passive":
        return (
          <PassivePanel
            key={selection.passive}
            passive={draft.passives[selection.passive]}
            onChange={(status) => handleChange(draft.updatePassive(selection.passive, status))}
            onRemove={() => removePassive(selection.passive)}
            stockAssets={stockAssets}
          />
        );
      default:
        return <ClassFieldsPanel draft={draft} onChange={handleChange} />;
    }
  }

  return (
    <div className="content-editor">
      <header className="content-editor-header">
        {backUrl && <a className="back-link" href={backUrl}>← Back</a>}
        <h1>{classKey}</h1>
        <ValidateSaveBar validity={validity} activity={activity} onValidate={handleValidate} onSave={handleSave} defaultMessage={`Update ${draft.data.name || classKey}`} />
      </header>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <ClassPreviewPane powers={draft.powers} assetMap={assetMap} powerAssetOverrides={powerUploads.overrides} stockAssets={stockAssets} />
        </div>
        <ClassAreaList
          classData={draft.data}
          selection={current}
          onSelect={setSelection}
          onNewPower={() => addPower(blankAbility("new-power"))}
          onMovePower={movePower}
          onNewPassive={addPassive}
        />
      </div>
      <div className="content-editor-fields">
        <Breadcrumbs crumbs={breadcrumbsFor(current, draft.data)} onSelect={setSelection} />
        {renderConfig()}
      </div>
    </div>
  );
}
