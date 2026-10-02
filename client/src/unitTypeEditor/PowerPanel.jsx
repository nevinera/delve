import {AbilityDraft} from "../abilityEditor/AbilityDraft";
import AbilityFieldsPanel from "../abilityEditor/AbilityFieldsPanel";
import {statusSummary} from "./powerSummary";

// The right-hand config pane for one of the unit type's inline powers -
// the ability editor's own fields panel, except a status effect's status
// shows as a summary that opens it in its own pane (see StatusPanel)
// rather than nesting a whole status editor inline.
export default function PowerPanel({
  power, onChange, onRemovePower, onOpenStatus,
  assetOverrides, onUploadAsset, onClearAsset, onRemoveEntry, stockAssets,
}) {
  const draft = new AbilityDraft(power);

  function renderStatus(effectIndex) {
    const status = power.effects?.[effectIndex]?.status;
    if (!status) {
      return (
        <button
          type="button" className="add-entry"
          onClick={() => {
            onChange(draft.addStatus(effectIndex).data);
            onOpenStatus(effectIndex);
          }}
        >
          + Add status
        </button>
      );
    }
    return (
      <div className="status-summary">
        <div>
          <div className="status-summary-name">{status.name || "(unnamed status)"}</div>
          <div className="status-summary-detail">{statusSummary(status)}</div>
        </div>
        <button type="button" className="add-entry" onClick={() => onOpenStatus(effectIndex)}>Edit status ›</button>
      </div>
    );
  }

  return (
    <div>
      <div className="config-actions">
        <button type="button" className="remove-entry" onClick={onRemovePower}>Remove power</button>
      </div>
      <AbilityFieldsPanel
        draft={draft}
        onChange={(next) => onChange(next.data)}
        assetOverrides={assetOverrides}
        onUploadAsset={onUploadAsset}
        onClearAsset={onClearAsset}
        onRemoveEntry={onRemoveEntry}
        stockAssets={stockAssets}
        renderStatus={renderStatus}
      />
    </div>
  );
}
