package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// LootItemHandler claims one item from a lootable unit, marking it in-flight
// while the tick loop fires a goroutine to award it via the Rails API.
type LootItemHandler struct{}

func (LootItemHandler) Type() string      { return "loot_item" }
func (LootItemHandler) Deduplicate() bool { return false }

func (LootItemHandler) Handle(unitID uuid.UUID, payload CommandPayload, next *instancestate.InstanceState) error {
	p, ok := payload.(LootItemPayload)
	if !ok {
		return nil
	}
	target, ok := next.Units[p.TargetUnitID]
	if !ok || target.Status != instancestate.UnitStatusDead {
		return nil
	}
	if p.ItemIndex < 0 || p.ItemIndex >= len(target.LootItems) {
		return nil
	}
	item := &target.LootItems[p.ItemIndex]
	if item.Claim != nil {
		return nil // already claimed by someone
	}
	claim := &instancestate.LootClaim{
		ClaimedBy: unitID,
		Result:    make(chan instancestate.LootResult, 1),
	}
	item.Claim = claim
	next.PendingLootClaims = append(next.PendingLootClaims, instancestate.PendingLootClaim{
		TargetUnitID: p.TargetUnitID,
		Claim:        claim,
		Item:         item.Item,
	})
	return nil
}
