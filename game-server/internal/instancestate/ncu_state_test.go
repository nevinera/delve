package instancestate_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

func zoneWithNCUs(maps ...instanceconfig.Map) instanceconfig.Zone {
	return instanceconfig.Zone{Name: "Test Zone", Maps: maps}
}

func grizzle(id string) instanceconfig.NCU {
	return instanceconfig.NCU{
		Identifier:  id,
		Name:        "Grizzle",
		TokenRadius: 2,
		Position:    instanceconfig.Position{X: 5, Y: 6, Angle: 180},
		Movement:    instanceconfig.UnitMovement{Type: "still"},
	}
}

func TestNewInstanceState_NCUs(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWithNCUs(
		instanceconfig.Map{Identifier: "m1", NCUs: []instanceconfig.NCU{grizzle("grizzle")}},
	))
	require.NoError(t, err)
	require.Len(t, state.NCUs, 1)
	assert.Empty(t, state.Units)

	for _, n := range state.NCUs {
		assert.Equal(t, "grizzle", n.ZoneNCUIdentifier)
		assert.Equal(t, "m1", n.MapIdentifier)
		assert.Equal(t, instanceconfig.Position{X: 5, Y: 6, Angle: 180}, n.Position)
		assert.Equal(t, 2.0, n.Radius)
		assert.Equal(t, 1.0, n.SpeedFactor, "defaults to 1.0")
		assert.Equal(t, "still", n.MovementConfig.Type)
	}
}

func TestNewInstanceState_NCUSpeedFactor(t *testing.T) {
	n := grizzle("grizzle")
	n.SpeedFactor = 0.5
	state, err := instancestate.NewInstanceState(zoneWithNCUs(instanceconfig.Map{Identifier: "m1", NCUs: []instanceconfig.NCU{n}}))
	require.NoError(t, err)
	for _, s := range state.NCUs {
		assert.Equal(t, 0.5, s.SpeedFactor)
	}
}

func TestNewInstanceState_NCUMissingIdentifier(t *testing.T) {
	_, err := instancestate.NewInstanceState(zoneWithNCUs(
		instanceconfig.Map{Identifier: "m1", NCUs: []instanceconfig.NCU{grizzle("")}},
	))
	assert.ErrorContains(t, err, "no identifier")
}

func TestNewInstanceState_DuplicateNCUIdentifier(t *testing.T) {
	_, err := instancestate.NewInstanceState(zoneWithNCUs(
		instanceconfig.Map{Identifier: "m1", NCUs: []instanceconfig.NCU{grizzle("g")}},
		instanceconfig.Map{Identifier: "m2", NCUs: []instanceconfig.NCU{grizzle("g")}},
	))
	assert.ErrorContains(t, err, `"g" appears on both map "m1" and map "m2"`)
}

func TestClone_CopiesNCUsIndependently(t *testing.T) {
	state, err := instancestate.NewInstanceState(zoneWithNCUs(
		instanceconfig.Map{Identifier: "m1", NCUs: []instanceconfig.NCU{grizzle("grizzle")}},
	))
	require.NoError(t, err)

	c := state.Clone()
	for id, n := range c.NCUs {
		n.Position.X = 99
		assert.Equal(t, 5.0, state.NCUs[id].Position.X)
	}
	assert.Len(t, c.NCUs, 1)
}
