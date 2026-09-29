package instance_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestUpdateCombatStats_SetsStatsOnEveryUnit(t *testing.T) {
	state := stateWithUnit(t)
	for _, u := range state.Units {
		require.Nil(t, u.CombatStats)
	}

	instance.UpdateCombatStatsForTest(state, goblinZone())

	require.NotEmpty(t, state.Units)
	for _, u := range state.Units {
		require.NotNil(t, u.CombatStats)
	}
}

func TestUpdateCombatStats_ReplacesStatsWhenStatusesChange(t *testing.T) {
	state := stateWithUnit(t)
	var unit *instancestate.UnitState
	for _, u := range state.Units {
		unit = u
	}
	instance.UpdateCombatStatsForTest(state, goblinZone())
	before := unit.CombatStats
	assert.Zero(t, before.Physical.HastePct)

	unit.ActiveStatusEffects = append(unit.ActiveStatusEffects, instancestate.ActiveStatusEffect{
		Status: instanceconfig.Status{Name: "swift", Effects: []instanceconfig.StatusEffect{
			{Type: "stat", StatName: "physicalHaste", ModifierType: "add", Amount: 15},
		}},
	})
	instance.UpdateCombatStatsForTest(state, goblinZone())

	assert.InDelta(t, 15.0, unit.CombatStats.Physical.HastePct, 0.001)
	assert.Zero(t, before.Physical.HastePct, "the earlier snapshot is not mutated in place")
}
