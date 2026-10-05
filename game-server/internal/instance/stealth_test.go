package instance_test

import (
	"encoding/json"
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

func soleUnit(t *testing.T, units map[string]any) map[string]any {
	t.Helper()
	require.Len(t, units, 1)
	for _, u := range units {
		return u.(map[string]any)
	}
	return nil
}

func TestStealthMessages_FullStateLeavesOutPosition(t *testing.T) {
	state := stateWithUnit(t)
	for _, u := range state.Units {
		u.Stealthed = true
	}
	unit := soleUnit(t, fullState(t, state)["units"].(map[string]any))
	assert.Nil(t, unit["position"])
	assert.Equal(t, true, unit["stealthed"])
}

func TestStealthMessages_DeltaHidesAndRevealsPosition(t *testing.T) {
	state := stateWithUnit(t)
	var goblin *instancestate.UnitState
	for _, u := range state.Units {
		goblin = u
	}

	prev := state.Clone()
	goblin.Stealthed = true
	goblin.Position.X = 3
	patch := soleUnit(t, delta(t, prev, state)["unit_updates"].(map[string]any))
	assert.Equal(t, true, patch["stealthed"])
	assert.Contains(t, patch, "position")
	assert.Nil(t, patch["position"])

	// Moving while stealthed sends nothing.
	prev = state.Clone()
	goblin.Position.X = 6
	assert.Empty(t, delta(t, prev, state)["unit_updates"])

	prev = state.Clone()
	goblin.Stealthed = false
	patch = soleUnit(t, delta(t, prev, state)["unit_updates"].(map[string]any))
	assert.Equal(t, false, patch["stealthed"])
	assert.Equal(t, float64(6), patch["position"].(map[string]any)["x"])
}

func TestStealthMessages_ChecksumIgnoresStealthedPosition(t *testing.T) {
	state := stateWithUnit(t)
	for _, u := range state.Units {
		u.Stealthed = true
	}
	before := state.Checksum()
	for _, u := range state.Units {
		u.Position.X += 10
	}
	assert.Equal(t, before, state.Checksum())
}

func TestStealthMessages_ViewSplicedForDetectingPlayersOnly(t *testing.T) {
	zone := stealthZone()
	state, _ := instancestate.NewInstanceState(zone)
	sneak := unitByZoneID(state, "s1")
	sneak.Position = instanceconfig.Position{X: 0, Y: 10}
	sneakID := unitID(state, sneak)
	near, far := uuid.New(), uuid.New()
	state.Units[near] = &instancestate.UnitState{ZoneUnitIdentifier: "player:a", MapIdentifier: "m", Position: instanceconfig.Position{X: 0, Y: 0}}
	state.Units[far] = &instancestate.UnitState{ZoneUnitIdentifier: "player:b", MapIdentifier: "m", Position: instanceconfig.Position{X: 0, Y: -60}}

	shared := []byte(`{"type":"delta"}`)
	raw, err := instance.StealthViewForTest(shared, state, near, zone)
	require.NoError(t, err)
	var msg map[string]any
	require.NoError(t, json.Unmarshal(raw, &msg))
	assert.Equal(t, "delta", msg["type"])
	entry := msg["stealth_view"].(map[string]any)[sneakID.String()].(map[string]any)
	assert.Equal(t, "faint", entry["visibility"], "an ungeared player 10 elvl under the map, against stealth 5")
	assert.Equal(t, float64(10), entry["position"].(map[string]any)["y"])
	assert.Equal(t, `{"type":"delta"}`, string(shared), "the shared payload is left alone")

	raw, err = instance.StealthViewForTest(shared, state, far, zone)
	require.NoError(t, err)
	assert.Equal(t, shared, raw)
}
