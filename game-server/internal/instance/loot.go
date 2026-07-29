package instance

import (
	"context"
	"log/slog"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// sweepLootClaims checks every in-flight loot claim for a settled result.
// On success the item is removed; on failure the claim is cleared so the item
// becomes available again and a LootFailure is recorded for the delta message.
// Called once per tick before building the delta.
func sweepLootClaims(state *instancestate.InstanceState) {
	for _, unit := range state.Units {
		kept := unit.LootItems[:0]
		for _, item := range unit.LootItems {
			if item.Claim == nil {
				kept = append(kept, item)
				continue
			}
			select {
			case ok := <-item.Claim.Result:
				if !ok {
					state.PendingLootFailures = append(state.PendingLootFailures, instancestate.LootFailure{
						ClaimedBy: item.Claim.ClaimedBy,
						Item:      item.Item,
					})
					item.Claim = nil
					kept = append(kept, item) // put back as available
				}
				// ok == true: item consumed, drop from list
			default:
				kept = append(kept, item) // still in flight
			}
		}
		unit.LootItems = kept
	}
}

// fireLootAward runs as a goroutine for each new PendingLootClaim. It looks
// up the claiming character's database ID, posts to Rails, then sends the
// result on the claim's channel so the next tick's sweep can finalise it.
func (inst *Instance) fireLootAward(ctx context.Context, pending instancestate.PendingLootClaim) {
	slot := inst.slotByUnitID(pending.Claim.ClaimedBy)
	if slot == nil || inst.RailsClient == nil {
		if inst.RailsClient == nil {
			slog.WarnContext(ctx, "no Rails client configured; loot award skipped", "item", pending.Item.Identifier)
		}
		pending.Claim.Result <- false
		return
	}
	err := inst.RailsClient.AwardItem(
		slot.CharacterDatabaseID,
		inst.DatabaseID,
		inst.ZoneIdentifier,
		inst.Version,
		pending.Item,
	)
	if err != nil {
		slog.WarnContext(ctx, "loot award failed", "error", err, "item", pending.Item.Identifier, "character", slot.CharacterDatabaseID)
		pending.Claim.Result <- false
		return
	}
	pending.Claim.Result <- true
}

