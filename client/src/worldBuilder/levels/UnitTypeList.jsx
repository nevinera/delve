import ContentList from "./ContentList";
import ImportForm from "./ImportForm";
import {createUnitType, deleteUnitType, renameUnitType, unitTypeData, unitTypeKeys, unitTypeUses} from "../state/unitTypeOps";
import {libraryUnitTypes, prepareUnitTypeImport} from "../state/importing";
import {resolvePath, unitTypeFile} from "../state/worldPaths";
import {assetUrlFor} from "../state/assetUrls";

// The world's own unit types (see ContentList): rename rewrites every map
// unit and zone entry using it; delete is refused while it's placed.
export default function UnitTypeList({draft, onChange, onOpen, repo, library}) {
  function describe(key) {
    const data = unitTypeData(draft, key);
    const placed = unitTypeUses(draft, key).reduce((sum, {count}) => sum + count, 0);
    const first = data.tokenImageUrl[0];
    const thumbUrl = first && !first.startsWith(":") ? assetUrlFor(draft, repo, resolvePath(unitTypeFile(draft.worldKey, key), first)) : null;
    return {name: data.name, detail: placed ? `${placed} placed` : "not placed", thumbUrl};
  }

  return (
    <ContentList
      title="Unit types" noun="unit type" keys={unitTypeKeys(draft)} describe={describe}
      create={(key, name) => createUnitType(draft, key, name)}
      rename={(from, to) => renameUnitType(draft, from, to)}
      remove={(key) => deleteUnitType(draft, key)}
      onChange={onChange} onOpen={onOpen}
      renderImport={library && ((props) => (
        <ImportForm noun="unit type" draft={draft} library={library} list={libraryUnitTypes} prepare={prepareUnitTypeImport} onChange={onChange} {...props} />
      ))}
    />
  );
}
