package instance_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// stateWithComputedUnit returns a state whose single unit has computed
// CombatStats, and the unit itself. asPlayer renames it to a player unit.
func stateWithComputedUnit(t *testing.T, asPlayer bool) (*instancestate.InstanceState, *instancestate.UnitState) {
	t.Helper()
	s := stateWithUnit(t)
	var unit *instancestate.UnitState
	for _, u := range s.Units {
		unit = u
	}
	if asPlayer {
		unit.ZoneUnitIdentifier = "player:hero"
	}
	instance.UpdateCombatStatsForTest(s, goblinZone())
	return s, unit
}

func onlyUnit(t *testing.T, msg map[string]any, key string) map[string]any {
	t.Helper()
	units := msg[key].(map[string]any)
	require.Len(t, units, 1)
	for _, u := range units {
		return u.(map[string]any)
	}
	return nil
}

func TestFullStateMsg_IncludesCombatStatsForPlayers(t *testing.T) {
	s, _ := stateWithComputedUnit(t, true)
	u := onlyUnit(t, fullState(t, s), "units")

	cs := u["combat_stats"].(map[string]any)
	assert.Contains(t, cs, "stats")
	assert.Contains(t, cs["physical"], "haste_pct")
	assert.Contains(t, cs["magic"], "stat_contribution")
	assert.Contains(t, cs["basic_attack"], "crit_chance_pct")
}

func TestFullStateMsg_OmitsCombatStatsForNPCs(t *testing.T) {
	s, _ := stateWithComputedUnit(t, false)
	assert.NotContains(t, onlyUnit(t, fullState(t, s), "units"), "combat_stats")
}

func TestFullStateMsg_OmitsCombatStatsBeforeTheFirstComputation(t *testing.T) {
	s := stateWithUnit(t)
	for _, u := range s.Units {
		u.ZoneUnitIdentifier = "player:hero"
	}
	assert.NotContains(t, onlyUnit(t, fullState(t, s), "units"), "combat_stats")
}

func TestDeltaMsg_NewPlayerUnitIncludesCombatStats(t *testing.T) {
	prev := stateWithUnit(t)
	prev.Units = nil
	curr, _ := stateWithComputedUnit(t, true)

	u := onlyUnit(t, delta(t, prev, curr), "unit_updates")
	assert.Contains(t, u, "combat_stats")
}

func TestDeltaMsg_UnchangedCombatStatsAreNotResent(t *testing.T) {
	s, _ := stateWithComputedUnit(t, true)
	prev := s.Clone()
	instance.UpdateCombatStatsForTest(s, goblinZone())

	assert.Empty(t, delta(t, prev, s)["unit_updates"])
}

func TestDeltaMsg_ChangedCombatStatsArePatched(t *testing.T) {
	s, unit := stateWithComputedUnit(t, true)
	prev := s.Clone()
	unit.ActiveStatusEffects = append(unit.ActiveStatusEffects, instancestate.ActiveStatusEffect{
		Status: instanceconfig.Status{Name: "swift", Effects: []instanceconfig.StatusEffect{
			{Type: "stat", StatName: "physicalHaste", ModifierType: "add", Amount: 15},
		}},
	})
	instance.UpdateCombatStatsForTest(s, goblinZone())

	u := onlyUnit(t, delta(t, prev, s), "unit_updates")
	physical := u["combat_stats"].(map[string]any)["physical"].(map[string]any)
	assert.InDelta(t, 15.0, physical["haste_pct"], 0.001)
}

func TestDeltaMsg_NPCCombatStatsChangesAreNotSent(t *testing.T) {
	s, unit := stateWithComputedUnit(t, false)
	prev := s.Clone()
	unit.ActiveStatusEffects = append(unit.ActiveStatusEffects, instancestate.ActiveStatusEffect{
		Status: instanceconfig.Status{Name: "swift", Effects: []instanceconfig.StatusEffect{
			{Type: "stat", StatName: "physicalHaste", ModifierType: "add", Amount: 15},
		}},
	})
	instance.UpdateCombatStatsForTest(s, goblinZone())

	for _, patch := range delta(t, prev, s)["unit_updates"].(map[string]any) {
		assert.NotContains(t, patch, "combat_stats")
	}
}
