package instance_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// fillZone has two walled rooms whose doors link to each other. Outside each
// room is fill. "lower" is a room at 20-80 x 20-80 with its door on the
// bottom wall; "upper" is a room at 20-80 x 60-95 with its door on its
// bottom wall too, drawn right to left, so the map center (50, 50) is in
// its fill.
func fillZone() instanceconfig.Zone {
	room := func(id string, y0, y1 float64, door instanceconfig.MapConnection) instanceconfig.Map {
		return instanceconfig.Map{
			Identifier:     id,
			FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
			Barriers: []instanceconfig.Barrier{{Type: "wall", Locations: []instanceconfig.Location{
				{X: 45, Y: y0}, {X: 20, Y: y0}, {X: 20, Y: y1}, {X: 80, Y: y1}, {X: 80, Y: y0}, {X: 55, Y: y0},
			}}},
			Connections: []instanceconfig.MapConnection{door},
		}
	}
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			room("lower", 20, 80, instanceconfig.MapConnection{Identifier: "door", Type: "line", Start: locPtr(45, 20), End: locPtr(55, 20)}),
			room("upper", 60, 95, instanceconfig.MapConnection{Identifier: "door", Type: "line", Start: locPtr(55, 60), End: locPtr(45, 60)}),
		},
		ZoneLinks: []instanceconfig.ZoneLink{{
			ConnectionA: instanceconfig.ConnectionIdentifier{Map: "lower", Connection: "door"},
			ConnectionB: instanceconfig.ConnectionIdentifier{Map: "upper", Connection: "door"},
		}},
	}
}

func TestResolveCollisions_MovesAUnitOutOfTheFill(t *testing.T) {
	s := emptyInstanceState()
	_, u := playerOnMap(s, "lower", 30, 10)
	u.Radius = 2.2
	instance.ResolveCollisionsForTest(s, fillZone())
	// Onto open ground past the nearest wall, then clear of the wall itself.
	assert.InDelta(t, 30, u.Position.X, 1e-9)
	assert.InDelta(t, 22.4, u.Position.Y, 1e-9)
}

func TestResolveCollisions_LeavesAUnitOnOpenGround(t *testing.T) {
	s := emptyInstanceState()
	_, u := playerOnMap(s, "lower", 50, 50)
	u.Radius = 2.2
	instance.ResolveCollisionsForTest(s, fillZone())
	assert.Equal(t, instanceconfig.Position{X: 50, Y: 50}, u.Position)
}

func TestRestoreUnitsThatCrossedBarriers_LetsAUnitLeaveTheFill(t *testing.T) {
	s := emptyInstanceState()
	id, u := playerOnMap(s, "lower", 30, 22.4)
	prev := prevStateWithUnit(id, "lower", 30, 10)
	instance.RestoreUnitsThatCrossedBarriersForTest(s, prev, fillZone())
	assert.InDelta(t, 22.4, u.Position.Y, 1e-9)
}

func TestMapTransition_ArrivesOnTheOpenSideFacingIntoIt(t *testing.T) {
	s := emptyInstanceState()
	id, u := playerOnMap(s, "lower", 50, 20.5)
	prev := prevStateWithUnit(id, "lower", 50, 22)
	instance.ApplyMapTransitionsForTest(s, prev, fillZone())
	require.Equal(t, "upper", u.MapIdentifier)
	assert.InDelta(t, 50, u.Position.X, 1e-9)
	assert.InDelta(t, 62, u.Position.Y, 1e-9)
	assert.InDelta(t, 0, u.Position.Angle, 1e-9)
}

func TestSpawnPlacement_LineConnectionSpawnsOnItsOpenSide(t *testing.T) {
	mapID, pos := instance.SpawnPlacementForTest(fillZone(), "upper/door")
	assert.Equal(t, "upper", mapID)
	assert.InDelta(t, 50, pos.X, 1e-9)
	assert.InDelta(t, 64, pos.Y, 1e-9)
	assert.InDelta(t, 0, pos.Angle, 1e-9)

	_, pos = instance.SpawnPlacementForTest(fillZone(), "lower/door")
	assert.InDelta(t, 24, pos.Y, 1e-9)
}
