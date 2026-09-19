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

func segmentBlockedByBarriers(x1, y1, x2, y2, radius float64, barriers []instanceconfig.Barrier) bool {
	return newBarrierIndex(barriers).segmentBlocked(x1, y1, x2, y2, radius)
}

func travelBlockedByBarriers(x1, y1, x2, y2, radius float64, barriers []instanceconfig.Barrier) bool {
	return newBarrierIndex(barriers).travelBlocked(x1, y1, x2, y2, radius)
}

func pointBlockedByBarriers(x, y, radius float64, barriers []instanceconfig.Barrier) bool {
	return newBarrierIndex(barriers).pointBlocked(x, y, radius)
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

func TestTravelBlockedByBarriers_LenientAtStartButNotBeyond(t *testing.T) {
	barriers := []instanceconfig.Barrier{
		wallBarrier(instanceconfig.Location{X: -3, Y: 5}, instanceconfig.Location{X: 3, Y: 5}),
	}
	// (0,3) is only 2.0ft from the wall - inside a 2.25ft required radius -
	// but that's the start point's own existing distance, so moving away
	// from it (not closer to the wall) must not read as blocked.
	assert.False(t, travelBlockedByBarriers(0, 3, 0, 0, 2.25, barriers),
		"moving away from a wall the start point already rests near should be clear")
	assert.False(t, travelBlockedByBarriers(0, 3, 5, 3, 2.25, barriers),
		"moving parallel to that same wall, no closer, should also be clear")
	// Moving further INTO the same wall - actually closer than the start's
	// own 2.0ft - must still be caught.
	assert.True(t, travelBlockedByBarriers(0, 3, 0, 4.5, 2.25, barriers),
		"approaching closer than the start's own distance must still block")
	// A start point with full clearance behaves exactly like the strict
	// check (leniency is a no-op when it isn't needed).
	assert.True(t, travelBlockedByBarriers(0, 0, 0, 10, 2.25, barriers),
		"a well-clear start point must still detect a real crossing ahead")
}

func TestPointBlockedByBarriers(t *testing.T) {
	barriers := []instanceconfig.Barrier{circleBarrier(0, 0, 5)}
	assert.True(t, pointBlockedByBarriers(0, 0, 1, barriers), "standing at the center")
	assert.True(t, pointBlockedByBarriers(5.5, 0, 1, barriers), "standing just inside the margin")
	assert.False(t, pointBlockedByBarriers(7, 0, 1, barriers), "standing clear of the margin")
}
