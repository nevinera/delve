import {powerSummary} from "./powerSummary";

// The bottom-left list of everything about the unit type that can be
// opened in the right-hand config pane: the unit itself, its damage
// estimate, each power, and the two ways of adding a power.
function AreaButton({selected, onClick, title, detail}) {
  return (
    <button type="button" className={`area-item${selected ? " selected" : ""}`} onClick={onClick} aria-current={selected || undefined}>
      <span className="area-item-title">{title}</span>
      {detail && <span className="area-item-detail">{detail}</span>}
    </button>
  );
}

export default function AreaList({unitTypeData, selection, onSelect, onNewPower}) {
  const area = selection.area;
  const selectedPower = area === "power" || area === "status" ? selection.power : null;

  return (
    <nav className="unit-type-area-list" aria-label="Unit type areas">
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
