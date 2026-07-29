package command

import (
	"github.com/google/uuid"

	"github.com/delve-mmo/game-server/internal/instancestate"
)

// LootItemHandler removes one item from a lootable unit's LootItems slice.
// The item is not yet awarded to the player - that will come later.
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
	target.LootItems = append(target.LootItems[:p.ItemIndex], target.LootItems[p.ItemIndex+1:]...)
	return nil
}
