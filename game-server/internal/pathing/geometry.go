package pathing

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// clearanceEpsilon absorbs floating-point noise when comparing a distance
// against a clearance radius, so a point/edge generated to sit exactly on a
// barrier's clearance boundary isn't spuriously rejected as blocked.
const clearanceEpsilon = 1e-6

// segmentBlockedByBarriers reports whether a unit of the given radius can
// travel in a straight line from (x1,y1) to (x2,y2) without its body coming
// within radius of any barrier.
func segmentBlockedByBarriers(x1, y1, x2, y2, radius float64, barriers []instanceconfig.Barrier) bool {
	for _, b := range barriers {
		if segmentBlockedByBarrier(x1, y1, x2, y2, radius, b) {
			return true
		}
	}
	return false
}

func segmentBlockedByBarrier(x1, y1, x2, y2, radius float64, b instanceconfig.Barrier) bool {
	switch b.Type {
	case "wall":
		for i := 0; i+1 < len(b.Locations); i++ {
			a, c := b.Locations[i], b.Locations[i+1]
			if segToSegDist(x1, y1, x2, y2, a.X, a.Y, c.X, c.Y) < radius-clearanceEpsilon {
				return true
			}
		}
	case "circle":
		if b.Location != nil {
			threshold := b.Radius + radius
			if segToPointDist(x1, y1, x2, y2, b.Location.X, b.Location.Y) < threshold-clearanceEpsilon {
				return true
			}
		}
	}
	return false
}

// pointBlockedByBarriers reports whether a unit of the given radius standing
// centered at (x,y) would overlap any barrier.
func pointBlockedByBarriers(x, y, radius float64, barriers []instanceconfig.Barrier) bool {
	return segmentBlockedByBarriers(x, y, x, y, radius, barriers)
}

// segToPointDist returns the minimum distance between segment (x1,y1)-(x2,y2)
// and point (px,py).
func segToPointDist(x1, y1, x2, y2, px, py float64) float64 {
	dx, dy := x2-x1, y2-y1
	lenSq := dx*dx + dy*dy
	if lenSq == 0 {
		return math.Hypot(px-x1, py-y1)
	}
	t := ((px-x1)*dx + (py-y1)*dy) / lenSq
	t = clamp01(t)
	nearX, nearY := x1+t*dx, y1+t*dy
	return math.Hypot(px-nearX, py-nearY)
}

// segToSegDist returns the minimum distance between segments (x1,y1)-(x2,y2)
// and (x3,y3)-(x4,y4), including 0 if they cross.
func segToSegDist(x1, y1, x2, y2, x3, y3, x4, y4 float64) float64 {
	if segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
		return 0
	}
	d1 := segToPointDist(x1, y1, x2, y2, x3, y3)
	d2 := segToPointDist(x1, y1, x2, y2, x4, y4)
	d3 := segToPointDist(x3, y3, x4, y4, x1, y1)
	d4 := segToPointDist(x3, y3, x4, y4, x2, y2)
	return math.Min(math.Min(d1, d2), math.Min(d3, d4))
}

// segmentsIntersect reports whether segments (p1,p2) and (p3,p4) cross,
// using the standard orientation test. Endpoint-touching counts as crossing.
func segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4 float64) bool {
	d1 := cross(x4-x3, y4-y3, x1-x3, y1-y3)
	d2 := cross(x4-x3, y4-y3, x2-x3, y2-y3)
	d3 := cross(x2-x1, y2-y1, x3-x1, y3-y1)
	d4 := cross(x2-x1, y2-y1, x4-x1, y4-y1)

	if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
		((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)) {
		return true
	}
	if d1 == 0 && onSegment(x3, y3, x4, y4, x1, y1) {
		return true
	}
	if d2 == 0 && onSegment(x3, y3, x4, y4, x2, y2) {
		return true
	}
	if d3 == 0 && onSegment(x1, y1, x2, y2, x3, y3) {
		return true
	}
	if d4 == 0 && onSegment(x1, y1, x2, y2, x4, y4) {
		return true
	}
	return false
}

func cross(ax, ay, bx, by float64) float64 { return ax*by - ay*bx }

// onSegment assumes (px,py) is collinear with (ax,ay)-(bx,by) and checks it
// falls within the segment's bounding box.
func onSegment(ax, ay, bx, by, px, py float64) bool {
	return px >= math.Min(ax, bx) && px <= math.Max(ax, bx) &&
		py >= math.Min(ay, by) && py <= math.Max(ay, by)
}

func clamp01(t float64) float64 {
	if t < 0 {
		return 0
	}
	if t > 1 {
		return 1
	}
	return t
}
