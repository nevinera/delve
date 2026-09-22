package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func mainHandWithRecovery() instanceconfig.EquippedItem {
	primary := "strength"
	return instanceconfig.EquippedItem{
		Slot:           "main_hand",
		PrimaryStat:    &primary,
		SecondaryStats: []string{"stamina", "crit_rating", "recovery_rating"},
	}
}

func TestHealingTakenPct_ZeroWithNoRecoveryRating(t *testing.T) {
	unit := &instancestate.UnitState{}
	assert.Zero(t, HealingTakenPct(unit, instanceconfig.Zone{}))
}

func TestHealingTakenPct_ZeroForNPC(t *testing.T) {
	// NPCs carry no EquippedItems at all, so recovery_rating is always 0.
	unit := &instancestate.UnitState{}
	assert.Zero(t, HealingTakenPct(unit, instanceconfig.Zone{}))
}

func TestHealingTakenPct_ScalesWithRecoveryRating(t *testing.T) {
	unit := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{"main_hand": mainHandWithRecovery()},
	}
	// base secondary (10) at main_hand's 2.0 factor -> effective 20.
	// healingTakenCeiling(170) * 20 / (20 + 310) = 10.30.
	assert.InDelta(t, 10.30, HealingTakenPct(unit, instanceconfig.Zone{}), 0.01)
}

func TestHealingTakenPct_ActiveStatStatusAddsOnTopOfRecoveryRating(t *testing.T) {
	unit := &instancestate.UnitState{
		EquippedItems:       map[string]instanceconfig.EquippedItem{"main_hand": mainHandWithRecovery()},
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("healingTaken", "add", 25)},
	}
	// 10.30% from Recovery Rating (see TestHealingTakenPct_ScalesWithRecoveryRating) + 25 flat.
	assert.InDelta(t, 35.30, HealingTakenPct(unit, instanceconfig.Zone{}), 0.01)
}

func TestHealingTakenPct_ActiveStatStatusMultipliesRecoveryRatingToo(t *testing.T) {
	unit := &instancestate.UnitState{
		EquippedItems:       map[string]instanceconfig.EquippedItem{"main_hand": mainHandWithRecovery()},
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("healingTaken", "multiply", 2.0)},
	}
	assert.InDelta(t, 20.60, HealingTakenPct(unit, instanceconfig.Zone{}), 0.01)
}

func TestHealingTakenPct_ActiveStatStatusWorksWithNoItemizedRecovery(t *testing.T) {
	unit := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{statusWithStatEffect("healingTaken", "add", 40)},
	}
	assert.InDelta(t, 40.0, HealingTakenPct(unit, instanceconfig.Zone{}), 0.001)
}

// The calibration itself (445 -> ~100%, ~30 -> ~15%, per docs/stats.md's
// Recovery Rating section) is a property of the constants, not the gear
// pipeline - checked directly here rather than via a contrived itemization
// that would exercise itemstats' own (already-tested) redistribution math
// instead of what this test actually cares about.
func TestHealingTakenPct_MatchesDocumentedCalibrationPoints(t *testing.T) {
	fullyItemized := healingTakenCeiling * 445 / (445 + healingTakenK)
	scattered := healingTakenCeiling * 30 / (30 + healingTakenK)
	assert.InDelta(t, 100.0, fullyItemized, 1.0)
	assert.InDelta(t, 15.0, scattered, 1.0)
}
