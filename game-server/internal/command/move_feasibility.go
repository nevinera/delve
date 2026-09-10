package command

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// fallbackPlayerSpeed mirrors instance.BasePlayerSpeed (feet/sec) - duplicated
// here rather than imported, since internal/instance already imports this
// package (importing it back would cycle). Used only if a unit's own Speed
// is unset when a move is evaluated.
const fallbackPlayerSpeed = 20.0

// feasibilityTolerance multiplies the raw speed*elapsed budget to absorb
// legitimate timing jitter (send/tick cadence, rounding) without materially
// loosening the check a cheat would need to beat.
const feasibilityTolerance = 1.3

// maxFeasibilityElapsedSeconds caps how much elapsed time a single move is
// credited for, so a long gap since the last accepted move (idle, or an
// attacker withholding updates on purpose) can't be cashed in for one large
// "feasible" jump.
const maxFeasibilityElapsedSeconds = 1.0

// barriersForMap returns the barriers for the named map, or nil if the zone
// has no map with that identifier.
func barriersForMap(zone instanceconfig.Zone, mapIdentifier string) []instanceconfig.Barrier {
	for _, m := range zone.Maps {
		if m.Identifier == mapIdentifier {
			return m.Barriers
		}
	}
	return nil
}

// clampFeasibleMove returns the furthest point along the segment from
// (oldX,oldY) to (newX,newY) that's both within the unit's movement budget
// for elapsedSeconds and doesn't cross a wall or circle barrier on its
// current map. Returns (newX, newY) unchanged if the whole move is feasible.
func clampFeasibleMove(oldX, oldY, newX, newY, speed, elapsedSeconds float64, barriers []instanceconfig.Barrier) (float64, float64) {
	dx, dy := newX-oldX, newY-oldY
	dist := math.Sqrt(dx*dx + dy*dy)
	if dist == 0 {
		return newX, newY
	}

	if speed <= 0 {
		speed = fallbackPlayerSpeed
	}
	elapsedSeconds = math.Max(0, math.Min(elapsedSeconds, maxFeasibilityElapsedSeconds))
	maxDist := speed * elapsedSeconds * feasibilityTolerance

	t := 1.0
	if dist > maxDist {
		t = maxDist / dist
	}

	for _, b := range barriers {
		if bt, ok := barrierSegmentT(oldX, oldY, dx, dy, b); ok && bt < t {
			t = bt
		}
	}

	if t >= 1 {
		return newX, newY
	}
	if t < 0 {
		t = 0
	}
	return oldX + dx*t, oldY + dy*t
}

// barrierSegmentT returns the smallest t in [0,1] along segment
// (ox,oy)+t*(dx,dy) at which it first crosses the given barrier, or
// (0, false) if it never does.
func barrierSegmentT(ox, oy, dx, dy float64, b instanceconfig.Barrier) (float64, bool) {
	switch b.Type {
	case "wall":
		best, found := 0.0, false
		locs := b.Locations
		for i := 0; i < len(locs)-1; i++ {
			if t, ok := segmentIntersectionT(ox, oy, dx, dy, locs[i].X, locs[i].Y, locs[i+1].X, locs[i+1].Y); ok {
				if !found || t < best {
					best, found = t, true
				}
			}
		}
		return best, found
	case "circle":
		if b.Location == nil {
			return 0, false
		}
		return segmentCircleT(ox, oy, dx, dy, b.Location.X, b.Location.Y, b.Radius)
	default:
		return 0, false
	}
}

// segmentIntersectionT returns the t in [0,1] along segment (ax,ay)+t*(dx,dy)
// where it crosses segment (cx,cy)-(ex,ey), or (0, false) if they don't cross
// within both segments' bounds (parallel/collinear segments are treated as
// not crossing - a rare, low-stakes edge case for a straight-line move).
func segmentIntersectionT(ax, ay, dx, dy, cx, cy, ex, ey float64) (float64, bool) {
	dx2, dy2 := ex-cx, ey-cy
	denom := dx*dy2 - dy*dx2
	if denom == 0 {
		return 0, false
	}
	t := ((cx-ax)*dy2 - (cy-ay)*dx2) / denom
	u := ((cx-ax)*dy - (cy-ay)*dx) / denom
	if t < 0 || t > 1 || u < 0 || u > 1 {
		return 0, false
	}
	return t, true
}

// segmentCircleT returns the smallest t in [0,1] along segment
// (ox,oy)+t*(dx,dy) at which it enters the circle of the given radius
// centered at (cx,cy), or (0, false) if it never enters - including if it
// starts already inside, which is left to resolveCollisions to push out
// rather than treated as an infeasible move here.
func segmentCircleT(ox, oy, dx, dy, cx, cy, radius float64) (float64, bool) {
	fx, fy := ox-cx, oy-cy
	a := dx*dx + dy*dy
	if a == 0 {
		return 0, false
	}
	b := 2 * (fx*dx + fy*dy)
	c := fx*fx + fy*fy - radius*radius
	disc := b*b - 4*a*c
	if disc < 0 {
		return 0, false
	}
	t := (-b - math.Sqrt(disc)) / (2 * a)
	if t < 0 || t > 1 {
		return 0, false
	}
	return t, true
}
