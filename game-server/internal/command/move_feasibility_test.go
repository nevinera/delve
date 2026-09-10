package command

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestSegmentIntersectionT_Crosses(t *testing.T) {
	t_, ok := segmentIntersectionT(0, 0, 10, 0, 5, -5, 5, 5)
	assert.True(t, ok)
	assert.InDelta(t, 0.5, t_, 1e-9)
}

func TestSegmentIntersectionT_MissesBeyondSegmentEnd(t *testing.T) {
	// The wall is past where the move segment ends.
	_, ok := segmentIntersectionT(0, 0, 4, 0, 5, -5, 5, 5)
	assert.False(t, ok)
}

func TestSegmentIntersectionT_MissesBesideMoveLine(t *testing.T) {
	// The wall segment doesn't reach the move's line at all.
	_, ok := segmentIntersectionT(0, 0, 10, 0, 5, 1, 5, 5)
	assert.False(t, ok)
}

func TestSegmentIntersectionT_ParallelDoesNotBlock(t *testing.T) {
	_, ok := segmentIntersectionT(0, 0, 10, 0, 0, 5, 10, 5)
	assert.False(t, ok)
}

func TestSegmentCircleT_EntersFromOutside(t *testing.T) {
	t_, ok := segmentCircleT(0, 0, 20, 0, 10, 0, 3)
	assert.True(t, ok)
	assert.InDelta(t, 0.35, t_, 1e-9) // enters at x=7 -> t=7/20
}

func TestSegmentCircleT_MissesWhenFarAway(t *testing.T) {
	_, ok := segmentCircleT(0, 0, 20, 0, 10, 100, 3)
	assert.False(t, ok)
}

func TestSegmentCircleT_StartingInsideDoesNotBlock(t *testing.T) {
	// Already inside the circle at the start - left to resolveCollisions,
	// not treated as an infeasible move here.
	_, ok := segmentCircleT(10, 0, 5, 0, 10, 0, 3)
	assert.False(t, ok)
}

func TestClampFeasibleMove_UnclampedWhenFullyFeasible(t *testing.T) {
	x, y := clampFeasibleMove(0, 0, 5, 0, 20, 1.0, nil)
	assert.InDelta(t, 5.0, x, 1e-9)
	assert.InDelta(t, 0.0, y, 1e-9)
}

func TestClampFeasibleMove_ZeroDistanceMoveIsAlwaysFeasible(t *testing.T) {
	x, y := clampFeasibleMove(3, 4, 3, 4, 0, 0, nil)
	assert.Equal(t, 3.0, x)
	assert.Equal(t, 4.0, y)
}

func TestClampFeasibleMove_ClampsToSpeedBudget(t *testing.T) {
	// speed 10 * elapsed 1s * 1.3 tolerance = 13ft budget, requested 100ft.
	x, y := clampFeasibleMove(0, 0, 100, 0, 10, 1.0, nil)
	assert.InDelta(t, 13.0, x, 1e-9)
	assert.InDelta(t, 0.0, y, 1e-9)
}

func TestClampFeasibleMove_FallsBackToDefaultSpeedWhenNonPositive(t *testing.T) {
	x, _ := clampFeasibleMove(0, 0, 100, 0, 0, 1.0, nil)
	assert.InDelta(t, fallbackPlayerSpeed*feasibilityTolerance, x, 1e-9)
}

func TestClampFeasibleMove_CapsElapsedTime(t *testing.T) {
	xUncapped, _ := clampFeasibleMove(0, 0, 1000, 0, 20, 5.0, nil)
	xCapped, _ := clampFeasibleMove(0, 0, 1000, 0, 20, maxFeasibilityElapsedSeconds, nil)
	assert.Equal(t, xCapped, xUncapped, "elapsed beyond the cap should not grant extra budget")
}

func TestClampFeasibleMove_NegativeElapsedIsTreatedAsZero(t *testing.T) {
	x, y := clampFeasibleMove(3, 4, 100, 4, 20, -1.0, nil)
	assert.InDelta(t, 3.0, x, 1e-9)
	assert.InDelta(t, 4.0, y, 1e-9)
}

func TestClampFeasibleMove_StopsAtWallBarrier(t *testing.T) {
	barriers := []instanceconfig.Barrier{{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: 5, Y: -10}, {X: 5, Y: 10}},
	}}
	x, y := clampFeasibleMove(0, 0, 9, 0, 100, 1.0, barriers)
	assert.InDelta(t, 5.0, x, 1e-9)
	assert.InDelta(t, 0.0, y, 1e-9)
}

func TestClampFeasibleMove_UsesTheNearestOfMultipleBarriers(t *testing.T) {
	barriers := []instanceconfig.Barrier{
		{Type: "wall", Locations: []instanceconfig.Location{{X: 8, Y: -10}, {X: 8, Y: 10}}},
		{Type: "wall", Locations: []instanceconfig.Location{{X: 3, Y: -10}, {X: 3, Y: 10}}},
	}
	x, _ := clampFeasibleMove(0, 0, 9, 0, 100, 1.0, barriers)
	assert.InDelta(t, 3.0, x, 1e-9)
}

func TestClampFeasibleMove_IgnoresBarriersBehindTheDestination(t *testing.T) {
	barriers := []instanceconfig.Barrier{
		{Type: "wall", Locations: []instanceconfig.Location{{X: 50, Y: -10}, {X: 50, Y: 10}}},
	}
	x, _ := clampFeasibleMove(0, 0, 9, 0, 100, 1.0, barriers)
	assert.InDelta(t, 9.0, x, 1e-9)
}

func TestBarriersForMap_ReturnsNilForUnknownMap(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{{Identifier: "m1"}}}
	assert.Nil(t, barriersForMap(zone, "does-not-exist"))
}

func TestBarriersForMap_ReturnsMatchingMapsBarriers(t *testing.T) {
	zone := instanceconfig.Zone{Maps: []instanceconfig.Map{
		{Identifier: "m1", Barriers: []instanceconfig.Barrier{{Type: "circle"}}},
		{Identifier: "m2"},
	}}
	assert.Len(t, barriersForMap(zone, "m1"), 1)
}
