package instanceconfig_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func wallZone(locations ...instanceconfig.Location) instanceconfig.Zone {
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Barriers: []instanceconfig.Barrier{
				{Type: "wall", Locations: locations},
			},
		}},
	}
}

func circleZone(cx, cy, radius float64) instanceconfig.Zone {
	loc := instanceconfig.Location{X: cx, Y: cy}
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{{
			Identifier: "map1",
			Barriers: []instanceconfig.Barrier{
				{Type: "circle", Location: &loc, Radius: radius},
			},
		}},
	}
}

func TestLineOfSightClear_NoBarriersIsClear(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "map1"}}}
	assert.True(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_UnknownMapIsClear(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "other"}}}
	assert.True(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_WallBlocksCrossingLine(t *testing.T) {
	zone := wallZone(
		instanceconfig.Location{X: 5, Y: -5},
		instanceconfig.Location{X: 5, Y: 5},
	)
	assert.False(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_WallNotCrossedIsClear(t *testing.T) {
	zone := wallZone(
		instanceconfig.Location{X: 5, Y: 10},
		instanceconfig.Location{X: 5, Y: 20},
	)
	assert.True(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_WallSegmentBeyondEndpointsIsClear(t *testing.T) {
	// A "wall" with only one segment; the line only crosses the infinite
	// extension of it, not the actual segment between the two points.
	zone := wallZone(
		instanceconfig.Location{X: 5, Y: 100},
		instanceconfig.Location{X: 5, Y: 200},
	)
	assert.True(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_MultiSegmentWallSecondLegBlocks(t *testing.T) {
	zone := wallZone(
		instanceconfig.Location{X: 5, Y: 100},
		instanceconfig.Location{X: 5, Y: 200},
		instanceconfig.Location{X: 5, Y: -5},
		instanceconfig.Location{X: 5, Y: 5},
	)
	assert.False(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_CircleBlocksLineThroughIt(t *testing.T) {
	zone := circleZone(5, 0, 2)
	assert.False(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}

func TestLineOfSightClear_CircleFarFromLineIsClear(t *testing.T) {
	zone := circleZone(5, 20, 2)
	assert.True(t, instanceconfig.LineOfSightClear(zone, "map1", 0, 0, 10, 0))
}
