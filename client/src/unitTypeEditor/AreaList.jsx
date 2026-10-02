import AreaButton from "../powersEditor/AreaButton";
import {powerSummary} from "../powersEditor/powerSummary";

// The bottom-left list of everything about the unit type that can be
// opened in the right-hand config pane: the unit itself, its damage
// estimate, each power, and the two ways of adding a power.
export default function AreaList({unitTypeData, selection, onSelect, onNewPower}) {
  const area = selection.area;
  const selectedPower = area === "power" || area === "status" ? selection.power : null;

  return (
    <nav className="area-list" aria-label="Unit type areas">
      <AreaButton selected={area === "unit"} onClick={() => onSelect({area: "unit"})} title={unitTypeData.name || "Unit"} detail="Unit" />
      <AreaButton selected={area === "estimate"} onClick={() => onSelect({area: "estimate"})} title="Damage estimate" />
      <div className="area-list-heading">Powers</div>
      {(unitTypeData.powers ?? []).map((power, i) => (
        <AreaButton
          key={i}
          selected={selectedPower === i}
          onClick={() => onSelect({area: "power", power: i})}
          title={power.name || `Power ${i + 1}`}
          detail={powerSummary(power)}
        />
      ))}
      <div className="area-list-actions">
        <button type="button" className="add-entry" onClick={onNewPower}>+ New power</button>
        <button type="button" className={`add-entry${area === "import" ? " selected" : ""}`} onClick={() => onSelect({area: "import"})}>
          + Import power
        </button>
      </div>
    </nav>
  );
}
