package command_test

import (
	"math/rand"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestTriggerHolds_NilTriggerOrHolder(t *testing.T) {
	holder := &instancestate.UnitState{Health: 50, MaxHealth: 100}
	assert.False(t, command.TriggerHolds(holder, false, false, nil))
	assert.False(t, command.TriggerHolds(nil, false, false, &instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 100}))
}

func TestTriggerHolds_HealthAboveBelow(t *testing.T) {
	holder := &instancestate.UnitState{Health: 20, MaxHealth: 100}
	assert.True(t, command.TriggerHolds(holder, false, false, &instanceconfig.StatusTrigger{Type: "healthBelow", Threshold: 30}))
	assert.False(t, command.TriggerHolds(holder, false, false, &instanceconfig.StatusTrigger{Type: "healthAbove", Threshold: 30}))
}

func TestTriggerHolds_TakesDamageDealsDamage(t *testing.T) {
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100}
	assert.True(t, command.TriggerHolds(holder, true, false, &instanceconfig.StatusTrigger{Type: "takesDamage"}))
	assert.False(t, command.TriggerHolds(holder, false, false, &instanceconfig.StatusTrigger{Type: "takesDamage"}))
	assert.True(t, command.TriggerHolds(holder, false, true, &instanceconfig.StatusTrigger{Type: "dealsDamage"}))
	assert.False(t, command.TriggerHolds(holder, false, false, &instanceconfig.StatusTrigger{Type: "dealsDamage"}))
}

func TestFireTriggeredEffect_SelfHeal(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holder := &instancestate.UnitState{Health: 50, MaxHealth: 100}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "heal", Affects: "self", Amount: &instanceconfig.ValueRange{15, 15}},
	}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}

	command.FireTriggeredEffect(uuid.New(), holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)

	assert.Greater(t, holder.Health, 50.0)
}

func TestFireTriggeredEffect_HarmTarget(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holderID, targetID := uuid.New(), uuid.New()
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100, Target: &targetID}
	target := &instancestate.UnitState{Health: 100, MaxHealth: 100, Hostility: "hostile"}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{targetID: target}}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "harm", Affects: "target", Amount: &instanceconfig.ValueRange{20, 20}},
	}

	// A harm roll can miss (5% base chance) and deal 0 - retry a bounded
	// number of times so that ~1-in-20 chance doesn't make this test
	// flaky; any non-miss (an overwhelming majority within 10 tries) drops
	// target's health.
	for i := 0; i < 10 && target.Health == 100.0; i++ {
		command.FireTriggeredEffect(holderID, holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)
	}

	assert.Less(t, target.Health, 100.0)
	require.NotNil(t, target.TaggedBy)
	assert.Equal(t, holderID, *target.TaggedBy)
}

func TestFireTriggeredEffect_HarmTarget_NoTargetIsNoOp(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "harm", Affects: "target", Amount: &instanceconfig.ValueRange{20, 20}},
	}

	assert.NotPanics(t, func() {
		command.FireTriggeredEffect(uuid.New(), holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)
	})
}

func TestFireTriggeredEffect_LethalHarmKillsAndClearsTarget(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holderID, targetID := uuid.New(), uuid.New()
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100, Target: &targetID}
	target := &instancestate.UnitState{Health: 1, MaxHealth: 100, Hostility: "hostile"}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{targetID: target}}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "harm", Affects: "target", Amount: &instanceconfig.ValueRange{100, 100}},
	}

	// A harm roll can miss (5% base chance) and deal 0, which wouldn't kill
	// a 1-HP target - retry a bounded number of times so that ~1-in-20
	// chance doesn't make this test flaky; target.Health resets to 1 each
	// miss, so any non-miss (an overwhelming majority within 10 tries)
	// still kills it outright.
	for i := 0; i < 10 && target.Status != instancestate.UnitStatusDead; i++ {
		target.Health = 1
		command.FireTriggeredEffect(holderID, holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)
	}

	assert.Equal(t, instancestate.UnitStatusDead, target.Status)
	assert.Nil(t, holder.Target, "holder should drop the dead target")
}

func TestFireTriggeredEffect_Resource(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holder := &instancestate.UnitState{
		Resources: map[string]*instancestate.ResourceState{"fury": {Current: 0, Max: 10}},
	}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "resource", Affects: "self", ResourceName: "fury", Delta: 5},
	}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}

	command.FireTriggeredEffect(uuid.New(), holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)

	assert.Equal(t, 5.0, holder.Resources["fury"].Current)
}

func TestFireTriggeredEffect_Status(t *testing.T) {
	rng := rand.New(rand.NewSource(1))
	holder := &instancestate.UnitState{Health: 100, MaxHealth: 100}
	status := instanceconfig.Status{Name: "Combo", ShortName: "Combo", TreatAs: "inherent", Stacking: "replace"}
	eff := instanceconfig.StatusEffect{
		Type: "triggered", InternalCooldown: 3,
		TriggeredEffect: &instanceconfig.TriggeredEffect{Type: "status", Affects: "self", Duration: 5, Status: &status},
	}
	state := &instancestate.InstanceState{Units: map[uuid.UUID]*instancestate.UnitState{}}

	command.FireTriggeredEffect(uuid.New(), holder, eff, instanceconfig.Zone{}, time.Now(), state, rng)

	require.Len(t, holder.ActiveStatusEffects, 1)
	assert.Equal(t, "Combo", holder.ActiveStatusEffects[0].Status.Name)
}
