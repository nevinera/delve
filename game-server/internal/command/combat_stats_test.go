package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestComputeCombatStats_NakedUnitIsAllZeroExceptBaseCrit(t *testing.T) {
	cs := ComputeCombatStats(&instancestate.UnitState{}, instanceconfig.Zone{})
	assert.Zero(t, cs.Physical.HastePct)
	assert.Zero(t, cs.Magic.StatContribution)
	assert.InDelta(t, 5.0, cs.Physical.CritChancePct, 0.001)
	assert.Zero(t, cs.Stats["strength"])
}

func TestComputeCombatStats_StatsIncludeVersatilitySpreadAndStatuses(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("versatilityRating", "add", 100),
			statusWithStatEffect("hasteRating", "add", 40),
		},
	}
	cs := ComputeCombatStats(unit, instanceconfig.Zone{})
	assert.InDelta(t, 20.0, cs.Stats["strength"], 0.001)
	assert.InDelta(t, 20.0, cs.Stats["intellect"], 0.001)
	assert.InDelta(t, 20.0, cs.Stats["defence_rating"], 0.001)
	assert.InDelta(t, 40.0, cs.Stats["haste_rating"], 0.001)
}

func TestComputeCombatStats_SchoolFiguresMatchTheEffectMath(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("physicalHaste", "add", 20),
		},
	}
	zone := instanceconfig.Zone{}
	cs := ComputeCombatStats(unit, zone)

	haste, crit, contribution := effectSchoolStats(unit, zone, "physical")
	assert.Equal(t, haste, cs.Physical.HastePct)
	assert.Equal(t, crit, cs.Physical.CritChancePct)
	assert.Equal(t, contribution, cs.Physical.StatContribution)
	assert.Greater(t, cs.Physical.HastePct, 20.0)

	haste, crit, contribution = effectSchoolStats(unit, zone, "magic")
	assert.Equal(t, haste, cs.Magic.HastePct)
	assert.Equal(t, crit, cs.Magic.CritChancePct)
	assert.Equal(t, contribution, cs.Magic.StatContribution)
}

func TestComputeCombatStats_BasicAttackFollowsTheDamageStat(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "intellect",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	zone := instanceconfig.Zone{}
	cs := ComputeCombatStats(unit, zone)

	haste, crit, statDPS := UnitCombatStats(unit, zone)
	assert.Equal(t, haste, cs.BasicAttack.HastePct)
	assert.Equal(t, crit, cs.BasicAttack.CritChancePct)
	assert.InDelta(t, statDPS, cs.BasicAttack.StatContribution/basicAttackStatDPSDivisor, 1e-9)
	assert.Equal(t, cs.Magic.StatContribution, cs.BasicAttack.StatContribution)
}
