package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// Internal-package tests for effectSchoolStats and PowerEffectTimeBudget -
// the pure (non-random) half of power-effect stat scaling. See
// power_effect_math_test.go's sibling, use_power_handler_test.go, for the
// randomized end-to-end behavior (amount rolls, crit).

func TestEffectSchoolStats_MagicUsesIntellectRegardlessOfDamageStatKey(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "strength", // not intellect - magic effects don't care
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	_, _, statContribution := effectSchoolStats(unit, instanceconfig.Zone{}, "magic")
	assert.InDelta(t, 30.0, statContribution, 0.001) // raw intellect from fullyItemizedMainHand
}

func TestEffectSchoolStats_PhysicalStatContributionGatedByDamageStatKey(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "agility", // not strength
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	_, _, statContribution := effectSchoolStats(unit, instanceconfig.Zone{}, "physical")
	assert.Equal(t, 0.0, statContribution, "strength is itemized, but agility is this unit's damage stat")

	unit.DamageStatKey = "strength"
	_, _, statContribution = effectSchoolStats(unit, instanceconfig.Zone{}, "physical")
	assert.InDelta(t, 30.0, statContribution, 0.001)
}

func TestEffectSchoolStats_PhysicalCritAndHasteAlwaysIncludeStrengthAgilityRegardlessOfDamageStatKey(t *testing.T) {
	unit := &instancestate.UnitState{
		DamageStatKey: "intellect", // not strength/agility - crit/haste still get their contribution
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("strength", 0)},
	}
	hastePct, critChancePct, statContribution := effectSchoolStats(unit, instanceconfig.Zone{}, "physical")
	assert.Equal(t, 0.0, statContribution, "strength isn't this unit's damage stat")
	// raw strength 30 -> +18 effective crit rating; raw crit_rating 20 itemized too -> 38 -> 5+38/15
	assert.InDelta(t, 5+38.0/15, critChancePct, 0.001)
	// no agility itemized -> haste comes from itemized haste_rating alone (20/11.71)
	assert.InDelta(t, 20.0/11.71, hastePct, 0.001)
}

func TestEffectSchoolStats_MagicCritAndHasteComeFromIntellectAndItemizedRatingOnly(t *testing.T) {
	unit := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	hastePct, critChancePct, _ := effectSchoolStats(unit, instanceconfig.Zone{}, "magic")
	// raw intellect 30 -> +9 magic crit, +9 magic haste (0.3x each); raw
	// crit_rating/haste_rating 20 itemized too.
	assert.InDelta(t, 5+29.0/15, critChancePct, 0.001)
	assert.InDelta(t, 29.0/11.71, hastePct, 0.001)
}

func TestPowerEffectAmount_ActiveStatStatusScalesDamageDone(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("damageDone", "multiply", 1.5)},
	}
	amount := instanceconfig.ValueRange{10.0, 10.0}
	effect := instanceconfig.PowerEffect{Amount: &amount, School: "physical"}

	retryUntilAmount(t, func() float64 {
		return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, 6.0, false, false)
	}, 15.0)
}

func TestPowerEffectAmount_SchoolScopedDamageDoneOnlyAppliesToThatSchool(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("magicDamageDone", "multiply", 1.5)},
	}
	amount := instanceconfig.ValueRange{10.0, 10.0}
	effect := instanceconfig.PowerEffect{Amount: &amount, School: "physical"}

	retryUntilAmount(t, func() float64 {
		return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, 6.0, false, false)
	}, 10.0)
}

func TestPowerEffectAmount_ActiveStatStatusScalesHealingDone(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("healingDone", "multiply", 1.5)},
	}
	amount := instanceconfig.ValueRange{10.0, 10.0}
	effect := instanceconfig.PowerEffect{Amount: &amount}

	retryUntilAmount(t, func() float64 {
		return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, 0, true, false)
	}, 15.0)
}

func TestEffectSchoolStats_ActiveStatStatusAddsPhysicalHaste(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("physicalHaste", "add", 20)},
	}
	hastePct, _, _ := effectSchoolStats(unit, instanceconfig.Zone{}, "physical")
	assert.InDelta(t, 20.0, hastePct, 0.001)
}

func TestEffectSchoolStats_PhysicalHasteStatusDoesNotAffectMagic(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("physicalHaste", "add", 20)},
	}
	hastePct, _, _ := effectSchoolStats(unit, instanceconfig.Zone{}, "magic")
	assert.Zero(t, hastePct)
}

func TestEffectSchoolStats_ActiveStatStatusAddsMagicCritChance(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("magicCritChance", "add", 10)},
	}
	_, critChancePct, _ := effectSchoolStats(unit, instanceconfig.Zone{}, "magic")
	assert.InDelta(t, 15.0, critChancePct, 0.001) // 5 base + 10 status
}

func TestPowerEffectTimeBudget_UsesCastTimeWhenSetAndPositive(t *testing.T) {
	castTime := 2.5
	power := instanceconfig.Power{CastTime: &castTime, GlobalCooldown: 1.0}
	assert.Equal(t, 2.5, PowerEffectTimeBudget(power))
}

func TestPowerEffectTimeBudget_FallsBackToGlobalCooldownWhenCastTimeNilOrZero(t *testing.T) {
	power := instanceconfig.Power{CastTime: nil, GlobalCooldown: 1.5}
	assert.Equal(t, 1.5, PowerEffectTimeBudget(power))

	zero := 0.0
	power.CastTime = &zero
	assert.Equal(t, 1.5, PowerEffectTimeBudget(power))
}

// retryUntilAmount calls roll (some PowerEffectAmount invocation) until it
// returns want, so its 5%+ base crit chance doesn't make these deterministic
// bonus-math assertions flaky.
func retryUntilAmount(t *testing.T, roll func() float64, want float64) {
	t.Helper()
	for i := 0; i < 200; i++ {
		if roll() == want {
			return
		}
	}
	t.Fatalf("never rolled a non-crit result matching %v in 200 tries - crit chance may be miscalibrated", want)
}

func TestPowerEffectAmount_BonusScalesWithStatContributionTimeBudgetHealAndRecurring(t *testing.T) {
	// raw intellect 30 -> k = 30/90 = 1/3. Fixed [10,10] amount isolates the
	// bonus math (no roll variance to account for).
	unit := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	amount := instanceconfig.ValueRange{10.0, 10.0}
	effect := instanceconfig.PowerEffect{Amount: &amount, School: "magic"}
	const timeBudget = 6.0 // bonus = (1/3)*6 = 2

	retryUntilAmount(t, func() float64 {
		return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, timeBudget, false, false)
	}, 12.0) // harm: 10+2
	retryUntilAmount(t, func() float64 { return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, timeBudget, true, false) }, 14.0) // heal: 10+2*2
	retryUntilAmount(t, func() float64 { return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, timeBudget, false, true) }, 14.0) // recurring harm: 10+2*2
	retryUntilAmount(t, func() float64 { return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, timeBudget, true, true) }, 18.0)  // recurring heal: 10+2*2*2
}

func TestPowerEffectAmount_HealIgnoresEffectSchoolAndAlwaysUsesIntellect(t *testing.T) {
	// DamageStatKey and School both say "physical" (strength) - a heal
	// effect should still scale off Intellect, per "healing is always
	// treated as magic."
	unit := &instancestate.UnitState{
		DamageStatKey: "strength",
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": fullyItemizedMainHand("intellect", 0)},
	}
	amount := instanceconfig.ValueRange{10.0, 10.0}
	effect := instanceconfig.PowerEffect{Amount: &amount, School: "physical"}

	retryUntilAmount(t, func() float64 { return PowerEffectAmount(unit, instanceconfig.Zone{}, effect, 6.0, true, false) }, 14.0)
}
