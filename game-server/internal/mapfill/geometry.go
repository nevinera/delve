package mapfill

import "math"

func ringArea(points []Point) float64 {
	sum := 0.0
	for i, p := range points {
		q := points[(i+1)%len(points)]
		sum += p.X*q.Y - q.X*p.Y
	}
	return sum / 2
}

func bounds(points []Point) (minX, minY, maxX, maxY float64) {
	minX, minY, maxX, maxY = math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
	for _, p := range points {
		minX, minY = math.Min(minX, p.X), math.Min(minY, p.Y)
		maxX, maxY = math.Max(maxX, p.X), math.Max(maxY, p.Y)
	}
	return
}

func pointInRing(p Point, ring []Point) bool {
	inside := false
	for i, j := 0, len(ring)-1; i < len(ring); j, i = i, i+1 {
		a, b := ring[i], ring[j]
		if (a.Y > p.Y) != (b.Y > p.Y) && p.X < (b.X-a.X)*(p.Y-a.Y)/(b.Y-a.Y)+a.X {
			inside = !inside
		}
	}
	return inside
}

func closestOnSegment(p, a, b Point) Point {
	d := sub(b, a)
	lenSq := dot(d, d)
	if lenSq == 0 {
		return a
	}
	return lerp(a, b, clamp01(dot(sub(p, a), d)/lenSq))
}

func sub(a, b Point) Point             { return Point{a.X - b.X, a.Y - b.Y} }
func dot(a, b Point) float64           { return a.X*b.X + a.Y*b.Y }
func cross(a, b Point) float64         { return a.X*b.Y - a.Y*b.X }
func dist(a, b Point) float64          { return math.Hypot(a.X-b.X, a.Y-b.Y) }
func lerp(a, b Point, t float64) Point { return Point{a.X + (b.X-a.X)*t, a.Y + (b.Y-a.Y)*t} }

func clamp01(t float64) float64 { return math.Min(1, math.Max(0, t)) }
