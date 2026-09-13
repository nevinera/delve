package pathing

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestBucketRadius(t *testing.T) {
	cases := []struct{ in, want float64 }{
		{0.5, 1}, {1, 1},
		{1.5, 3}, {3, 3},
		{3.5, 5}, {5, 5},
		{5.5, 10}, {10, 10},
		{10.5, 15}, {15, 15},
		{20, 20}, {21, 25},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, bucketRadius(c.in), "bucketRadius(%v)", c.in)
	}
}

func TestBuild_OneMapGraphPerMap(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1"},
			{Identifier: "map2", Barriers: []instanceconfig.Barrier{circleBarrier(5, 0, 2)}},
		},
	}

	g, err := Build(zone, 0.5)
	require.NoError(t, err)

	_, ok := g.FindPath(0.5, "map1", 0, 0, 10, 0)
	assert.True(t, ok)

	_, ok = g.FindPath(0.5, "map2", 0, 0, 10, 0)
	assert.True(t, ok, "should route around the circle, not just fail")

	_, ok = g.FindPath(0.5, "no-such-map", 0, 0, 10, 0)
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

	path, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map2")
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

	path, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map3")
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

	_, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map2")
	assert.True(t, ok, "forward direction should work")

	_, ok = g.FindPathTowardMap(1.0, "map2", 0, 0, "map1")
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

	_, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map2")
	assert.False(t, ok)
}

func TestFindPathTowardMap_SameMapReturnsFalse(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "map1"}}}
	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	_, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map1")
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

	path, ok := g.FindPathTowardMap(1.0, "map1", 0, 0, "map2")
	require.True(t, ok)
	assert.Equal(t, Point{X: 8, Y: 0}, path[len(path)-1])
}

func TestFindPathTowardMap_UnknownBucketReturnsFalse(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Connections: []instanceconfig.MapConnection{pointConnection("door1", 10, 0)}},
			{Identifier: "map2", Connections: []instanceconfig.MapConnection{pointConnection("door2", -10, 0)}},
		},
		ZoneLinks: []instanceconfig.ZoneLink{zoneLink("map1", "door1", "map2", "door2", false)},
	}
	g, err := Build(zone, 1.0) // only the 1ft bucket gets built
	require.NoError(t, err)

	_, ok := g.FindPathTowardMap(20.0, "map1", 0, 0, "map2")
	assert.False(t, ok, "a bucket nothing was built for should behave like an unreachable route, not panic")
}

func TestGraph_SegmentClear(t *testing.T) {
	zone := instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{Identifier: "map1", Barriers: []instanceconfig.Barrier{circleBarrier(5, 0, 2)}},
		},
	}
	g, err := Build(zone, 0.5)
	require.NoError(t, err)

	assert.True(t, g.SegmentClear(0.5, "map1", 0, 5, 10, 5))
	assert.False(t, g.SegmentClear(0.5, "map1", 0, 0, 10, 0))
	assert.True(t, g.SegmentClear(0.5, "no-such-map", 0, 0, 10, 0), "unknown map is treated as clear")
	assert.True(t, g.SegmentClear(20.0, "map1", 0, 0, 10, 0), "unknown bucket is treated as clear")
}

func TestBuild_OnlyBuildsBucketsUnitsActuallyNeed(t *testing.T) {
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"rat":  {TokenRadius: 1},
			"ogre": {TokenRadius: 9},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "r1", UnitType: "rat", Position: instanceconfig.Position{}},
				{Identifier: "o1", UnitType: "ogre", Position: instanceconfig.Position{}},
			},
		}},
	}

	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	assert.Len(t, g.buckets, 2, "rat (bucket 1) and ogre (bucket 10) each need their own bucket")
	assert.Contains(t, g.buckets, 1.0)
	assert.Contains(t, g.buckets, 10.0)
}

func TestBuild_LargerBucketRespectsNarrowerClearance(t *testing.T) {
	// A gap just wide enough for a small unit (radius 1) to squeeze through
	// but too narrow for a large one (radius 5): two short walls leaving a
	// 3ft-wide doorway between them.
	zone := instanceconfig.Zone{
		UnitTypes: map[string]instanceconfig.UnitType{
			"rat":  {TokenRadius: 1},
			"ogre": {TokenRadius: 5},
		},
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Units: []instanceconfig.Unit{
				{Identifier: "r1", UnitType: "rat", Position: instanceconfig.Position{}},
				{Identifier: "o1", UnitType: "ogre", Position: instanceconfig.Position{}},
			},
			Barriers: []instanceconfig.Barrier{
				wallBarrier(instanceconfig.Location{X: -20, Y: 5}, instanceconfig.Location{X: -1.5, Y: 5}),
				wallBarrier(instanceconfig.Location{X: 1.5, Y: 5}, instanceconfig.Location{X: 20, Y: 5}),
			},
		}},
	}

	g, err := Build(zone, 1.0)
	require.NoError(t, err)

	// SegmentClear rather than FindPath: the walls are long but finite, so
	// a large unit could still (very slowly) detour around their far ends -
	// what this test cares about is that the doorway's own clearance
	// differs by bucket, not full reachability.
	assert.True(t, g.SegmentClear(1.0, "map1", 0, 0, 0, 10), "a 1ft-radius unit should fit through a 3ft gap")
	assert.False(t, g.SegmentClear(5.0, "map1", 0, 0, 0, 10), "a 5ft-radius unit should not fit through a 3ft gap")
}
