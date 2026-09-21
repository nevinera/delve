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
	unit := &instancestate.UnitState{Resource: 10.0}
	power := instanceconfig.Power{CostAmount: 30.0}
	assert.False(t, command.PowerUsable(unit, power, time.Now()))
}

func TestPowerUsable_TrueWhenResourceMeetsCostExactly(t *testing.T) {
	unit := &instancestate.UnitState{Resource: 30.0}
	power := instanceconfig.Power{CostAmount: 30.0}
	assert.True(t, command.PowerUsable(unit, power, time.Now()))
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
