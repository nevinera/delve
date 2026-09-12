package pathing

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestSegToPointDist(t *testing.T) {
	assert.InDelta(t, 5, segToPointDist(0, 0, 10, 0, 5, 5), 1e-9)
	assert.InDelta(t, 0, segToPointDist(0, 0, 10, 0, 5, 0), 1e-9)
	assert.InDelta(t, 5, segToPointDist(0, 0, 10, 0, -5, 0), 1e-9, "nearest point clamps to segment endpoint")
}

func TestSegToSegDist(t *testing.T) {
	assert.InDelta(t, 0, segToSegDist(0, 0, 10, 0, 5, -5, 5, 5), 1e-9, "crossing segments")
	assert.InDelta(t, 5, segToSegDist(0, 0, 10, 0, 0, 5, 10, 5), 1e-9, "parallel segments")
	assert.InDelta(t, 5, segToSegDist(0, 0, 0, 10, 5, 0, 5, 10), 1e-9, "parallel, non-overlapping in the perpendicular sense")
}

func wallBarrier(locations ...instanceconfig.Location) instanceconfig.Barrier {
	return instanceconfig.Barrier{Type: "wall", Locations: locations}
}

func circleBarrier(x, y, radius float64) instanceconfig.Barrier {
	loc := instanceconfig.Location{X: x, Y: y}
	return instanceconfig.Barrier{Type: "circle", Location: &loc, Radius: radius}
}

func TestSegmentBlockedByBarriers_WallRespectsRadius(t *testing.T) {
	barriers := []instanceconfig.Barrier{
		wallBarrier(instanceconfig.Location{X: 5, Y: -5}, instanceconfig.Location{X: 5, Y: 5}),
	}
	assert.True(t, segmentBlockedByBarriers(0, 0, 10, 0, 0.01, barriers), "near-zero-radius unit crosses the wall directly")
	assert.False(t, segmentBlockedByBarriers(0, 10, 0, 20, 0.01, barriers), "far from the wall entirely")

	// A path that passes within 2ft of the wall (but not through it) is
	// blocked for a 2ft-radius unit, clear for a 0.5ft-radius unit.
	assert.True(t, segmentBlockedByBarriers(0, 6, 10, 6, 2, barriers))
	assert.False(t, segmentBlockedByBarriers(0, 6, 10, 6, 0.5, barriers))
}

func TestSegmentBlockedByBarriers_CircleRespectsRadius(t *testing.T) {
	barriers := []instanceconfig.Barrier{circleBarrier(5, 0, 2)}
	assert.True(t, segmentBlockedByBarriers(0, 0, 10, 0, 0, barriers))
	assert.False(t, segmentBlockedByBarriers(0, 5, 10, 5, 0, barriers))
	assert.True(t, segmentBlockedByBarriers(0, 3.5, 10, 3.5, 2, barriers), "unit radius extends reach into the circle's margin")
}

func TestPointBlockedByBarriers(t *testing.T) {
	barriers := []instanceconfig.Barrier{circleBarrier(0, 0, 5)}
	assert.True(t, pointBlockedByBarriers(0, 0, 1, barriers), "standing at the center")
	assert.True(t, pointBlockedByBarriers(5.5, 0, 1, barriers), "standing just inside the margin")
	assert.False(t, pointBlockedByBarriers(7, 0, 1, barriers), "standing clear of the margin")
}
