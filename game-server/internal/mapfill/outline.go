package mapfill

import (
	"math"
	"slices"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

type segment struct {
	a, b Point
	kind Kind
}

// outlineSegments gathers the walls, line connections and map edge, clipped
// to the map, plus the connectors that close their near misses.
func outlineSegments(m instanceconfig.Map, w, h float64) []segment {
	var segs []segment
	var ends []Point
	add := func(a, b Point, kind Kind) {
		if ca, cb, ok := clip(a, b, w, h); ok && dist(ca, cb) > eps {
			segs = append(segs, segment{ca, cb, kind})
		}
	}

	type circle struct {
		center Point
		radius float64
	}
	var circles []circle
	for _, b := range m.Barriers {
		switch b.Type {
		case "wall":
			pts := b.Locations
			for i := 0; i+1 < len(pts); i++ {
				add(pt(pts[i]), pt(pts[i+1]), Wall)
			}
			if len(pts) >= 2 && dist(pt(pts[0]), pt(pts[len(pts)-1])) > eps {
				ends = append(ends, pt(pts[0]), pt(pts[len(pts)-1]))
			}
		case "circle":
			if b.Location != nil {
				circles = append(circles, circle{pt(*b.Location), b.Radius})
			}
		}
	}
	for _, c := range m.Connections {
		if c.Type != "line" || c.Start == nil || c.End == nil {
			continue
		}
		a, b := pt(*c.Start), pt(*c.End)
		add(a, b, Connection)
		ends = append(ends, a, b)
	}
	corners := []Point{{0, 0}, {w, 0}, {w, h}, {0, h}}
	for i := range corners {
		add(corners[i], corners[(i+1)%4], Border)
	}

	outlines := slices.Clone(segs)
	for i, p := range ends {
		for _, q := range ends[i+1:] {
			if d := dist(p, q); d > eps && d <= Snap {
				add(p, q, Connector)
			}
		}
		for _, s := range outlines {
			q := closestOnSegment(p, s.a, s.b)
			if d := dist(p, q); d > eps && d <= Snap {
				add(p, q, Connector)
			}
		}
		for _, c := range circles {
			if dist(p, c.center) <= Snap+c.radius {
				add(p, c.center, Connector)
			}
		}
	}
	return segs
}

func pt(l instanceconfig.Location) Point { return Point{l.X, l.Y} }

// clip is Liang-Barsky: the part of a→b inside the map, if any.
func clip(a, b Point, w, h float64) (Point, Point, bool) {
	dx, dy := b.X-a.X, b.Y-a.Y
	t0, t1 := 0.0, 1.0
	for _, pq := range [4][2]float64{{-dx, a.X}, {dx, w - a.X}, {-dy, a.Y}, {dy, h - a.Y}} {
		p, q := pq[0], pq[1]
		if math.Abs(p) < eps {
			if q < -eps {
				return Point{}, Point{}, false
			}
			continue
		}
		if t := q / p; p < 0 {
			t0 = math.Max(t0, t)
		} else {
			t1 = math.Min(t1, t)
		}
	}
	if t0 > t1 {
		return Point{}, Point{}, false
	}
	at := func(t float64) Point {
		return Point{math.Min(w, math.Max(0, a.X+t*dx)), math.Min(h, math.Max(0, a.Y+t*dy))}
	}
	return at(t0), at(t1), true
}

// splitAtCrossings breaks every segment where another crosses or touches it.
func splitAtCrossings(segs []segment) []segment {
	cuts := make([][]float64, len(segs))
	for i := range segs {
		cuts[i] = []float64{0, 1}
	}
	for i := range segs {
		for j := i + 1; j < len(segs); j++ {
			for _, t := range crossings(segs[i], segs[j]) {
				cuts[i] = append(cuts[i], t[0])
				cuts[j] = append(cuts[j], t[1])
			}
		}
	}
	var pieces []segment
	for i, s := range segs {
		ts := cuts[i]
		slices.Sort(ts)
		ts = slices.Compact(ts)
		for k := 0; k+1 < len(ts); k++ {
			a, b := lerp(s.a, s.b, ts[k]), lerp(s.a, s.b, ts[k+1])
			if dist(a, b) > merge {
				pieces = append(pieces, segment{a, b, s.kind})
			}
		}
	}
	return pieces
}

// crossings returns parameter pairs [t on s, t on r] where the two meet: one
// crossing, or for overlapping collinear segments, each one's endpoints on
// the other.
func crossings(s, r segment) [][2]float64 {
	d1, d2 := sub(s.b, s.a), sub(r.b, r.a)
	denom := cross(d1, d2)
	w := sub(r.a, s.a)
	len1, len2 := math.Hypot(d1.X, d1.Y), math.Hypot(d2.X, d2.Y)
	if math.Abs(denom) <= 1e-9*len1*len2 {
		if math.Abs(cross(w, d1)) > 1e-6*len1 {
			return nil
		}
		onS := func(p Point) float64 { return dot(sub(p, s.a), d1) / (len1 * len1) }
		onR := func(p Point) float64 { return dot(sub(p, r.a), d2) / (len2 * len2) }
		var out [][2]float64
		for _, p := range []Point{r.a, r.b} {
			if t := onS(p); t > -eps && t < 1+eps {
				out = append(out, [2]float64{clamp01(t), clamp01(onR(p))})
			}
		}
		for _, p := range []Point{s.a, s.b} {
			if t := onR(p); t > -eps && t < 1+eps {
				out = append(out, [2]float64{clamp01(onS(p)), clamp01(t)})
			}
		}
		return out
	}
	t, u := cross(w, d2)/denom, cross(w, d1)/denom
	tolS, tolR := 1e-6/len1, 1e-6/len2
	if t < -tolS || t > 1+tolS || u < -tolR || u > 1+tolR {
		return nil
	}
	return [][2]float64{{clamp01(t), clamp01(u)}}
}
