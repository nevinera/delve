package itemstats_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/itemstats"
)

func strPtr(s string) *string { return &s }

func TestRaw_FullyItemizedHead(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "head",
		Primary:     strPtr("strength"),
		Secondaries: []string{"crit_rating", "haste_rating", "stamina"},
	})

	assert.InDelta(t, 22.5, stats["strength"], 0.01)
	assert.InDelta(t, 15, stats["crit_rating"], 0.01)
	assert.InDelta(t, 15, stats["haste_rating"], 0.01)
	// itemized stamina (15) + base armor-slot stamina (15)
	assert.InDelta(t, 30, stats["stamina"], 0.01)
}

func TestRaw_BaseStaminaOnArmorSlotsEvenWithoutItemizedStamina(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "waist",
		Primary:     strPtr("strength"),
		Secondaries: []string{"haste_rating"},
	})
	assert.InDelta(t, 10, stats["stamina"], 0.01)
}

func TestRaw_NoBaseStaminaOnRingsNecksWeapons(t *testing.T) {
	for _, slot := range []string{"ring", "neck", "main_hand"} {
		stats := itemstats.Raw(itemstats.Allocation{Slot: slot})
		assert.Equal(t, 0.0, stats["stamina"], "slot %s", slot)
	}
}

func TestRaw_TwoHandFactor(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "two_hand",
		Primary:     strPtr("strength"),
		Secondaries: []string{"stamina", "crit_rating", "haste_rating"},
	})
	assert.InDelta(t, 60, stats["strength"], 0.01)
}

func TestRaw_RedistributionPrimaryOnlyMissing(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "chest",
		Secondaries: []string{"crit_rating", "haste_rating", "versatility_rating"},
	})
	assert.InDelta(t, 19.0, stats["crit_rating"], 0.05)
	assert.InDelta(t, 19.0, stats["haste_rating"], 0.05)
	assert.InDelta(t, 19.0, stats["versatility_rating"], 0.05)
}

func TestRaw_RedistributionPrimaryAndSecondaryMissing(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "chest",
		Secondaries: []string{"crit_rating", "haste_rating"},
	})
	assert.InDelta(t, 25.5, stats["crit_rating"], 0.05)
	assert.InDelta(t, 25.5, stats["haste_rating"], 0.05)
}

func TestRaw_RedistributionSecondaryMissingBoostsPrimary(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "waist",
		Primary:     strPtr("strength"),
		Secondaries: []string{"haste_rating"},
	})
	assert.InDelta(t, 15*1.3, stats["strength"], 0.05)
	assert.InDelta(t, 10*1.3, stats["haste_rating"], 0.05)
}

func TestRaw_RingNeverHasPrimary(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "ring",
		Secondaries: []string{"crit_rating", "haste_rating"},
	})
	assert.InDelta(t, 10, stats["crit_rating"], 0.01)
	assert.InDelta(t, 10, stats["haste_rating"], 0.01)
}

func TestRaw_ShieldFixedDefenceComponent(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{Slot: "off_hand", Shield: true})
	assert.InDelta(t, 75, stats["defence_rating"], 0.01)
}

func TestRaw_ShieldAddsItemizedOnTopOfFixedComponent(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "off_hand",
		Shield:      true,
		Secondaries: []string{"defence_rating", "stamina", "mastery_rating"},
	})
	assert.InDelta(t, 75+20, stats["defence_rating"], 0.01)
	assert.InDelta(t, 20, stats["stamina"], 0.01)
	assert.InDelta(t, 20, stats["mastery_rating"], 0.01)
}

func TestRaw_ShieldFixedComponentNotCountedAsFilledForRedistribution(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{
		Slot:        "off_hand",
		Shield:      true,
		Secondaries: []string{"stamina"},
	})
	assert.InDelta(t, 10*2.0*2.2, stats["stamina"], 0.05)
}

func TestRaw_CompletelyUnitemizedItem(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{Slot: "chest"})
	assert.Equal(t, 0.0, stats["strength"])
	assert.Equal(t, 0.0, stats["crit_rating"])
	assert.InDelta(t, 15, stats["stamina"], 0.01)
}

func TestRaw_UnknownSlotReturnsEmpty(t *testing.T) {
	stats := itemstats.Raw(itemstats.Allocation{Slot: "trinket"})
	assert.Empty(t, stats)
}
