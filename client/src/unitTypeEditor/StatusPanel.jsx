import {AbilityDraft} from "../abilityEditor/AbilityDraft";
import StatusEditor from "../abilityEditor/StatusEditor";

// The right-hand config pane for the status applied by one of a power's
// effects, reached from PowerPanel's status summary.
export default function StatusPanel({power, effectIndex, onChange, onRemoveStatus, stockAssets}) {
  const draft = new AbilityDraft(power);
  const status = draft.statusFor(effectIndex);
  if (!status) return <p className="config-empty">This effect has no status.</p>;

  return (
    <div>
      <div className="config-actions">
        <button type="button" className="remove-entry" onClick={onRemoveStatus}>Remove status</button>
      </div>
      <StatusEditor
        status={status}
        onAdd={() => {}}
        onChange={(next) => onChange(draft.setStatus(effectIndex, next).data)}
        stockAssets={stockAssets}
      />
    </div>
  );
}
