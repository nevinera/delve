package instance_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// twoUnitState returns a fresh InstanceState with two independent idle
// units - a target and an applier, each with a known ID - for recurring-tick
// tests that need a real applier to compute stat-scaled amounts from.
func twoUnitState(t *testing.T) (targetID, applierID uuid.UUID, state *instancestate.InstanceState) {
	t.Helper()
	targetID, applierID = uuid.New(), uuid.New()
	state = &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{
			targetID:  {ZoneUnitIdentifier: "target", Health: 100, MaxHealth: 100, Status: instancestate.UnitStatusIdle},
			applierID: {ZoneUnitIdentifier: "applier", Health: 100, MaxHealth: 100, Status: instancestate.UnitStatusIdle},
		},
	}
	return targetID, applierID, state
}

// nakedApplier is a stat-less applier - used by tests that don't care about
// Haste/stat scaling, so RecurringTickInterval/EffectHastePct fall back to
// the base (unhasted) values.
func nakedApplier() *instancestate.UnitState { return &instancestate.UnitState{} }

func TestExpireStatusEffects_RemovesExpiredEntry(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, nakedApplier(), uuid.New(), instanceconfig.Status{Name: "poison", Stacking: "replace"}, 1.0, instanceconfig.Zone{}, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		assert.Empty(t, u.ActiveStatusEffects)
	}
}

func TestExpireStatusEffects_KeepsUnexpiredEntry(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, nakedApplier(), uuid.New(), instanceconfig.Status{Name: "poison", Stacking: "replace"}, 10.0, instanceconfig.Zone{}, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(1*time.Second))

	for _, u := range state.Units {
		require.Len(t, u.ActiveStatusEffects, 1)
	}
}

func TestExpireStatusEffects_RemovesWholeStackAtOnce(t *testing.T) {
	// All stacks of a "stack" status share one timer (docs/schema/status.md)
	// - expiry removes the entire entry, never decrements it.
	state := stateWithUnit(t)
	now := time.Now()
	applierID := uuid.New()
	status := instanceconfig.Status{Name: "bleed", Stacking: "stack", MaxStacks: 5}
	for _, u := range state.Units {
		command.ApplyStatus(u, nakedApplier(), applierID, status, 1.0, instanceconfig.Zone{}, now)
		command.ApplyStatus(u, nakedApplier(), applierID, status, 1.0, instanceconfig.Zone{}, now)
		command.ApplyStatus(u, nakedApplier(), applierID, status, 1.0, instanceconfig.Zone{}, now)
	}

	for _, u := range state.Units {
		require.Equal(t, 3, u.ActiveStatusEffects[0].Stacks)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		assert.Empty(t, u.ActiveStatusEffects)
	}
}

func TestExpireStatusEffects_OnlyRemovesExpiredEntriesLeavesOthers(t *testing.T) {
	state := stateWithUnit(t)
	now := time.Now()
	for _, u := range state.Units {
		command.ApplyStatus(u, nakedApplier(), uuid.New(), instanceconfig.Status{Name: "short", Stacking: "replace"}, 1.0, instanceconfig.Zone{}, now)
		command.ApplyStatus(u, nakedApplier(), uuid.New(), instanceconfig.Status{Name: "long", Stacking: "replace"}, 10.0, instanceconfig.Zone{}, now)
	}

	instance.ExpireStatusEffectsForTest(state, now.Add(2*time.Second))

	for _, u := range state.Units {
		require.Len(t, u.ActiveStatusEffects, 1)
		assert.Equal(t, "long", u.ActiveStatusEffects[0].Status.Name)
	}
}

func TestTickStatusEffects_DoesNotFireBeforeIntervalElapses(t *testing.T) {
	targetID, applierID, state := twoUnitState(t)
	status := instanceconfig.Status{
		Name: "Poison", ShortName: "Poison", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 1.0, OnTick: "harm", Amount: 5.0},
		},
	}
	command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.TickStatusEffectsForTest(state, instanceconfig.Zone{}, 0.5)

	assert.Equal(t, 100.0, state.Units[targetID].Health)
	e := state.Units[targetID].ActiveStatusEffects[0]
	assert.InDelta(t, 0.5, e.TimeUntilNextTick[0], 0.0001)
}

func TestTickStatusEffects_FiresMultipleTicksWhenIntervalIsShort(t *testing.T) {
	targetID, applierID, state := twoUnitState(t)
	status := instanceconfig.Status{
		Name: "Regen", ShortName: "Regen", TreatAs: "buff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			// heal, not harm - no miss/resist roll, so the tick count is
			// deterministic to assert on exactly.
			{Type: "recurring", TickRate: 0.1, OnTick: "heal", Amount: 1.0},
		},
	}
	state.Units[targetID].Health = 50
	command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.TickStatusEffectsForTest(state, instanceconfig.Zone{}, 0.35)

	// 0.35 / 0.1 = 3 full ticks with 0.05s left over. Applier has no
	// itemized stats, so each tick heals exactly its base Amount (1.0) -
	// unless it crits (5% base chance per tick), which only ever adds, so
	// a >=53 floor is deterministic even accounting for that.
	assert.GreaterOrEqual(t, state.Units[targetID].Health, 53.0)
	e := state.Units[targetID].ActiveStatusEffects[0]
	assert.InDelta(t, 0.05, e.TimeUntilNextTick[0], 0.0001)
}

func TestTickStatusEffects_HasteShortensTheFirstIntervalToo(t *testing.T) {
	// A recurring effect's interval-to-next-tick is decided fresh each time
	// a tick is *scheduled* - at application, and again each time a tick
	// subsequently fires - using the applier's Haste as of that moment.
	// Application counts as the first such scheduling event, so the very
	// first interval should already reflect the applier's Haste, not just
	// later reschedules.
	status := instanceconfig.Status{
		Name: "Regen", ShortName: "Regen", TreatAs: "buff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 1.0, OnTick: "heal", Amount: 1.0},
		},
	}

	targetID, applierID, state := twoUnitState(t)
	state.Units[targetID].Health = 0
	primary := "intellect"
	state.Units[applierID].EquippedItems = map[string]instanceconfig.EquippedItem{
		// raw haste_rating 3*10*4=120 (two_hand factor 4.0, primary filled
		// so no missing-primary bonus) -> ~10.25% physical Haste, shrinking
		// the base 1.0s interval to ~0.907s.
		"two_hand": {Slot: "two_hand", PrimaryStat: &primary, SecondaryStats: []string{"haste_rating", "haste_rating", "haste_rating"}},
	}
	command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 100.0, instanceconfig.Zone{}, time.Now())

	instance.TickStatusEffectsForTest(state, instanceconfig.Zone{}, 0.95)

	assert.Greater(t, state.Units[targetID].Health, 0.0,
		"the very first interval should already be Haste-shortened below 0.95s, not still the unhasted 1.0s")
}

func TestTickStatusEffects_NoApplierSkipsTheTick(t *testing.T) {
	targetID, applierID, state := twoUnitState(t)
	status := instanceconfig.Status{
		Name: "Poison", ShortName: "Poison", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 1.0, OnTick: "harm", Amount: 50.0},
		},
	}
	command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())
	delete(state.Units, applierID) // the applier left the instance

	instance.TickStatusEffectsForTest(state, instanceconfig.Zone{}, 1.0)

	assert.Equal(t, 100.0, state.Units[targetID].Health, "no applier to compute a stat-scaled amount from - the tick is skipped")
}

func TestTickStatusEffects_LethalTickKillsTarget(t *testing.T) {
	status := instanceconfig.Status{
		Name: "Poison", ShortName: "Poison", TreatAs: "debuff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "recurring", TickRate: 1.0, OnTick: "harm", Amount: 500.0},
		},
	}

	for i := 0; i < 200; i++ {
		targetID, applierID, state := twoUnitState(t)
		command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

		instance.TickStatusEffectsForTest(state, instanceconfig.Zone{}, 1.0)

		if state.Units[targetID].Health == 0 {
			assert.Equal(t, instancestate.UnitStatusDead, state.Units[targetID].Status)
			assert.Nil(t, state.Units[targetID].Target)
			return
		}
	}
	t.Fatal("poison missed 200 times in a row - miss chance may be miscalibrated")
}
