import UnitTypeLevel from "./UnitTypeLevel";
import {unitTypeData} from "../state/unitTypeOps";

// The unit-type editor over the map level, for a unit type just created
// from the Units tab - the same level the world's list opens, in a modal.
export default function UnitTypeModal({draft, unitType, onChange, repo, stockAssets, library, onDone}) {
  return (
    <div className="unit-type-modal-backdrop">
      <div className="content-editor unit-type-modal" role="dialog" aria-label={`Edit unit type ${unitType}`}>
        <header className="content-editor-header">
          <h1>Unit type: {unitTypeData(draft, unitType)?.name || unitType}</h1>
          <span className="header-spacer" />
          <button type="button" className="add-entry" onClick={onDone}>Done</button>
        </header>
        <UnitTypeLevel draft={draft} unitType={unitType} onChange={onChange} repo={repo} stockAssets={stockAssets} library={library} />
      </div>
    </div>
  );
}
