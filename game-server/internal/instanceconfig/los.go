package instanceconfig

// LineOfSightClear reports whether the straight line between (x1,y1) and
// (x2,y2) on the given map is unobstructed by any of that map's barriers.
// Returns true (clear) if the map isn't found.
func LineOfSightClear(zone Zone, mapIdentifier string, x1, y1, x2, y2 float64) bool {
	for i := range zone.Maps {
		m := &zone.Maps[i]
		if m.Identifier != mapIdentifier {
			continue
		}
		for _, b := range m.Barriers {
			if barrierBlocksLine(b, x1, y1, x2, y2) {
				return false
			}
		}
		return true
	}
	return true
}

func barrierBlocksLine(b Barrier, x1, y1, x2, y2 float64) bool {
	switch b.Type {
	case "wall":
		for i := 0; i+1 < len(b.Locations); i++ {
			a, c := b.Locations[i], b.Locations[i+1]
			if segmentsIntersect(x1, y1, x2, y2, a.X, a.Y, c.X, c.Y) {
				return true
			}
		}
	case "circle":
		if b.Location != nil && segmentIntersectsCircle(x1, y1, x2, y2, b.Location.X, b.Location.Y, b.Radius) {
			return true
		}
	}
	return false
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
	return px >= min(ax, bx) && px <= max(ax, bx) && py >= min(ay, by) && py <= max(ay, by)
}

// segmentIntersectsCircle reports whether the segment (x1,y1)-(x2,y2) passes
// within radius of (cx,cy).
func segmentIntersectsCircle(x1, y1, x2, y2, cx, cy, radius float64) bool {
	dx, dy := x2-x1, y2-y1
	lenSq := dx*dx + dy*dy
	if lenSq == 0 {
		return dist2(x1, y1, cx, cy) <= radius*radius
	}
	t := ((cx-x1)*dx + (cy-y1)*dy) / lenSq
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	nearX, nearY := x1+t*dx, y1+t*dy
	return dist2(nearX, nearY, cx, cy) <= radius*radius
}

func dist2(x1, y1, x2, y2 float64) float64 {
	dx, dy := x2-x1, y2-y1
	return dx*dx + dy*dy
}
