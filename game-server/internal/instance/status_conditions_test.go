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

func statusWithCondition(name string, cond *instanceconfig.StatusEffectCondition) instanceconfig.Status {
	return instanceconfig.Status{
		Name: name, ShortName: name, TreatAs: "buff", Stacking: "replace",
		Effects: []instanceconfig.StatusEffect{
			{Type: "stat", StatName: "damageDone", ModifierType: "add", Amount: 1, Condition: cond},
		},
	}
}

func TestRefreshStatusEffectConditions_SelfHealthPct(t *testing.T) {
	targetID, applierID, state := twoUnitState(t)
	status := statusWithCondition("Execute", &instanceconfig.StatusEffectCondition{Type: "selfHealthPct", Comparison: "below", Threshold: 30})
	command.ApplyStatus(state.Units[targetID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	state.Units[targetID].Health = 50
	instance.RefreshStatusEffectConditionsForTest(state)
	assert.False(t, state.Units[targetID].ActiveStatusEffects[0].ConditionsMet[0])

	state.Units[targetID].Health = 20
	instance.RefreshStatusEffectConditionsForTest(state)
	assert.True(t, state.Units[targetID].ActiveStatusEffects[0].ConditionsMet[0])
}

func TestRefreshStatusEffectConditions_TargetHealthPct(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	// A third unit that holder is targeting.
	enemyID := uuid.New()
	state.Units[enemyID] = &instancestate.UnitState{ZoneUnitIdentifier: "enemy", Health: 100, MaxHealth: 100}
	state.Units[holderID].Target = &enemyID

	status := statusWithCondition("Execute", &instanceconfig.StatusEffectCondition{Type: "targetHealthPct", Comparison: "below", Threshold: 20})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.RefreshStatusEffectConditionsForTest(state)
	assert.False(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0], "enemy is at full health")

	state.Units[enemyID].Health = 10
	instance.RefreshStatusEffectConditionsForTest(state)
	assert.True(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])
}

func TestRefreshStatusEffectConditions_NoTargetIsUnmet(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	status := statusWithCondition("Execute", &instanceconfig.StatusEffectCondition{Type: "targetHealthPct", Comparison: "above", Threshold: 0})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.RefreshStatusEffectConditionsForTest(state)

	assert.False(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])
}

func TestRefreshStatusEffectConditions_CasterResource(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	state.Units[applierID].Resources = map[string]*instancestate.ResourceState{"combo points": {Current: 2}}
	status := statusWithCondition("Finisher", &instanceconfig.StatusEffectCondition{Type: "casterResource", ResourceName: "combo points", Comparison: "above", Threshold: 3})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.RefreshStatusEffectConditionsForTest(state)
	assert.False(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])

	state.Units[applierID].Resources["combo points"].Current = 5
	instance.RefreshStatusEffectConditionsForTest(state)
	assert.True(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])
}

func TestRefreshStatusEffectConditions_HasStatus(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	conditional := statusWithCondition("Combo Finisher", &instanceconfig.StatusEffectCondition{Type: "hasStatus", StatusName: "Enrage"})
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, conditional, 10.0, instanceconfig.Zone{}, time.Now())

	instance.RefreshStatusEffectConditionsForTest(state)
	assert.False(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])

	enrage := instanceconfig.Status{Name: "Enrage", ShortName: "Enrage", TreatAs: "buff", Stacking: "replace"}
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, enrage, 10.0, instanceconfig.Zone{}, time.Now())
	instance.RefreshStatusEffectConditionsForTest(state)

	var found bool
	for _, e := range state.Units[holderID].ActiveStatusEffects {
		if e.Status.Name == "Combo Finisher" {
			found = true
			assert.True(t, e.ConditionsMet[0])
		}
	}
	require.True(t, found)
}

func TestRefreshStatusEffectConditions_UnconditionalEffectStaysMet(t *testing.T) {
	holderID, applierID, state := twoUnitState(t)
	status := statusWithCondition("Passive", nil)
	command.ApplyStatus(state.Units[holderID], state.Units[applierID], applierID, status, 10.0, instanceconfig.Zone{}, time.Now())

	instance.RefreshStatusEffectConditionsForTest(state)

	assert.True(t, state.Units[holderID].ActiveStatusEffects[0].ConditionsMet[0])
}
