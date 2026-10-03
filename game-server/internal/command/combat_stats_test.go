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

	haste, crit, contribution := computeEffectSchoolStats(unit, zone, "physical")
	assert.Equal(t, haste, cs.Physical.HastePct)
	assert.Equal(t, crit, cs.Physical.CritChancePct)
	assert.Equal(t, contribution, cs.Physical.StatContribution)
	assert.Greater(t, cs.Physical.HastePct, 20.0)

	haste, crit, contribution = computeEffectSchoolStats(unit, zone, "magic")
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

	haste, crit, statDPS := computeUnitCombatStats(unit, zone)
	assert.Equal(t, haste, cs.BasicAttack.HastePct)
	assert.Equal(t, crit, cs.BasicAttack.CritChancePct)
	assert.InDelta(t, statDPS, cs.BasicAttack.StatContribution/basicAttackStatDPSDivisor, 1e-9)
	assert.Equal(t, cs.Magic.StatContribution, cs.BasicAttack.StatContribution)
}

// The remaining tests pin that combat math reads the tick-start snapshot
// rather than recomputing: each unit's CombatStats is set to values its gear
// and statuses could never produce.

func snapshotOnly(cs *instancestate.CombatStats) *instancestate.UnitState {
	return &instancestate.UnitState{CombatStats: cs}
}

func TestEffectSchoolStats_ReadsTheCachedSnapshot(t *testing.T) {
	unit := snapshotOnly(&instancestate.CombatStats{
		Physical: instancestate.SchoolCombatStats{HastePct: 11, CritChancePct: 12, StatContribution: 13},
		Magic:    instancestate.SchoolCombatStats{HastePct: 21, CritChancePct: 22, StatContribution: 23},
	})

	haste, crit, stat := effectSchoolStats(unit, instanceconfig.Zone{}, "physical")
	assert.Equal(t, []float64{11, 12, 13}, []float64{haste, crit, stat})
	haste, crit, stat = effectSchoolStats(unit, instanceconfig.Zone{}, "magic")
	assert.Equal(t, []float64{21, 22, 23}, []float64{haste, crit, stat})
}

func TestUnitCombatStats_ReadsTheCachedSnapshot(t *testing.T) {
	unit := snapshotOnly(&instancestate.CombatStats{
		BasicAttack: instancestate.SchoolCombatStats{HastePct: 7, CritChancePct: 8, StatContribution: 180},
	})

	haste, crit, statDPS := UnitCombatStats(unit, instanceconfig.Zone{})
	assert.Equal(t, 7.0, haste)
	assert.Equal(t, 8.0, crit)
	assert.InDelta(t, 2.0, statDPS, 1e-9)
}

func TestUnitEffectiveStats_ReadsTheCachedSnapshot(t *testing.T) {
	unit := snapshotOnly(&instancestate.CombatStats{
		Stats: map[string]float64{"strength": 1, "agility": 2, "intellect": 3, "defence_rating": 4, "recovery_rating": 5},
	})

	strength, agility, intellect, defence, stats := unitEffectiveStats(unit, instanceconfig.Zone{})
	assert.Equal(t, []float64{1, 2, 3, 4}, []float64{strength, agility, intellect, defence})
	assert.Equal(t, 5.0, stats["recovery_rating"])
}

func TestHealingTakenPct_ReadsTheCachedRecoveryRating(t *testing.T) {
	naked := HealingTakenPct(withStats(&instancestate.UnitState{}, instanceconfig.Zone{}), instanceconfig.Zone{})
	cached := HealingTakenPct(snapshotOnly(&instancestate.CombatStats{Stats: map[string]float64{"recovery_rating": 500}}), instanceconfig.Zone{})
	assert.Greater(t, cached, naked)
}

func TestPlayerMaxHealth_ReadsTheCachedStamina(t *testing.T) {
	unit := snapshotOnly(&instancestate.CombatStats{Stats: map[string]float64{"stamina": 20}})
	assert.InDelta(t, 895.0, PlayerMaxHealth(unit, instanceconfig.Zone{}), 0.01)
}

func TestComputeCombatStats_DoesNotReadTheUnitsOwnStaleSnapshot(t *testing.T) {
	unit := &instancestate.UnitState{
		CombatStats: &instancestate.CombatStats{Physical: instancestate.SchoolCombatStats{HastePct: 99}},
	}
	assert.Zero(t, ComputeCombatStats(unit, instanceconfig.Zone{}).Physical.HastePct)
}

func withStats(unit *instancestate.UnitState, zone instanceconfig.Zone) *instancestate.UnitState {
	unit.CombatStats = ComputeCombatStats(unit, zone)
	return unit
}
