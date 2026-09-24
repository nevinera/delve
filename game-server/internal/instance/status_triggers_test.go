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

func statusWithTrigger(name string, trigger *instanceconfig.StatusTrigger, internalCooldown float64, effect *instanceconfig.TriggeredEffect) instanceconfig.Status {
	return instanceconfig.Status{
		Name: name, ShortName: name, TreatAs: "buff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "triggered", Trigger: trigger, InternalCooldown: internalCooldown, TriggeredEffect: effect},
		},
	}
}

func TestProcessTriggeredStatusEffects_FiresImmediatelyOnApplicationWhenTriggerHolds(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	state.Units[holderID].Health = 10 // well below the threshold
	status := statusWithTrigger("Emergency Heal",
		&instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 30},
		3.0, &instanceconfig.TriggeredEffect{Type: "heal", Affects: "self", Amount: &instanceconfig.ValueRange{15, 15}})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)

	assert.Greater(t, state.Units[holderID].Health, 10.0, "cooldown starts ready, so this should fire on the very first pass")
}

func TestProcessTriggeredStatusEffects_DoesNotFireWhenTriggerDoesNotHold(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	state.Units[holderID].Health = 90 // above the threshold
	status := statusWithTrigger("Emergency Heal",
		&instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 30},
		3.0, &instanceconfig.TriggeredEffect{Type: "heal", Affects: "self", Amount: &instanceconfig.ValueRange{15, 15}})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)

	assert.Equal(t, 90.0, state.Units[holderID].Health)
}

func TestProcessTriggeredStatusEffects_RespectsInternalCooldown(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	state.Units[holderID].Health = 10
	status := statusWithTrigger("Emergency Heal",
		&instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 100},
		3.0, &instanceconfig.TriggeredEffect{Type: "heal", Affects: "self", Amount: &instanceconfig.ValueRange{5, 5}})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)
	afterFirst := state.Units[holderID].Health
	assert.Greater(t, afterFirst, 10.0, "should fire on the first pass")

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)
	assert.Equal(t, afterFirst, state.Units[holderID].Health, "still on cooldown - shouldn't fire again yet")
}

func TestProcessTriggeredStatusEffects_FiresAgainOnceCooldownElapses(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	state.Units[holderID].Health = 10
	status := statusWithTrigger("Emergency Heal",
		&instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 100},
		1.0, &instanceconfig.TriggeredEffect{Type: "heal", Affects: "self", Amount: &instanceconfig.ValueRange{5, 5}})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)
	afterFirst := state.Units[holderID].Health

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 1.0) // cooldown elapses

	assert.Greater(t, state.Units[holderID].Health, afterFirst)
}

func TestProcessTriggeredStatusEffects_TakesDamageFiresOnlyWhenFlagSet(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	status := statusWithTrigger("Thorns",
		&instanceconfig.StatusTrigger{Type: "takesDamage"},
		3.0, &instanceconfig.TriggeredEffect{Type: "resource", Affects: "self", ResourceName: "fury", Delta: 5})
	state.Units[holderID].Resources = map[string]*instancestate.ResourceState{"fury": {Current: 0, Max: 10}}
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)
	assert.Zero(t, state.Units[holderID].Resources["fury"].Current, "no damage taken yet")

	state.Units[holderID].DamageTakenThisTick = true
	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)
	assert.Equal(t, 5.0, state.Units[holderID].Resources["fury"].Current)
}

func TestProcessTriggeredStatusEffects_ClearsDamageFlagsAfterProcessing(t *testing.T) {
	_, _, state := twoUnitState(t)
	for _, u := range state.Units {
		u.DamageTakenThisTick = true
		u.DamageDealtThisTick = true
	}

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)

	for _, u := range state.Units {
		assert.False(t, u.DamageTakenThisTick)
		assert.False(t, u.DamageDealtThisTick)
	}
}

func TestProcessTriggeredStatusEffects_SelfAppliedStatusDoesNotCorruptLaterEffects(t *testing.T) {
	// A self-targeted "status" TriggeredEffect can grow (and reallocate)
	// the very unit.ActiveStatusEffects slice this pass is iterating -
	// guards against a stale-pointer bug where a second triggered effect
	// on the same unit (or a later refresh) silently stops updating.
	holderID, applierID, state := twoUnitState(t)
	state.Units[holderID].Health = 50
	granted := instanceconfig.Status{Name: "Granted", ShortName: "Grant", TreatAs: "inherent", Stacking: "replace"}
	status := statusWithTrigger("Chain",
		&instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 100},
		1.0, &instanceconfig.TriggeredEffect{Type: "status", Affects: "self", Duration: 5, Status: &granted})
	// Pad ActiveStatusEffects with enough prior entries that appending a
	// new one is likely to force a real slice reallocation.
	for i := 0; i < 8; i++ {
		filler := instanceconfig.Status{Name: "Filler", ShortName: "F", TreatAs: "inherent", Stacking: "replace"}
		command.ApplyStatus(state.Units[holderID], state.Units[applierID], uuid.New(), filler, 10.0, instanceconfig.Zone{}, time.Now())
	}
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.ProcessTriggeredStatusEffectsForTest(state, instanceconfig.Zone{}, time.Now(), 0.1)

	var found bool
	for _, e := range state.Units[holderID].ActiveStatusEffects {
		if e.Status.Name == "Chain" {
			found = true
			require.Len(t, e.TriggerCooldownsRemaining, 1)
			assert.InDelta(t, 1.0, e.TriggerCooldownsRemaining[0], 0.0001, "cooldown reset should have landed on the live copy, not a stale one")
		}
	}
	require.True(t, found)

	var grantedCount int
	for _, e := range state.Units[holderID].ActiveStatusEffects {
		if e.Status.Name == "Granted" {
			grantedCount++
		}
	}
	assert.Equal(t, 1, grantedCount)
}
