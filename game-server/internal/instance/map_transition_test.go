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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// transitionZone builds a zone with two maps linked by line connections.
// map_a has a line connection at y=100; map_b has a line connection at y=0.
func transitionZone() instanceconfig.Zone {
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{
				Identifier:     "map_a",
				FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 120},
				Connections: []instanceconfig.MapConnection{
					{Identifier: "exit", Type: "line", Start: locPtr(40, 100), End: locPtr(60, 100)},
				},
			},
			{
				Identifier:     "map_b",
				FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100},
				Connections: []instanceconfig.MapConnection{
					{Identifier: "entrance", Type: "line", Start: locPtr(40, 0), End: locPtr(60, 0)},
				},
			},
		},
		ZoneLinks: []instanceconfig.ZoneLink{
			{
				ConnectionA: instanceconfig.ConnectionIdentifier{Map: "map_a", Connection: "exit"},
				ConnectionB: instanceconfig.ConnectionIdentifier{Map: "map_b", Connection: "entrance"},
				OneWay:      false,
				RequiredKey: nil,
			},
		},
	}
}

func playerOnMap(s *instancestate.InstanceState, mapID string, x, y float64) (uuid.UUID, *instancestate.UnitState) {
	p := &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Alice",
		MapIdentifier:      mapID,
		Position:           instanceconfig.Position{X: x, Y: y},
		Status:             instancestate.UnitStatusIdle,
		Health:             100,
		MaxHealth:          100,
	}
	id := uuid.New()
	s.Units[id] = p
	return id, p
}

func emptyInstanceState() *instancestate.InstanceState {
	return &instancestate.InstanceState{Units: make(map[uuid.UUID]*instancestate.UnitState)}
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

// prevStateWithUnit builds a prevState containing a single unit at the given position.
// Used to simulate the unit's position on the tick before a transition fires.
func prevStateWithUnit(id uuid.UUID, mapID string, x, y float64) *instancestate.InstanceState {
	prev := emptyInstanceState()
	prev.Units[id] = &instancestate.UnitState{
		ZoneUnitIdentifier: "player:Alice",
		MapIdentifier:      mapID,
		Position:           instanceconfig.Position{X: x, Y: y},
	}
	return prev
}

func TestMapTransition_PlayerCrossesLineConnection(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	id, p := playerOnMap(s, "map_a", 50, 99) // 1ft south of exit at y=100, within trigger dist
	prev := prevStateWithUnit(id, "map_a", 50, 97)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	assert.Equal(t, "map_b", p.MapIdentifier)
}

func TestMapTransition_PlayerNotNearConnection_NoTransition(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	_, p := playerOnMap(s, "map_a", 50, 50) // middle of map_a, far from exit

	instance.ApplyMapTransitionsForTest(s, nil, zone)

	assert.Equal(t, "map_a", p.MapIdentifier)
}

func TestMapTransition_SetsPositionOnDestination(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	// Player 1ft south of exit midpoint (t=0.5), approaching from south (y < 100).
	id, p := playerOnMap(s, "map_a", 50, 99)
	prev := prevStateWithUnit(id, "map_a", 50, 97) // 3ft south — clearly on approach side

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	// t=0.5 on map_b entrance → x=50; nudged 2ft to far (north) side → y=2.
	assert.Equal(t, "map_b", p.MapIdentifier)
	assert.InDelta(t, 50.0, p.Position.X, 0.1)
	assert.InDelta(t, 2.0, p.Position.Y, 0.1)
}

func TestMapTransition_TPositionPreserved(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	// Player near the Start end of the exit (t≈0.1), approaching from south.
	id, p := playerOnMap(s, "map_a", 42, 99)
	prev := prevStateWithUnit(id, "map_a", 42, 97)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	// t=0.1 on map_b entrance → x≈42, nudged north → y≈2.
	assert.Equal(t, "map_b", p.MapIdentifier)
	assert.InDelta(t, 42.0, p.Position.X, 0.1)
	assert.InDelta(t, 2.0, p.Position.Y, 0.1)
}

func TestMapTransition_BidirectionalReturnTrip(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	// Player 1ft north of map_b entrance at y=0, approaching from north.
	id, p := playerOnMap(s, "map_b", 50, 1)
	p.Position.Angle = 180 // facing south
	prev := prevStateWithUnit(id, "map_b", 50, 3)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	assert.Equal(t, "map_a", p.MapIdentifier)
	// t=0.5 on map_a exit → x=50; nudged 2ft to far (south) side → y=98.
	assert.InDelta(t, 50.0, p.Position.X, 0.1)
	assert.InDelta(t, 98.0, p.Position.Y, 0.1)
}

func TestMapTransition_OneWayBlocksReturn(t *testing.T) {
	zone := transitionZone()
	zone.ZoneLinks[0].OneWay = true
	s := emptyInstanceState()
	id, p := playerOnMap(s, "map_b", 50, 1)
	prev := prevStateWithUnit(id, "map_b", 50, 3)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	assert.Equal(t, "map_b", p.MapIdentifier)
}

func TestMapTransition_RequiredKeyBlocksTransition(t *testing.T) {
	zone := transitionZone()
	key := "cave_key"
	zone.ZoneLinks[0].RequiredKey = &key
	s := emptyInstanceState()
	id, p := playerOnMap(s, "map_a", 50, 99)
	prev := prevStateWithUnit(id, "map_a", 50, 97)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	assert.Equal(t, "map_a", p.MapIdentifier)
}

func TestMapTransition_DeadUnitNotTransitioned(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	id, p := playerOnMap(s, "map_a", 50, 99)
	p.Status = instancestate.UnitStatusDead
	prev := prevStateWithUnit(id, "map_a", 50, 97)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	assert.Equal(t, "map_a", p.MapIdentifier)
}

func TestMapTransition_NPCAggroDroppedOnTransition(t *testing.T) {
	zone := transitionZone()
	s := emptyInstanceState()
	playerID, p := playerOnMap(s, "map_a", 50, 99)

	// NPC on the same map targeting the player.
	npcID := uuid.New()
	s.Units[npcID] = &instancestate.UnitState{
		ZoneUnitIdentifier: "goblin_1",
		MapIdentifier:      "map_a",
		Position:           instanceconfig.Position{X: 50, Y: 90},
		Status:             instancestate.UnitStatusEngaged,
		Target:             &playerID,
	}

	prev := prevStateWithUnit(playerID, "map_a", 50, 97)

	instance.ApplyMapTransitionsForTest(s, prev, zone)

	require.Equal(t, "map_b", p.MapIdentifier)
	assert.Nil(t, s.Units[npcID].Target)
	assert.Equal(t, instancestate.UnitStatusIdle, s.Units[npcID].Status)
}
