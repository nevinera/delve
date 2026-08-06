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
// Per-character claim states are updated in-place (safe: runs in tick goroutine).
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
				claimedBy := item.Claim.ClaimedBy
				if result.ConfirmedOwned {
					state.PendingOwnershipUpdates = append(state.PendingOwnershipUpdates, instancestate.OwnershipUpdate{
						CharacterUnitID: claimedBy,
						ItemIdentifier:  item.Item.Identifier,
					})
				}
				for i := range item.Claims {
					c := &item.Claims[i]
					if c.CharacterUnitID == claimedBy {
						switch {
						case result.Remove:
							c.State = instancestate.LootClaimStateReceived
						case result.ExactVersion:
							c.State = instancestate.LootClaimStateOwned
						case result.ConfirmedOwned:
							c.State = instancestate.LootClaimStateUpgraded
						default:
							c.State = instancestate.LootClaimStateAvailable
						}
					} else if result.Remove {
						c.State = instancestate.LootClaimStateGone
					} else if c.State == instancestate.LootClaimStateLocked {
						c.State = instancestate.LootClaimStateAvailable
					}
				}
				if result.Remove {
					// item consumed - drop from list
				} else {
					if !result.ConfirmedOwned {
						state.PendingLootFailures = append(state.PendingLootFailures, instancestate.LootFailure{
							ClaimedBy: claimedBy,
							Item:      item.Item,
						})
					}
					item.Claim = nil
					kept = append(kept, item)
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
	remove, confirmedOwned, exactVersion, err := inst.RailsClient.AwardItem(
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
	pending.Claim.Result <- instancestate.LootResult{Remove: remove, ConfirmedOwned: confirmedOwned, ExactVersion: exactVersion}
}

type autoUpgradeTarget struct {
	CharacterDatabaseID string
	CharacterUnitID     uuid.UUID
	LootUnitUUID        uuid.UUID
}

type autoUpgradeResult struct {
	CharacterUnitID uuid.UUID
	ItemIdentifier  string
	LootUnitUUID    uuid.UUID
	Success         bool
}

// processLootEvents creates per-character loot claims for each newly-rolled
// item and fires auto-upgrade goroutines for characters who own a prior
// version. Must be called after PendingLootEvents are populated and before
// the tick clears them. No-ops when there are no events.
func (inst *Instance) processLootEvents(ctx context.Context, state *instancestate.InstanceState) {
	if len(state.PendingLootEvents) == 0 {
		return
	}

	type slotSnapshot struct {
		CharacterUnitID     uuid.UUID
		CharacterDatabaseID string
		OwnedZoneItems      map[string]bool
	}
	inst.slotsMu.RLock()
	slots := make([]slotSnapshot, 0, len(inst.slots))
	for _, s := range inst.slots {
		slots = append(slots, slotSnapshot{
			CharacterUnitID:     s.CharacterUnitID,
			CharacterDatabaseID: s.CharacterDatabaseID,
			OwnedZoneItems:      s.OwnedZoneItems,
		})
	}
	inst.slotsMu.RUnlock()

	for _, event := range state.PendingLootEvents {
		unit, ok := state.Units[event.UnitUUID]
		if !ok {
			continue
		}
		if unit.TaggedBy == nil {
			continue // no player contributed to this kill; nothing to claim
		}
		var eligibleSlots []slotSnapshot
		for _, s := range slots {
			if s.CharacterUnitID == *unit.TaggedBy {
				eligibleSlots = append(eligibleSlots, s)
				break
			}
		}
		for i := range unit.LootItems {
			lootItem := &unit.LootItems[i]
			identifier := lootItem.Item.Identifier
			for _, s := range eligibleSlots {
				var claimState instancestate.LootClaimState
				if owned, ok := s.OwnedZoneItems[identifier]; ok {
					if owned {
						claimState = instancestate.LootClaimStateOwned
					} else {
						claimState = instancestate.LootClaimStateUpgrade
						if inst.RailsClient != nil {
							go inst.fireAutoUpgrade(ctx, autoUpgradeTarget{
								CharacterDatabaseID: s.CharacterDatabaseID,
								CharacterUnitID:     s.CharacterUnitID,
								LootUnitUUID:        event.UnitUUID,
							}, lootItem.Item)
						}
					}
				} else {
					claimState = instancestate.LootClaimStateAvailable
				}
				lootItem.Claims = append(lootItem.Claims, instancestate.CharacterLootClaim{
					CharacterUnitID: s.CharacterUnitID,
					State:           claimState,
				})
			}
		}
	}
}

// fireAutoUpgrade calls AwardItem with upgradeOnly=true. Sends an
// autoUpgradeResult to autoUpgradeResultCh whether it succeeds or fails,
// so the tick loop can update the claim state.
func (inst *Instance) fireAutoUpgrade(ctx context.Context, target autoUpgradeTarget, item instanceconfig.Item) {
	_, confirmedOwned, _, err := inst.RailsClient.AwardItem(
		target.CharacterDatabaseID,
		inst.DatabaseID,
		inst.ZoneIdentifier,
		inst.Version,
		item,
		true,
	)
	if err != nil {
		slog.WarnContext(ctx, "auto-upgrade award failed", "error", err, "item", item.Identifier)
	}
	select {
	case inst.autoUpgradeResultCh <- autoUpgradeResult{
		CharacterUnitID: target.CharacterUnitID,
		ItemIdentifier:  item.Identifier,
		LootUnitUUID:    target.LootUnitUUID,
		Success:         err == nil && confirmedOwned,
	}:
	default:
		slog.WarnContext(ctx, "auto-upgrade result channel full, result dropped", "item", item.Identifier)
	}
}
