package instance

import (
	"context"
	"log/slog"

	"github.com/google/uuid"
)

// RefreshEquippedItems fetches the character's current equipped items from
// Rails and updates the slot, recomputing Stats. Intended to be run in a
// goroutine by the caller so it does not block the websocket read loop.
func (inst *Instance) RefreshEquippedItems(ctx context.Context, unitID uuid.UUID) {
	slot := inst.slotByUnitID(unitID)
	if slot == nil || inst.RailsClient == nil {
		if inst.RailsClient == nil {
			slog.WarnContext(ctx, "no Rails client configured; equipment refresh skipped")
		}
		return
	}
	items, err := inst.RailsClient.FetchEquippedItems(slot.CharacterDatabaseID)
	if err != nil {
		slog.WarnContext(ctx, "failed to refresh equipped items", "error", err, "character", slot.CharacterDatabaseID)
		return
	}
	inst.slotsMu.Lock()
	defer inst.slotsMu.Unlock()
	slot.EquippedItems = items
	slot.recomputeStats()
}
