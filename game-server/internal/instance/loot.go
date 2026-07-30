package instance

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
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
			case result := <-item.Claim.Result:
				if result.ConfirmedOwned {
					state.PendingOwnershipUpdates = append(state.PendingOwnershipUpdates, instancestate.OwnershipUpdate{
						CharacterUnitID: item.Claim.ClaimedBy,
						ItemIdentifier:  item.Item.Identifier,
					})
				}
				if result.Remove {
					// item consumed, drop from list
				} else {
					if !result.ConfirmedOwned {
						state.PendingLootFailures = append(state.PendingLootFailures, instancestate.LootFailure{
							ClaimedBy: item.Claim.ClaimedBy,
							Item:      item.Item,
						})
					}
					item.Claim = nil
					kept = append(kept, item) // put back as available
				}
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
		pending.Claim.Result <- instancestate.LootResult{}
		return
	}
	remove, confirmedOwned, err := inst.RailsClient.AwardItem(
		slot.CharacterDatabaseID,
		inst.DatabaseID,
		inst.ZoneIdentifier,
		inst.Version,
		pending.Item,
		false,
	)
	if err != nil {
		slog.WarnContext(ctx, "loot award failed", "error", err, "item", pending.Item.Identifier, "character", slot.CharacterDatabaseID)
		pending.Claim.Result <- instancestate.LootResult{}
		return
	}
	pending.Claim.Result <- instancestate.LootResult{Remove: remove, ConfirmedOwned: confirmedOwned}
}

type autoUpgradeTarget struct {
	CharacterDatabaseID string
	CharacterUnitID     uuid.UUID
}

// checkAutoUpgrades fires goroutines for each (slot, item) pair where the slot
// has a prior version of the item (OwnedZoneItems[id] == false). Called each
// tick after PendingLootEvents are populated. No-ops if RailsClient is nil.
func (inst *Instance) checkAutoUpgrades(ctx context.Context, state *instancestate.InstanceState) {
	if inst.RailsClient == nil {
		return
	}
	for _, event := range state.PendingLootEvents {
		for _, item := range event.Items {
			targets := inst.slotsNeedingUpgrade(item.Identifier)
			for _, t := range targets {
				go inst.fireAutoUpgrade(ctx, t, item)
			}
		}
	}
}

func (inst *Instance) slotsNeedingUpgrade(identifier string) []autoUpgradeTarget {
	inst.slotsMu.RLock()
	defer inst.slotsMu.RUnlock()
	var result []autoUpgradeTarget
	for _, s := range inst.slots {
		if owned, ok := s.OwnedZoneItems[identifier]; ok && !owned {
			result = append(result, autoUpgradeTarget{
				CharacterDatabaseID: s.CharacterDatabaseID,
				CharacterUnitID:     s.CharacterUnitID,
			})
		}
	}
	return result
}

// fireAutoUpgrade calls AwardItem with upgradeOnly=true. On success it sends
// an OwnershipUpdate to autoUpgradeResultCh for the tick loop to apply.
func (inst *Instance) fireAutoUpgrade(ctx context.Context, target autoUpgradeTarget, item instanceconfig.Item) {
	_, confirmedOwned, err := inst.RailsClient.AwardItem(
		target.CharacterDatabaseID,
		inst.DatabaseID,
		inst.ZoneIdentifier,
		inst.Version,
		item,
		true,
	)
	if err != nil {
		slog.WarnContext(ctx, "auto-upgrade award failed", "error", err, "item", item.Identifier)
		return
	}
	if !confirmedOwned {
		return
	}
	select {
	case inst.autoUpgradeResultCh <- instancestate.OwnershipUpdate{
		CharacterUnitID: target.CharacterUnitID,
		ItemIdentifier:  item.Identifier,
	}:
	default:
		slog.WarnContext(ctx, "auto-upgrade result channel full, ownership update dropped", "item", item.Identifier)
	}
}
