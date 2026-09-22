package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stateWithResourceUnit(resource, defaultValue, returnRate float64) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		Status:               instancestate.UnitStatusIdle,
		Resource:             resource,
		MaxResource:          100.0,
		ResourceDefaultValue: defaultValue,
		ResourceReturnRate:   returnRate,
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}
	return u, s
}

// fullyItemizedMainHand mirrors command's own test helper of the same name
// (unexported there, so duplicated here) - a main_hand item (factor 2.0)
// with raw haste_rating 20 itemized, contributing hastePct 20/11.71 via
// command.UnitCombatStats.
func fullyItemizedMainHand(primary string) instanceconfig.EquippedItem {
	return instanceconfig.EquippedItem{
		Slot:           "main_hand",
		PrimaryStat:    strPtr(primary),
		SecondaryStats: []string{"stamina", "crit_rating", "haste_rating"},
	}
}

func TestTickResourceRegen_RegeneratesUpTowardDefault(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 60.0, u.Resource)
}

func TestTickResourceRegen_DecaysDownTowardDefault(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 0.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 40.0, u.Resource)
}

func TestTickResourceRegen_StopsExactlyAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(95.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, u.Resource)
}

func TestTickResourceRegen_NoOpAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(100.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, u.Resource)
}

func TestTickResourceRegen_NoOpWithZeroReturnRate(t *testing.T) {
	u, s := stateWithResourceUnit(0.0, 0.0, 0.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 0.0, u.Resource)
}

func TestTickResourceRegen_DeadUnitDoesNotRegen(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.Status = instancestate.UnitStatusDead

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 50.0, u.Resource)
}

func TestTickResourceRegen_HasteAffectedScalesRegenByHastePct(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.ResourceHasteAffected = true
	u.DamageStatKey = "strength"
	u.EquippedItems = map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength")}

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	// hastePct = 20/11.71 (see command.TestUnitCombatStats_HasteRatingIncreasesHastePct);
	// step = 10 * (1 + hastePct/100)
	hastePct := 20.0 / 11.71
	assert.InDelta(t, 50.0+10.0*(1+hastePct/100), u.Resource, 0.001)
}

func TestTickResourceRegen_NotHasteAffectedIgnoresHaste(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.DamageStatKey = "strength"
	u.EquippedItems = map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength")}

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 60.0, u.Resource)
}
