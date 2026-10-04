import {useState} from "react";
import {UnitTypeDraft} from "./UnitTypeDraft";
import UnitTypePreviewPane from "./UnitTypePreviewPane";
import UnitTypeFieldsPanel from "./UnitTypeFieldsPanel";
import DamageEstimatePanel from "./DamageEstimatePanel";
import AreaList from "./AreaList";
import PowerPanel from "../powersEditor/PowerPanel";
import StatusPanel from "../powersEditor/StatusPanel";
import ImportPowerPanel from "../powersEditor/ImportPowerPanel";
import Breadcrumbs from "../powersEditor/Breadcrumbs";
import {estimateDamage} from "./estimateDamage";
import {AbilityDraft} from "../abilityEditor/AbilityDraft";
import {blankAbility} from "../abilityEditor/blankAbility";

// tokenImageUrl is schema-legal as a bare string (see docs/schema/unit_type.md)
// and real content uses that form - but the editor always edits it as an
// array (a one-entry array behaves identically for every consumer).
export function normalizeUnitType(unitType) {
  const url = unitType.tokenImageUrl;
  if (Array.isArray(url)) return unitType;
  return {...unitType, tokenImageUrl: url ? [url] : []};
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

// The unit-type editor's editing surface: the preview and the list of
// areas (unit, damage estimate, each power, add/import) on the left, the
// selected area's config on the right - rendered as those two columns, for
// the host's own grid. It has no idea where the unit type comes from or
// goes: the world editor's unit-type level hosts it over the draft.
//
// Host props:
// - data (tokenImageUrl already an array - see normalizeUnitType) and
//   onChange(nextData).
// - tokenImages {options, urlFor(value), upload(file)}: the token picker's
//   images (see content/ImagePicker), what a slot's value displays as, and
//   storing an upload (resolving to its slot value).
// - assetMap: each power asset URL (as written) -> displayable URL.
// - powerAssets: pending power asset uploads, usePowerUploads' shape
//   ({overrides, upload, clear, removeEntry, removePower}).
// - importSources {types, listSources(typeId), loadPowers(typeId, sourceId),
//   adopt?(power)}: where powers can be copied from; adopt, if given, is
//   called with the power being imported and returns what to add.
// - stockAssets.
export default function UnitTypeWorkbench({unitTypeKey, data, onChange, tokenImages, assetMap, powerAssets, importSources, stockAssets}) {
  const draft = new UnitTypeDraft(data, unitTypeKey);
  const [selection, setSelection] = useState({area: "unit"});
  // The estimate describes the data it was made from; any edit drops it.
  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState(null);

  function handleChange(nextDraft) {
    setEstimate(null);
    setEstimateError(null);
    onChange(nextDraft.data);
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
    powerAssets.removePower(index);
    setSelection((current) => {
      if (current.power === undefined || current.power < index) return current;
      if (current.power === index) return {area: "unit"};
      return {...current, power: current.power - 1};
    });
  }

  function removePowerEntry(powerIndex, section, index) {
    updatePower(powerIndex, new AbilityDraft(draft.powers[powerIndex]).removeEntry(section, index).data);
    powerAssets.removeEntry(powerIndex, section, index);
  }

  function removeStatus(powerIndex, effectIndex) {
    updatePower(powerIndex, new AbilityDraft(draft.powers[powerIndex]).removeStatus(effectIndex).data);
    setSelection({area: "power", power: powerIndex});
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

  const tokenPreviewUrls = Object.fromEntries(draft.tokenImageUrls.filter(Boolean).map((url) => [url, tokenImages.urlFor(url)]));
  const selectedPower = selection.power === undefined ? null : draft.powers[selection.power];
  const area = (selection.area === "power" || selection.area === "status") && !selectedPower ? "unit" : selection.area;

  function renderConfig() {
    switch (area) {
      case "estimate":
        return <DamageEstimatePanel estimate={estimate} estimating={estimating} error={estimateError} onEstimate={handleEstimate} unitType={draft.data} />;
      case "import":
        return (
          <ImportPowerPanel
            sourceTypes={importSources.types}
            listSources={importSources.listSources}
            loadPowers={importSources.loadPowers}
            onImport={(power) => addPower(importSources.adopt ? importSources.adopt(power) : power)}
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
            assetOverrides={powerAssets.overrides[selection.power] ?? {}}
            onUploadAsset={(field, file) => powerAssets.upload(selection.power, field, file)}
            onClearAsset={(field) => powerAssets.clear(selection.power, field)}
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
        return <UnitTypeFieldsPanel draft={draft} onChange={handleChange} tokenImages={tokenImages} />;
    }
  }

  return (
    <>
      <div className="content-editor-left">
        <div className="content-editor-preview">
          <UnitTypePreviewPane
            unitTypeData={draft.data}
            assetMap={assetMap}
            powerAssetOverrides={powerAssets.overrides}
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
    </>
  );
}
