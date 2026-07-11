package instance_test

import (
	"math"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/delve-mmo/game-server/internal/instance"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
	"github.com/delve-mmo/game-server/internal/instancestate"
)

// ---------------------------------------------------------------------------
// pushOutOfSegment
// ---------------------------------------------------------------------------

func TestPushOutOfSegment_NoCollision(t *testing.T) {
	// Point 10 feet from a horizontal segment, radius 2.4 — no push.
	rx, ry := instance.PushOutOfSegmentForTest(5, 10, 2.4, 0, 0, 10, 0)
	assert.InDelta(t, 5.0, rx, 1e-9)
	assert.InDelta(t, 10.0, ry, 1e-9)
}

func TestPushOutOfSegment_Collision_PushedPerpendicular(t *testing.T) {
	// Unit at (5, 1) above a horizontal segment from (0,0)→(10,0). r=2.4.
	// Closest point on segment is (5, 0). Distance = 1. Overlap = 1.4.
	rx, ry := instance.PushOutOfSegmentForTest(5, 1, 2.4, 0, 0, 10, 0)
	assert.InDelta(t, 5.0, rx, 1e-9)
	assert.InDelta(t, 2.4, ry, 1e-9)
}

func TestPushOutOfSegment_BelowSegment(t *testing.T) {
	// Unit at (5, -1) below the segment — pushed to y=-2.4.
	rx, ry := instance.PushOutOfSegmentForTest(5, -1, 2.4, 0, 0, 10, 0)
	assert.InDelta(t, 5.0, rx, 1e-9)
	assert.InDelta(t, -2.4, ry, 1e-9)
}

func TestPushOutOfSegment_PastEndpoint_ClampsToCorner(t *testing.T) {
	// Unit at (12, 0) past the right end of (0,0)→(10,0). r=2.4.
	// Closest point clamps to (10, 0). Distance = 2. Overlap = 0.4.
	rx, ry := instance.PushOutOfSegmentForTest(12, 0, 2.4, 0, 0, 10, 0)
	// Push direction is (2, 0) / 2 = (1, 0). New pos = (12 + 0.4, 0).
	assert.InDelta(t, 12.4, rx, 1e-9)
	assert.InDelta(t, 0.0, ry, 1e-9)
}

func TestPushOutOfSegment_ExactlyAtRadius_NoPush(t *testing.T) {
	// Unit exactly at distance r — no push (boundary condition).
	rx, ry := instance.PushOutOfSegmentForTest(5, 2.4, 2.4, 0, 0, 10, 0)
	assert.InDelta(t, 5.0, rx, 1e-9)
	assert.InDelta(t, 2.4, ry, 1e-9)
}

func TestPushOutOfSegment_ZeroLengthSegment_NoPush(t *testing.T) {
	// Degenerate segment (same start and end) — should not crash, returns unchanged.
	rx, ry := instance.PushOutOfSegmentForTest(5, 1, 2.4, 3, 3, 3, 3)
	assert.Equal(t, 5.0, rx)
	assert.Equal(t, 1.0, ry)
}

// ---------------------------------------------------------------------------
// pushOutOfCircle
// ---------------------------------------------------------------------------

func TestPushOutOfCircle_NoCollision(t *testing.T) {
	// Unit 20 feet from center, unitR=2.2, barrierR=5.0 → minDist=7.2. No push.
	rx, ry := instance.PushOutOfCircleForTest(20, 0, 2.2, 0, 0, 5.0)
	assert.InDelta(t, 20.0, rx, 1e-9)
	assert.InDelta(t, 0.0, ry, 1e-9)
}

func TestPushOutOfCircle_Collision(t *testing.T) {
	// Unit at (5, 0), unitR=2.2, barrierR=5.0 → minDist=7.2. Overlap=2.2.
	rx, ry := instance.PushOutOfCircleForTest(5, 0, 2.2, 0, 0, 5.0)
	assert.InDelta(t, 7.2, rx, 1e-9)
	assert.InDelta(t, 0.0, ry, 1e-9)
}

func TestPushOutOfCircle_ExactlyAtMinDist_NoPush(t *testing.T) {
	// Unit exactly at minDist — no push.
	rx, ry := instance.PushOutOfCircleForTest(7.2, 0, 2.2, 0, 0, 5.0)
	assert.InDelta(t, 7.2, rx, 1e-9)
	assert.InDelta(t, 0.0, ry, 1e-9)
}

// ---------------------------------------------------------------------------
// resolveCollisions integration
// ---------------------------------------------------------------------------

func collisionZone(barriers ...instanceconfig.Barrier) instanceconfig.Zone {
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{
				Identifier: "map1",
				Barriers:   barriers,
			},
		},
	}
}

func unitOnMap(x, y float64, radius float64) (*instancestate.UnitState, *instancestate.InstanceState) {
	u := &instancestate.UnitState{
		MapIdentifier: "map1",
		Position:      instanceconfig.Position{X: x, Y: y},
		Radius:        radius,
	}
	s := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u},
	}
	return u, s
}

func TestResolveCollisions_SkipsZeroRadius(t *testing.T) {
	// NPC (Radius==0) should pass through a wall without being pushed.
	wall := instanceconfig.Barrier{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: 0, Y: 0}, {X: 10, Y: 0}},
	}
	u, s := unitOnMap(5, 0.5, 0) // inside wall range but radius=0
	instance.ResolveCollisionsForTest(s, collisionZone(wall))
	assert.InDelta(t, 5.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.5, u.Position.Y, 1e-9)
}

func TestResolveCollisions_WallPushesUnit(t *testing.T) {
	// Horizontal wall at y=0. Unit at (5, 1), radius=2.2.
	// Effective collision radius = 2.2 + 0.2 = 2.4. Unit pushed to y=2.4.
	wall := instanceconfig.Barrier{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: 0, Y: 0}, {X: 10, Y: 0}},
	}
	u, s := unitOnMap(5, 1, 2.2)
	instance.ResolveCollisionsForTest(s, collisionZone(wall))
	assert.InDelta(t, 5.0, u.Position.X, 1e-9)
	assert.InDelta(t, 2.4, u.Position.Y, 1e-9)
}

func TestResolveCollisions_CirclePushesUnit(t *testing.T) {
	// Circle barrier at (0,0) with radius 5. Unit at (3,0), unitRadius=2.2.
	// minDist=7.2. Unit pushed to (7.2, 0).
	center := &instanceconfig.Location{X: 0, Y: 0}
	circle := instanceconfig.Barrier{
		Type:     "circle",
		Location: center,
		Radius:   5.0,
	}
	u, s := unitOnMap(3, 0, 2.2)
	instance.ResolveCollisionsForTest(s, collisionZone(circle))
	assert.InDelta(t, 7.2, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestResolveCollisions_ClearUnit_NoChange(t *testing.T) {
	// Unit well clear of wall — position unchanged.
	wall := instanceconfig.Barrier{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: 0, Y: 0}, {X: 10, Y: 0}},
	}
	u, s := unitOnMap(5, 10, 2.2)
	instance.ResolveCollisionsForTest(s, collisionZone(wall))
	assert.InDelta(t, 5.0, u.Position.X, 1e-9)
	assert.InDelta(t, 10.0, u.Position.Y, 1e-9)
}

func TestResolveCollisions_WrongMap_NoChange(t *testing.T) {
	// Unit is on "map2" but wall is on "map1" — no collision.
	wall := instanceconfig.Barrier{
		Type:      "wall",
		Locations: []instanceconfig.Location{{X: 0, Y: 0}, {X: 10, Y: 0}},
	}
	u := &instancestate.UnitState{
		MapIdentifier: "map2",
		Position:      instanceconfig.Position{X: 5, Y: 0.5},
		Radius:        2.2,
	}
	s := &instancestate.InstanceState{
		Units: map[uuid.UUID]*instancestate.UnitState{uuid.New(): u},
	}
	instance.ResolveCollisionsForTest(s, collisionZone(wall))
	assert.InDelta(t, 5.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.5, u.Position.Y, 1e-9)
}

func TestResolveCollisions_MultiSegmentWall(t *testing.T) {
	// L-shaped wall: (0,0)→(10,0)→(10,10). Unit inside the corner at (9, 1).
	// Should be pushed out of both segments.
	wall := instanceconfig.Barrier{
		Type: "wall",
		Locations: []instanceconfig.Location{
			{X: 0, Y: 0},
			{X: 10, Y: 0},
			{X: 10, Y: 10},
		},
	}
	u, s := unitOnMap(9, 1, 2.2)
	instance.ResolveCollisionsForTest(s, collisionZone(wall))
	// After resolution the unit must be at least r=2.4 from both segments.
	// Segment 1: (0,0)→(10,0) — closest at (9,0), must have y >= 2.4.
	// Segment 2: (10,0)→(10,10) — closest at (10,1), must have x <= 10-2.4=7.6.
	dist1 := u.Position.Y // distance from horizontal segment
	segX := 10.0
	dist2 := math.Abs(segX - u.Position.X) // distance from vertical segment
	assert.GreaterOrEqual(t, dist1, 2.4-1e-9, "must be clear of horizontal segment")
	assert.GreaterOrEqual(t, dist2, 2.4-1e-9, "must be clear of vertical segment")
}

// ---------------------------------------------------------------------------
// map edge clamping
// ---------------------------------------------------------------------------

func boundedZone(width, height float64) instanceconfig.Zone {
	return instanceconfig.Zone{
		Maps: []instanceconfig.Map{
			{
				Identifier:     "map1",
				FeetDimensions: instanceconfig.Dimensions{Width: width, Height: height},
			},
		},
	}
}

func TestResolveCollisions_MapEdge_ClampsX(t *testing.T) {
	u, s := unitOnMap(-1, 50, 2.2)
	instance.ResolveCollisionsForTest(s, boundedZone(100, 100))
	assert.InDelta(t, 0.0, u.Position.X, 1e-9)
	assert.InDelta(t, 50.0, u.Position.Y, 1e-9)
}

func TestResolveCollisions_MapEdge_ClampsXMax(t *testing.T) {
	u, s := unitOnMap(101, 50, 2.2)
	instance.ResolveCollisionsForTest(s, boundedZone(100, 100))
	assert.InDelta(t, 100.0, u.Position.X, 1e-9)
	assert.InDelta(t, 50.0, u.Position.Y, 1e-9)
}

func TestResolveCollisions_MapEdge_ClampsY(t *testing.T) {
	u, s := unitOnMap(50, -1, 2.2)
	instance.ResolveCollisionsForTest(s, boundedZone(100, 100))
	assert.InDelta(t, 50.0, u.Position.X, 1e-9)
	assert.InDelta(t, 0.0, u.Position.Y, 1e-9)
}

func TestResolveCollisions_MapEdge_NoBoundsWhenDimsZero(t *testing.T) {
	// collisionZone sets no FeetDimensions — clamping must not fire.
	u, s := unitOnMap(-5, 50, 2.2)
	instance.ResolveCollisionsForTest(s, collisionZone())
	assert.InDelta(t, -5.0, u.Position.X, 1e-9)
}
