package pathing

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestBuild_OneMapGraphPerMap(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1"},
			{Identifier: "map2", Barriers: []instanceconfig.Barrier{circleBarrier(5, 0, 2)}},
		},
	}

	g, err := Build(zone, 0.5)
	require.NoError(t, err)

	_, ok := g.FindPath("map1", 0, 0, 10, 0)
	assert.True(t, ok)

	_, ok = g.FindPath("map2", 0, 0, 10, 0)
	assert.True(t, ok, "should route around the circle, not just fail")

	_, ok = g.FindPath("no-such-map", 0, 0, 10, 0)
	assert.False(t, ok)
}

// pointConnection builds a "point"-type MapConnection at (x,y).
func pointConnection(identifier string, x, y float64) instanceconfig.MapConnection {
	pos := instanceconfig.Position{X: x, Y: y}
	return instanceconfig.MapConnection{Identifier: identifier, Type: "point", Position: &pos}
}

func zoneLink(mapA, connA, mapB, connB string, oneWay bool) instanceconfig.ZoneLink {
	return instanceconfig.ZoneLink{
		ConnectionA: instanceconfig.ConnectionIdentifier{Map: mapA, Connection: connA},
		ConnectionB: instanceconfig.ConnectionIdentifier{Map: mapB, Connection: connB},
		OneWay:      oneWay,
	}
}

func TestFindPathTowardMap_RoutesToLinkedConnection(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Connections: []instanceconfig.MapConnection{pointConnection("door1", 10, 0)}},
			{Identifier: "map2", Connections: []instanceconfig.MapConnection{pointConnection("door2", -10, 0)}},
		},
		ZoneLinks: []instanceconfig.ZoneLink{zoneLink("map1", "door1", "map2", "door2", false)},
	}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	path, ok := g.FindPathTowardMap("map1", 0, 0, "map2")
	require.True(t, ok)
	require.NotEmpty(t, path)
	assert.Equal(t, Point{X: 10, Y: 0}, path[len(path)-1], "should head for map1's own connection point, not anything on map2")
}

func TestFindPathTowardMap_MultiHopThroughIntermediateMap(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Connections: []instanceconfig.MapConnection{pointConnection("a", 10, 0)}},
			{Identifier: "map2", Connections: []instanceconfig.MapConnection{
				pointConnection("b", -10, 0),
				pointConnection("c", 10, 0),
			}},
			{Identifier: "map3", Connections: []instanceconfig.MapConnection{pointConnection("d", -10, 0)}},
		},
		ZoneLinks: []instanceconfig.ZoneLink{
			zoneLink("map1", "a", "map2", "b", false),
			zoneLink("map2", "c", "map3", "d", false),
		},
	}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	path, ok := g.FindPathTowardMap("map1", 0, 0, "map3")
	require.True(t, ok, "map3 is reachable from map1 via map2")
	assert.Equal(t, Point{X: 10, Y: 0}, path[len(path)-1], "should head for map1's connection toward map2, the only route onward")
}

func TestFindPathTowardMap_OneWayBlocksReverseDirection(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Connections: []instanceconfig.MapConnection{pointConnection("door1", 10, 0)}},
			{Identifier: "map2", Connections: []instanceconfig.MapConnection{pointConnection("door2", -10, 0)}},
		},
		ZoneLinks: []instanceconfig.ZoneLink{zoneLink("map1", "door1", "map2", "door2", true)},
	}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	_, ok := g.FindPathTowardMap("map1", 0, 0, "map2")
	assert.True(t, ok, "forward direction should work")

	_, ok = g.FindPathTowardMap("map2", 0, 0, "map1")
	assert.False(t, ok, "one-way link should not permit routing back")
}

func TestFindPathTowardMap_NoLinkIsUnreachable(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1"},
			{Identifier: "map2"},
		},
	}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	_, ok := g.FindPathTowardMap("map1", 0, 0, "map2")
	assert.False(t, ok)
}

func TestFindPathTowardMap_SameMapReturnsFalse(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "map1"}}}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	_, ok := g.FindPathTowardMap("map1", 0, 0, "map1")
	assert.False(t, ok, "callers should use FindPath directly for same-map routing")
}

func TestFindPathTowardMap_LineConnectionUsesMidpoint(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Connections: []instanceconfig.MapConnection{{
				Identifier: "door1", Type: "line",
				Start: &instanceconfig.Location{X: 8, Y: -2},
				End:   &instanceconfig.Location{X: 8, Y: 2},
			}}},
			{Identifier: "map2", Connections: []instanceconfig.MapConnection{pointConnection("door2", -10, 0)}},
		},
		ZoneLinks: []instanceconfig.ZoneLink{zoneLink("map1", "door1", "map2", "door2", false)},
	}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	path, ok := g.FindPathTowardMap("map1", 0, 0, "map2")
	require.True(t, ok)
	assert.Equal(t, Point{X: 8, Y: 0}, path[len(path)-1])
}

func TestGraph_SegmentClear(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Barriers: []instanceconfig.Barrier{circleBarrier(5, 0, 2)}},
		},
	}
	g, err := Build(zone, 0.5)
	require.NoError(t, err)

	assert.True(t, g.SegmentClear("map1", 0, 5, 10, 5))
	assert.False(t, g.SegmentClear("map1", 0, 0, 10, 0))
	assert.True(t, g.SegmentClear("no-such-map", 0, 0, 10, 0), "unknown map is treated as clear")
}

func TestMaxUnitRadius(t *testing.T) {
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"rat":   {TokenRadius: 1},
			"ogre":  {TokenRadius: 5},
			"ghost": {TokenRadius: 2},
		},
	}
	m := instanceconfig.Map{
		Units: []instanceconfig.Unit{
			{UnitType: "rat"},
			{UnitType: "ogre"},
			{UnitType: "unknown-type"},
		},
	}

	assert.Equal(t, 5.0, MaxUnitRadius(zone, m, 1))
}

func TestMaxUnitRadius_NoUnitsUsesFallback(t *testing.T) {
	zone := instanceconfig.Zone{}
	m := instanceconfig.Map{}
	assert.Equal(t, 1.5, MaxUnitRadius(zone, m, 1.5))
}
