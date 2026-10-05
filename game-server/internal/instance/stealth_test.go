package instance_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func stealthZone() instanceconfig.Zone {
	rating := 5.0
	return instanceconfig.Zone{
		Elvl: 10,
		UnitTypes: map[string]instanceconfig.UnitType{
			"sneak": {Name: "Sneak", TokenRadius: 1, MaxHP: 100, DPS: 1, AttackSpeed: 1, Stealth: &rating},
			"brute": {Name: "Brute", TokenRadius: 1, MaxHP: 100, DPS: 1, AttackSpeed: 1},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "m",
			Units: []instanceconfig.Unit{
				{Identifier: "s1", UnitType: "sneak", Hostility: "hostile"},
				{Identifier: "b1", UnitType: "brute", Hostility: "hostile"},
			},
		}},
	}
}

func unitByZoneID(state *instancestate.InstanceState, zoneID string) *instancestate.UnitState {
	for _, u := range state.Units {
		if u.ZoneUnitIdentifier == zoneID {
			return u
		}
	}
	return nil
}

func TestStealth_SpawnsStealthedOnlyWithARating(t *testing.T) {
	state, err := instancestate.NewInstanceState(stealthZone())
	require.NoError(t, err)
	assert.True(t, unitByZoneID(state, "s1").Stealthed)
	assert.False(t, unitByZoneID(state, "b1").Stealthed)
}

func TestStealth_BreaksOnEngage(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	sneak := unitByZoneID(state, "s1")
	prev := state.Clone()
	manualEngage(sneak, uuid.New())
	instance.UpdateStealthForTest(state, prev, zone)
	assert.False(t, sneak.Stealthed)
}

func TestStealth_BreaksOnDamageWhileIdle(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	sneak := unitByZoneID(state, "s1")
	prev := state.Clone()
	sneak.Health -= 10
	instance.UpdateStealthForTest(state, prev, zone)
	assert.False(t, sneak.Stealthed)

	// And stays broken while it's still idle.
	prev = state.Clone()
	instance.UpdateStealthForTest(state, prev, zone)
	assert.False(t, sneak.Stealthed)
}

func TestStealth_RestealthsOnReset(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	sneak := unitByZoneID(state, "s1")
	sneak.Stealthed = false
	sneak.Status = instancestate.UnitStatusLeashing
	prev := state.Clone()
	sneak.Status = instancestate.UnitStatusIdle
	instance.UpdateStealthForTest(state, prev, zone)
	assert.True(t, sneak.Stealthed)
}

func TestStealth_RestealthsOnRespawn(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	sneak := unitByZoneID(state, "s1")
	sneak.Stealthed = false
	sneak.Status = instancestate.UnitStatusDead
	prev := state.Clone()
	sneak.Status = instancestate.UnitStatusRespawning
	instance.UpdateStealthForTest(state, prev, zone)
	assert.True(t, sneak.Stealthed)
}

func TestStealth_NeverForUnitTypesWithoutARating(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	brute := unitByZoneID(state, "b1")
	brute.Status = instancestate.UnitStatusLeashing
	prev := state.Clone()
	brute.Status = instancestate.UnitStatusIdle
	instance.UpdateStealthForTest(state, prev, zone)
	assert.False(t, brute.Stealthed)
}
