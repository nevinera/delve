import {StatusDraft} from "../abilityEditor/StatusDraft";
import StatusEditor from "../abilityEditor/StatusEditor";

// The right-hand config pane for one of the class's passives - a Status
// that must stay treatAs: "inherent" (see docs/schema/character_class.md).
export default function PassivePanel({passive, onChange, onRemove, stockAssets}) {
  const status = new StatusDraft(passive);
  return (
    <div>
      <div className="config-actions">
        <button type="button" className="remove-entry" onClick={onRemove}>Remove passive</button>
      </div>
      {passive.treatAs !== "inherent" && (
        <p className="config-warning">Passives must be treated as "inherent" - anything else won't stay hidden.</p>
      )}
      <StatusEditor status={status} onAdd={() => {}} onChange={(next) => onChange(next.data)} stockAssets={stockAssets} />
    </div>
  );
}
