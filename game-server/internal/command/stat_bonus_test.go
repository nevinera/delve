package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func statusWithStatEffect(statName, modifierType string, amount float64) instancestate.ActiveStatusEffect {
	return instancestate.ActiveStatusEffect{
		Status: instanceconfig.Status{
			Name: statName + "-" + modifierType,
			Effects: []instanceconfig.StatusEffect{
				{Type: "stat", StatName: statName, ModifierType: modifierType, Amount: amount},
			},
		},
	}
}

func TestActiveStatModifiers_NoActiveStatusesIsAllIdentity(t *testing.T) {
	unit := &instancestate.UnitState{}
	add, multiply := ActiveStatModifiers(unit).Get("haste_rating")
	assert.Zero(t, add)
	assert.Equal(t, 1.0, multiply)
}

func TestActiveStatModifiers_IgnoresNonStatEffects(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			{Status: instanceconfig.Status{Effects: []instanceconfig.StatusEffect{{Type: "recurring"}}}},
		},
	}
	add, multiply := ActiveStatModifiers(unit).Get("haste_rating")
	assert.Zero(t, add)
	assert.Equal(t, 1.0, multiply)
}

func TestActiveStatModifiers_SumsAddAmounts(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("physicalHaste", "add", 10),
			statusWithStatEffect("physicalHaste", "add", 5),
		},
	}
	add, multiply := ActiveStatModifiers(unit).Get("physicalHaste")
	assert.Equal(t, 15.0, add)
	assert.Equal(t, 1.0, multiply)
}

func TestActiveStatModifiers_MultipliesMultiplyAmountsTogether(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("damageDone", "multiply", 1.1),
			statusWithStatEffect("damageDone", "multiply", 1.1),
		},
	}
	_, multiply := ActiveStatModifiers(unit).Get("damageDone")
	assert.InDelta(t, 1.21, multiply, 0.0001)
}

func TestActiveStatModifiers_DifferentStatNamesAreIndependent(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("strength", "add", 50),
		},
	}
	add, multiply := ActiveStatModifiers(unit).Get("agility")
	assert.Zero(t, add)
	assert.Equal(t, 1.0, multiply)
}

func TestActiveStatModifiers_SkipsAStatEffectWhoseConditionIsUnmet(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			{
				Status: instanceconfig.Status{Effects: []instanceconfig.StatusEffect{
					{Type: "stat", StatName: "damageDone", ModifierType: "add", Amount: 10},
				}},
				ConditionsMet: []bool{false},
			},
		},
	}
	add, multiply := ActiveStatModifiers(unit).Get("damageDone")
	assert.Zero(t, add, "the effect's condition is unmet, so it shouldn't contribute at all")
	assert.Equal(t, 1.0, multiply)
}

func TestActiveStatModifiers_AppliesAStatEffectWhoseConditionIsMet(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			{
				Status: instanceconfig.Status{Effects: []instanceconfig.StatusEffect{
					{Type: "stat", StatName: "damageDone", ModifierType: "add", Amount: 10},
				}},
				ConditionsMet: []bool{true},
			},
		},
	}
	add, _ := ActiveStatModifiers(unit).Get("damageDone")
	assert.Equal(t, 10.0, add)
}

func TestActiveStatModifiers_MissingConditionsMetTreatsEveryEffectAsMet(t *testing.T) {
	// statusWithStatEffect (and any pre-existing content applied before
	// this feature) leaves ConditionsMet nil/empty - that must not
	// silently mask every stat effect as "unmet".
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("damageDone", "add", 10),
		},
	}
	add, _ := ActiveStatModifiers(unit).Get("damageDone")
	assert.Equal(t, 10.0, add)
}

func TestActiveStatModifiers_MultipleStatusesEachContributeIndependently(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			statusWithStatEffect("maxHealth", "add", 100),
			statusWithStatEffect("maxHealth", "multiply", 1.5),
		},
	}
	add, multiply := ActiveStatModifiers(unit).Get("maxHealth")
	assert.Equal(t, 100.0, add)
	assert.Equal(t, 1.5, multiply)
}
