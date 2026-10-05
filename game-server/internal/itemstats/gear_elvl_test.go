package itemstats_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/itemstats"
)

func TestGearElvl_FullSetAtOneElvl(t *testing.T) {
	pieces := map[string]itemstats.GearPiece{}
	for _, slot := range itemstats.EquippedSlots {
		itemSlot := slot
		if slot == "ring_1" || slot == "ring_2" {
			itemSlot = "ring"
		}
		pieces[slot] = itemstats.GearPiece{Slot: itemSlot, Elvl: 12}
	}
	assert.InDelta(t, 12.0, itemstats.GearElvl(pieces), 1e-9)
}

func TestGearElvl_EmptySlotsCountAsZero(t *testing.T) {
	// Weights: 1.5*3 + 1*9 + 2*2 = 17.5. A lone elvl-35 chest (1.5) gives 52.5/17.5.
	pieces := map[string]itemstats.GearPiece{"chest": {Slot: "chest", Elvl: 35}}
	assert.InDelta(t, 3.0, itemstats.GearElvl(pieces), 1e-9)
}

func TestGearElvl_TwoHanderWeighsByItemSlot(t *testing.T) {
	// The two-hander in main_hand weighs 4 instead of 2: total 19.5.
	pieces := map[string]itemstats.GearPiece{"main_hand": {Slot: "two_hand", Elvl: 39}}
	assert.InDelta(t, 8.0, itemstats.GearElvl(pieces), 1e-9)
}

func TestGearElvl_Naked(t *testing.T) {
	assert.Equal(t, 0.0, itemstats.GearElvl(nil))
}
