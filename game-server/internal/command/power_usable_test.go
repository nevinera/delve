package command_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/command"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func TestPowerUsable_TrueWithNoRestrictions(t *testing.T) {
	unit := &instancestate.UnitState{}
	assert.True(t, command.PowerUsable(unit, instanceconfig.Power{}, time.Now()))
}

func TestPowerUsable_FalseOnGlobalCooldown(t *testing.T) {
	unit := &instancestate.UnitState{GlobalCooldownEndsAt: time.Now().Add(time.Second)}
	assert.False(t, command.PowerUsable(unit, instanceconfig.Power{}, time.Now()))
}

func TestPowerUsable_FalseOnPowerCooldown(t *testing.T) {
	unit := &instancestate.UnitState{PowerCooldowns: map[string]time.Time{"Recover": time.Now().Add(time.Second)}}
	power := instanceconfig.Power{Name: "Recover", Cooldown: 10.0}
	assert.False(t, command.PowerUsable(unit, power, time.Now()))
}

func TestPowerUsable_TrueOncePowerCooldownExpires(t *testing.T) {
	unit := &instancestate.UnitState{PowerCooldowns: map[string]time.Time{"Recover": time.Now().Add(-time.Second)}}
	power := instanceconfig.Power{Name: "Recover", Cooldown: 10.0}
	assert.True(t, command.PowerUsable(unit, power, time.Now()))
}

func TestPowerUsable_FalseWhenResourceBelowCost(t *testing.T) {
	unit := &instancestate.UnitState{Resources: map[string]*instancestate.ResourceState{"energy": {Current: 10.0, Max: 100.0}}}
	power := instanceconfig.Power{CostType: "energy", CostAmount: 30.0}
	assert.False(t, command.PowerUsable(unit, power, time.Now()))
}

func TestPowerUsable_TrueWhenResourceMeetsCostExactly(t *testing.T) {
	unit := &instancestate.UnitState{Resources: map[string]*instancestate.ResourceState{"energy": {Current: 30.0, Max: 100.0}}}
	power := instanceconfig.Power{CostType: "energy", CostAmount: 30.0}
	assert.True(t, command.PowerUsable(unit, power, time.Now()))
}

func TestPowerUsable_FalseWhenUnitHasNoSuchResourceAtAll(t *testing.T) {
	unit := &instancestate.UnitState{Resources: map[string]*instancestate.ResourceState{"mana": {Current: 100.0, Max: 100.0}}}
	power := instanceconfig.Power{CostType: "energy", CostAmount: 30.0}
	assert.False(t, command.PowerUsable(unit, power, time.Now()))
}

func TestClampResource_ClampsBelowZero(t *testing.T) {
	assert.Equal(t, 0.0, command.ClampResource(-5.0, 100.0))
}

func TestClampResource_ClampsAboveMax(t *testing.T) {
	assert.Equal(t, 100.0, command.ClampResource(150.0, 100.0))
}

func TestClampResource_PassesThroughInRangeValues(t *testing.T) {
	assert.Equal(t, 42.0, command.ClampResource(42.0, 100.0))
}

func TestAdjustResource_AddsAndClampsToMax(t *testing.T) {
	unit := &instancestate.UnitState{Resources: map[string]*instancestate.ResourceState{"combo points": {Current: 4, Max: 5}}}
	command.AdjustResource(unit, "combo points", 3)
	assert.Equal(t, 5.0, unit.Resources["combo points"].Current)
}

func TestAdjustResource_SubtractsAndClampsToZero(t *testing.T) {
	unit := &instancestate.UnitState{Resources: map[string]*instancestate.ResourceState{"energy": {Current: 10, Max: 100}}}
	command.AdjustResource(unit, "energy", -30)
	assert.Equal(t, 0.0, unit.Resources["energy"].Current)
}

func TestAdjustResource_NoOpWhenUnitHasNoSuchResource(t *testing.T) {
	unit := &instancestate.UnitState{}
	assert.NotPanics(t, func() { command.AdjustResource(unit, "energy", 30) })
	assert.Empty(t, unit.Resources)
}
