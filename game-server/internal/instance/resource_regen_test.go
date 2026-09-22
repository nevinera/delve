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
		Status: instancestate.UnitStatusIdle,
		Resources: map[string]*instancestate.ResourceState{
			"energy": {Current: resource, Max: 100.0, DefaultValue: defaultValue, ReturnRate: returnRate},
		},
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}
	return u, s
}

func energy(u *instancestate.UnitState) float64 { return u.Resources["energy"].Current }

// setEnergy gives unit an "energy" resource with the given current/max -
// shared by resource_regen_test.go and unit_behavior_test.go (same package).
func setEnergy(u *instancestate.UnitState, current, max float64) {
	u.Resources = map[string]*instancestate.ResourceState{"energy": {Current: current, Max: max}}
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

	assert.Equal(t, 60.0, energy(u))
}

func TestTickResourceRegen_DecaysDownTowardDefault(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 0.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 40.0, energy(u))
}

func TestTickResourceRegen_StopsExactlyAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(95.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, energy(u))
}

func TestTickResourceRegen_NoOpAtDefaultValue(t *testing.T) {
	u, s := stateWithResourceUnit(100.0, 100.0, 10.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, energy(u))
}

func TestTickResourceRegen_NoOpWithZeroReturnRate(t *testing.T) {
	u, s := stateWithResourceUnit(0.0, 0.0, 0.0)

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 0.0, energy(u))
}

func TestTickResourceRegen_DeadUnitDoesNotRegen(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.Status = instancestate.UnitStatusDead

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 50.0, energy(u))
}

func TestTickResourceRegen_EachResourceOnAUnitRegensIndependently(t *testing.T) {
	u := &instancestate.UnitState{
		Status: instancestate.UnitStatusIdle,
		Resources: map[string]*instancestate.ResourceState{
			"energy":       {Current: 50, Max: 100, DefaultValue: 100, ReturnRate: 10},
			"combo points": {Current: 3, Max: 5, DefaultValue: 0, ReturnRate: 0},
		},
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 60.0, u.Resources["energy"].Current)
	// returnRate 0 (e.g. a discrete resource like combo points) never
	// passively changes, regardless of DefaultValue.
	assert.Equal(t, 3.0, u.Resources["combo points"].Current)
}

func TestTickResourceRegen_HasteAffectedScalesRegenByHastePct(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.Resources["energy"].HasteAffected = true
	u.DamageStatKey = "strength"
	u.EquippedItems = map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength")}

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	// hastePct = 20/11.71 (see command.TestUnitCombatStats_HasteRatingIncreasesHastePct);
	// step = 10 * (1 + hastePct/100)
	hastePct := 20.0 / 11.71
	assert.InDelta(t, 50.0+10.0*(1+hastePct/100), energy(u), 0.001)
}

func TestTickResourceRegen_NotHasteAffectedIgnoresHaste(t *testing.T) {
	u, s := stateWithResourceUnit(50.0, 100.0, 10.0)
	u.DamageStatKey = "strength"
	u.EquippedItems = map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength")}

	instance.TickResourceRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 60.0, energy(u))
}
