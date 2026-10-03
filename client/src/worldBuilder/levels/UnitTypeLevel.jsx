import UnitTypeWorkbench from "../../unitTypeEditor/UnitTypeWorkbench";
import {collectAssetUrls} from "../../abilityEditor/collectAssetUrls";
import {currentFieldValue} from "../../abilityEditor/resolveAbilityForPlayback";
import {unitTypeData, unitTypeKeys, updateUnitType} from "../state/unitTypeOps";
import {inMemory, newAssetPath, pendingPowerAssets, tokenImageOptions, uploadPowerAsset} from "../state/assetOps";
import {relativePath, resolvePath, unitTypeFile} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";

// Copying a power from another of this world's unit types: same directory,
// so its asset URLs need no rebasing.
function worldPowerSources(draft, unitType) {
  return {
    types: [{id: "world", label: "This world's unit types"}],
    listSources: async () => unitTypeKeys(draft).filter((key) => key !== unitType)
      .map((key) => ({id: key, label: unitTypeData(draft, key).name || key})),
    loadPowers: async (_typeId, key) => unitTypeData(draft, key)?.powers ?? [],
  };
}

// The unit-type level: the unit-type editor's surface (UnitTypeWorkbench)
// over one unit type's file in the live draft. Token and power asset
// uploads go into the draft (under the world's tokens/unit/, graphics/ and
// audio/) like any other change; "Restore" on a power asset drops its
// pending upload.
export default function UnitTypeLevel({draft, unitType, onChange, repo, stockAssets}) {
  const path = unitTypeFile(draft.worldKey, unitType);
  const data = unitTypeData(draft, unitType);
  const assetUrl = (repoPath) => assetUrlFor(draft, repo, repoPath);
  const urlFor = (value) => assetUrl(resolvePath(path, value));

  const tokenImages = {
    options: tokenImageOptions(draft, path, assetUrl),
    urlFor,
    upload: async (file) => {
      const blob = await inMemory(file);
      const target = newAssetPath(draft, "tokens/unit", file.name);
      onChange((current) => current.write(target, blob));
      return relativePath(path, target);
    },
  };

  const powerAssets = {
    overrides: pendingPowerAssets(draft, path, data.powers, assetUrl),
    upload: async (powerIndex, key, file) => {
      const blob = await inMemory(file);
      onChange((current) => {
        const latest = unitTypeData(current, unitType);
        const power = latest.powers[powerIndex];
        const [next, nextPower] = uploadPowerAsset(current, path, power, key, blob, file.name);
        if (nextPower === power) return next;
        return updateUnitType(next, unitType, {...latest, powers: latest.powers.map((p, i) => (i === powerIndex ? nextPower : p))});
      });
    },
    clear: (powerIndex, key) => onChange((current) => {
      const value = currentFieldValue(unitTypeData(current, unitType).powers[powerIndex], key);
      return value ? current.revert(resolvePath(path, value)) : current;
    }),
    // Pending uploads live at their paths in the draft, not by index.
    removeEntry: () => {},
    removePower: () => {},
  };

  const assetMap = Object.fromEntries([...new Set(collectAssetUrls(data.powers ?? []))].map((url) => [url, urlFor(url)]));

  return (
    <UnitTypeWorkbench
      key={unitType}
      unitTypeKey={unitType}
      data={data}
      onChange={(next) => onChange((current) => updateUnitType(current, unitType, next))}
      tokenImages={tokenImages}
      assetMap={assetMap}
      powerAssets={powerAssets}
      importSources={worldPowerSources(draft, unitType)}
      stockAssets={stockAssets}
    />
  );
}
