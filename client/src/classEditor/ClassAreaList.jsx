import AreaButton from "../powersEditor/AreaButton";
import {powerSummary, statusSummary} from "../powersEditor/powerSummary";
import {MAX_PASSIVES, SLOT_COUNT} from "./classFieldOptions";

// The bottom-left list of everything about the class that can be opened
// in the right-hand config pane: the class itself, its DPS estimate, each
// action-bar power (in slot order, reorderable), each passive, and the
// ways of adding either.
export default function ClassAreaList({classData, selection, onSelect, onNewPower, onMovePower, onNewPassive}) {
  const area = selection.area;
  const powers = classData.powers ?? [];
  const passives = classData.passives ?? [];
  const selectedPower = area === "power" || area === "status" ? selection.power : null;
  const actionBarFull = powers.length >= SLOT_COUNT;

  return (
    <nav className="area-list" aria-label="Class areas">
      <AreaButton selected={area === "class"} onClick={() => onSelect({area: "class"})} title={classData.name || "Class"} detail="Class" />
      <AreaButton selected={area === "estimate"} onClick={() => onSelect({area: "estimate"})} title="DPS and survivability" />

      <div className="area-list-heading">Action bar <span className="area-list-count">{powers.length}/{SLOT_COUNT}</span></div>
      {powers.map((power, i) => (
        <AreaButton
          key={i}
          selected={selectedPower === i}
          onClick={() => onSelect({area: "power", power: i})}
          title={`${i + 1}. ${power.name || `Power ${i + 1}`}`}
          detail={powerSummary(power)}
        >
          <span className="area-item-order">
            <button type="button" aria-label={`Move ${power.name || `power ${i + 1}`} up`} disabled={i === 0} onClick={() => onMovePower(i, -1)}>↑</button>
            <button type="button" aria-label={`Move ${power.name || `power ${i + 1}`} down`} disabled={i === powers.length - 1} onClick={() => onMovePower(i, 1)}>↓</button>
          </span>
        </AreaButton>
      ))}
      <div className="area-list-actions">
        <button type="button" className="add-entry" disabled={actionBarFull} onClick={onNewPower}>+ New power</button>
        <button
          type="button" className={`add-entry${area === "import" ? " selected" : ""}`}
          disabled={actionBarFull} onClick={() => onSelect({area: "import"})}
        >
          + Import power
        </button>
      </div>

      <div className="area-list-heading">Passives <span className="area-list-count">{passives.length}/{MAX_PASSIVES}</span></div>
      {passives.map((passive, i) => (
        <AreaButton
          key={i}
          selected={area === "passive" && selection.passive === i}
          onClick={() => onSelect({area: "passive", passive: i})}
          title={passive.name || `Passive ${i + 1}`}
          detail={statusSummary(passive)}
        />
      ))}
      <div className="area-list-actions">
        <button type="button" className="add-entry" disabled={passives.length >= MAX_PASSIVES} onClick={onNewPassive}>+ New passive</button>
      </div>
    </nav>
  );
}
