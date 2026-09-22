package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stateWithPlayerHealth(health, maxHealth float64) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:tester",
		Status:             instancestate.UnitStatusIdle,
		Health:             health,
		MaxHealth:          maxHealth,
	}
	s := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u}}
	return u, s
}

func TestTickHealthRegen_RegeneratesTowardMaxHealth(t *testing.T) {
	u, s := stateWithPlayerHealth(50, 100)

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 50.5, u.Health) // 0.5% of 100 max, over 1s
}

func TestTickHealthRegen_StopsExactlyAtMaxHealth(t *testing.T) {
	u, s := stateWithPlayerHealth(99.8, 100)

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, u.Health)
}

func TestTickHealthRegen_NoOpAtMaxHealth(t *testing.T) {
	u, s := stateWithPlayerHealth(100, 100)

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, u.Health)
}

func TestTickHealthRegen_DeadUnitDoesNotRegen(t *testing.T) {
	u, s := stateWithPlayerHealth(50, 100)
	u.Status = instancestate.UnitStatusDead

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 50.0, u.Health)
}

func TestTickHealthRegen_NPCsDoNotRegen(t *testing.T) {
	u, s := stateWithPlayerHealth(50, 100)
	u.ZoneUnitIdentifier = "goblin_1" // no "player:" prefix

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 50.0, u.Health)
}

func TestTickHealthRegen_ScalesWithRecoveryRating(t *testing.T) {
	u, s := stateWithPlayerHealth(50, 100)
	strength := "strength"
	u.EquippedItems = map[string]instanceconfig.EquippedItem{
		// effective recovery_rating 20 (base secondary 10 * main_hand's 2.0
		// factor) -> +10.30% healing taken.
		"main_hand": {Slot: "main_hand", PrimaryStat: &strength, SecondaryStats: []string{"stamina", "crit_rating", "recovery_rating"}},
	}

	instance.TickHealthRegenForTest(s, instanceconfig.Zone{}, 1.0)

	assert.InDelta(t, 50.5515, u.Health, 0.0001) // 50 + 0.5*1.1030
}
