package command_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// nakedApplier is a stat-less applier - used by tests that don't care about
// Haste/stat scaling, so RecurringTickInterval/EffectHastePct fall back to
// the base (unhasted) values.
func nakedApplier() *instancestate.UnitState { return &instancestate.UnitState{} }

func TestApplyStatus_NewApplicationAddsAnEntryWithOneStack(t *testing.T) {
	target := &instancestate.UnitState{}
	applierID := uuid.New()
	now := time.Now()
	status := instanceconfig.Status{Name: "poison", Stacking: "replace"}

	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)

	require.Len(t, target.ActiveStatusEffects, 1)
	e := target.ActiveStatusEffects[0]
	assert.Equal(t, "poison", e.Status.Name)
	assert.Equal(t, applierID, e.ApplierID)
	assert.Equal(t, 1, e.Stacks)
	assert.WithinDuration(t, now.Add(5*time.Second), e.ExpiresAt, time.Millisecond)
}

func TestApplyStatus_DifferentAppliersTrackedIndependently(t *testing.T) {
	target := &instancestate.UnitState{}
	status := instanceconfig.Status{Name: "poison", Stacking: "stack", MaxStacks: 5}
	now := time.Now()

	command.ApplyStatus(target, nakedApplier(), uuid.New(), status, 5.0, instanceconfig.Zone{}, now)
	command.ApplyStatus(target, nakedApplier(), uuid.New(), status, 5.0, instanceconfig.Zone{}, now)

	assert.Len(t, target.ActiveStatusEffects, 2, "two different appliers should produce two independent entries")
}

func TestApplyStatus_ExtendRefreshesDurationOnly(t *testing.T) {
	target := &instancestate.UnitState{}
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "regen", Stacking: "extend"}
	now := time.Now()

	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)
	later := now.Add(2 * time.Second)
	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, later)

	require.Len(t, target.ActiveStatusEffects, 1, "extend reuses the same entry, not a second one")
	e := target.ActiveStatusEffects[0]
	assert.Equal(t, 1, e.Stacks)
	assert.WithinDuration(t, later.Add(5*time.Second), e.ExpiresAt, time.Millisecond)
}

func TestApplyStatus_ReplaceResetsStacksAndDuration(t *testing.T) {
	target := &instancestate.UnitState{}
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "curse", Stacking: "replace"}
	now := time.Now()

	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)
	later := now.Add(2 * time.Second)
	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, later)

	require.Len(t, target.ActiveStatusEffects, 1)
	e := target.ActiveStatusEffects[0]
	assert.Equal(t, 1, e.Stacks)
	assert.WithinDuration(t, later.Add(5*time.Second), e.ExpiresAt, time.Millisecond)
}

func TestApplyStatus_StackIncrementsStacksAndSharesOneRefreshedTimer(t *testing.T) {
	target := &instancestate.UnitState{}
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "bleed", Stacking: "stack", MaxStacks: 3}
	now := time.Now()

	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)
	later := now.Add(2 * time.Second)
	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, later)

	require.Len(t, target.ActiveStatusEffects, 1)
	e := target.ActiveStatusEffects[0]
	assert.Equal(t, 2, e.Stacks)
	// Shared-timer model: the single ExpiresAt refreshes to the full
	// duration from the latest application, not two independent expiries.
	assert.WithinDuration(t, later.Add(5*time.Second), e.ExpiresAt, time.Millisecond)
}

func TestApplyStatus_StackCapsAtMaxStacks(t *testing.T) {
	target := &instancestate.UnitState{}
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "bleed", Stacking: "stack", MaxStacks: 2}
	now := time.Now()

	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)
	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)
	command.ApplyStatus(target, nakedApplier(), applierID, status, 5.0, instanceconfig.Zone{}, now)

	require.Len(t, target.ActiveStatusEffects, 1)
	assert.Equal(t, 2, target.ActiveStatusEffects[0].Stacks)
}

func TestApplyStatus_SeedsTickTimersForRecurringEffectsOnly(t *testing.T) {
	target := &instancestate.UnitState{}
	status := instanceconfig.Status{
		Name:     "regen",
		Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "stat", StatName: "movementSpeed", ModifierType: "multiply", Amount: 0.8},
			{Type: "recurring", TickRate: 2.5, OnTick: "heal", Amount: 5.0},
		},
	}

	command.ApplyStatus(target, nakedApplier(), uuid.New(), status, 5.0, instanceconfig.Zone{}, time.Now())

	require.Len(t, target.ActiveStatusEffects, 1)
	timers := target.ActiveStatusEffects[0].TimeUntilNextTick
	require.Len(t, timers, 2, "one slot per Status.Effects entry, even non-recurring ones")
	assert.Equal(t, 0.0, timers[0], "the stat effect isn't recurring - no tick timer")
	assert.Equal(t, 2.5, timers[1], "a naked applier has 0% Haste, so this is just the base tickRate")
}

func TestApplyStatus_FirstTickIntervalIsHasteScaledAtApplicationToo(t *testing.T) {
	// Application is itself the first "scheduling" event for a recurring
	// effect's tick timer - it should use the applier's Haste right then,
	// not fall back to an unhasted special case.
	target := &instancestate.UnitState{}
	primary := "intellect"
	hastedApplier := &instancestate.UnitState{
		EquippedItems: map[string]instanceconfig.EquippedItem{
			// raw haste_rating 3*10*4=120 (two_hand factor 4.0, primary
			// filled so no missing-primary bonus) -> ~10.25% physical Haste.
			"two_hand": {Slot: "two_hand", PrimaryStat: &primary, SecondaryStats: []string{"haste_rating", "haste_rating", "haste_rating"}},
		},
	}
	status := instanceconfig.Status{
		Name:     "regen",
		Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 1.0, OnTick: "heal", Amount: 5.0},
		},
	}

	command.ApplyStatus(target, hastedApplier, uuid.New(), status, 5.0, instanceconfig.Zone{}, time.Now())

	require.Len(t, target.ActiveStatusEffects, 1)
	assert.Less(t, target.ActiveStatusEffects[0].TimeUntilNextTick[0], 1.0,
		"the very first interval should already be shortened by the applier's Haste, not just later reschedules")
}
