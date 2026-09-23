package command_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestConditionMet_NilConditionIsAlwaysMet(t *testing.T) {
	assert.True(t, command.ConditionMet(nil, nil, nil, nil))
}

func TestConditionMet_HasStatus(t *testing.T) {
	holder := &instancestate.UnitState{
		ActiveStatusEffects: []instancestate.ActiveStatusEffect{
			{Status: instanceconfig.Status{Name: "Enrage"}},
		},
	}
	cond := &instanceconfig.StatusEffectCondition{Type: "hasStatus", StatusName: "Enrage"}
	assert.True(t, command.ConditionMet(holder, nil, nil, cond))

	missing := &instanceconfig.StatusEffectCondition{Type: "hasStatus", StatusName: "Fear"}
	assert.False(t, command.ConditionMet(holder, nil, nil, missing))

	assert.False(t, command.ConditionMet(nil, nil, nil, cond), "a nil holder can't have any status")
}

func TestConditionMet_SelfHealthPct(t *testing.T) {
	holder := &instancestate.UnitState{Health: 25, MaxHealth: 100}

	assert.True(t, command.ConditionMet(holder, nil, nil, &instanceconfig.StatusEffectCondition{Type: "selfHealthPct", Comparison: "below", Threshold: 30}))
	assert.False(t, command.ConditionMet(holder, nil, nil, &instanceconfig.StatusEffectCondition{Type: "selfHealthPct", Comparison: "above", Threshold: 30}))
	assert.False(t, command.ConditionMet(nil, nil, nil, &instanceconfig.StatusEffectCondition{Type: "selfHealthPct", Comparison: "below", Threshold: 30}))
}

func TestConditionMet_SelfHealthPct_ZeroMaxHealthIsZeroPctNotDivideByZero(t *testing.T) {
	holder := &instancestate.UnitState{Health: 0, MaxHealth: 0}
	assert.True(t, command.ConditionMet(holder, nil, nil, &instanceconfig.StatusEffectCondition{Type: "selfHealthPct", Comparison: "below", Threshold: 1}))
}

func TestConditionMet_TargetHealthPct(t *testing.T) {
	target := &instancestate.UnitState{Health: 80, MaxHealth: 100}

	assert.True(t, command.ConditionMet(nil, nil, target, &instanceconfig.StatusEffectCondition{Type: "targetHealthPct", Comparison: "above", Threshold: 50}))
	assert.False(t, command.ConditionMet(nil, nil, nil, &instanceconfig.StatusEffectCondition{Type: "targetHealthPct", Comparison: "above", Threshold: 50}),
		"no target (holder has none, or it's left the instance) can't satisfy a target condition")
}

func TestConditionMet_CasterResource(t *testing.T) {
	applier := &instancestate.UnitState{
		Resources: map[string]*instancestate.ResourceState{
			"combo points": {Current: 4},
		},
	}
	cond := &instanceconfig.StatusEffectCondition{Type: "casterResource", ResourceName: "combo points", Comparison: "above", Threshold: 3}
	assert.True(t, command.ConditionMet(nil, applier, nil, cond))

	assert.False(t, command.ConditionMet(nil, nil, nil, cond), "no applier (they've left the instance) can't satisfy a caster condition")

	unknownResource := &instanceconfig.StatusEffectCondition{Type: "casterResource", ResourceName: "mana", Comparison: "above", Threshold: 0}
	assert.False(t, command.ConditionMet(nil, applier, nil, unknownResource), "applier has no such resource")
}

func TestConditionMet_UnknownTypeIsUnmet(t *testing.T) {
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100}
	assert.False(t, command.ConditionMet(holder, holder, holder, &instanceconfig.StatusEffectCondition{Type: "moonPhase"}))
}
