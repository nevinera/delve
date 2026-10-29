package worlds

import (
	"encoding/json"
	"math"
	"sort"
)

// Slabs, as client/src/world/slabs.js lays them out (docs/formats/slabs.md): where you can stand on
// them, and whether a move runs into one.

// slabReachFt is how far a slab's corners can be from its home corner.
const slabReachFt = 64.0

// Slab is a slab as a plate's `slab` line holds it.
type Slab struct {
	At        [3]float64     `json:"at"`
	Turn      [3]float64     `json:"turn"`
	Outline   [][2]float64   `json:"outline"`
	Holes     [][][2]float64 `json:"holes"`
	Thickness float64        `json:"thickness"`

	low, high [3]float64 // the corners' least and greatest x, y and z
}

// readSlab reads a slab line's JSON.
func readSlab(text string) (*Slab, error) {
	s := &Slab{}
	if err := json.Unmarshal([]byte(text), s); err != nil {
		return nil, err
	}
	for k := 0; k < 3; k++ {
		s.low[k], s.high[k] = math.Inf(1), math.Inf(-1)
	}
	down := turnPoint([3]float64{0, -s.Thickness, 0}, s.Turn)
	for _, p := range s.Outline {
		top := add3(s.At, turnPoint([3]float64{p[0], 0, p[1]}, s.Turn))
		for _, c := range [][3]float64{top, add3(top, down)} {
			for k := 0; k < 3; k++ {
				s.low[k], s.high[k] = math.Min(s.low[k], c[k]), math.Max(s.high[k], c[k])
			}
		}
	}
	return s, nil
}

// near is whether the slab's corners come within `by` feet of (x, z) across the ground.
func (s *Slab) near(x, z, by float64) bool {
	return x >= s.low[0]-by && x <= s.high[0]+by && z >= s.low[2]-by && z <= s.high[2]+by
}

// Footholds are the tops of the slab you could stand on along the upright line through (x, z):
// where each stretch of the line inside it comes out through a face tilting no more than
// `steepest` (rise over run). Heights in feet, lowest first. Holes go right through.
func (s *Slab) Footholds(x, z, steepest float64) []float64 {
	least := 1 / math.Hypot(1, steepest) // the least upward share of a face's normal
	p := s.local([3]float64{x, 0, z})
	d := sub3(s.local([3]float64{x, 1, z}), p)
	var tops []float64
	for _, st := range s.stretches(p, d, math.Inf(-1), math.Inf(1)) {
		var up float64
		if st.byFace {
			up = math.Abs(d[1])
		} else {
			point := [2]float64{p[0] + d[0]*st.to, p[2] + d[2]*st.to}
			a, b := s.nearestEdge(point)
			length := math.Hypot(b[0]-a[0], b[1]-a[1])
			normal := [2]float64{(b[1] - a[1]) / length, -(b[0] - a[0]) / length}
			if s.inside([2]float64{point[0] + normal[0]*0.01, point[1] + normal[1]*0.01}) {
				normal = [2]float64{-normal[0], -normal[1]}
			}
			up = turnPoint([3]float64{normal[0], 0, normal[1]}, s.Turn)[1]
		}
		if up >= least-1e-9 && st.to < 1e5 {
			tops = append(tops, st.to)
		}
	}
	return tops
}

// Enters is whether the straight move from a to b goes into the slab: past its start, into a part
// of it the start isn't already in.
func (s *Slab) Enters(a, b [3]float64) bool {
	p := s.local(a)
	d := sub3(s.local(b), p)
	for _, st := range s.stretches(p, d, 0, 1) {
		if st.from > 1e-6 {
			return true
		}
	}
	return false
}

// stretch is a stretch of a line inside a slab, from and to along it; byFace when it comes out
// through the top or bottom face rather than a side.
type stretch struct {
	from, to float64
	byFace   bool
}

// stretches are where the line p + t d (in the slab's own [u, h, v]) is inside the slab, for t
// between from and to.
func (s *Slab) stretches(p, d [3]float64, from, to float64) []stretch {
	lo, hi := math.Max(from, -1e5), math.Min(to, 1e5)
	faceEnd := false
	if math.Abs(d[1]) > 1e-9 {
		a, b := (-s.Thickness-p[1])/d[1], -p[1]/d[1]
		top := math.Max(a, b)
		lo, hi = math.Max(lo, math.Min(a, b)), math.Min(hi, top)
		faceEnd = hi == top
	} else if p[1] > 0 || p[1] < -s.Thickness {
		return nil
	}
	if hi-lo < 1e-9 {
		return nil
	}
	cuts := []float64{lo, hi}
	if math.Hypot(d[0], d[2]) > 1e-9 {
		for _, ring := range s.rings() {
			for i, a := range ring {
				b := ring[(i+1)%len(ring)]
				if t, ok := crossing(p, d, a, b); ok && t > lo && t < hi {
					cuts = append(cuts, t)
				}
			}
		}
	}
	sort.Float64s(cuts)
	at := func(t float64) [2]float64 { return [2]float64{p[0] + d[0]*t, p[2] + d[2]*t} }
	var out []stretch
	for i := 0; i+1 < len(cuts); i++ {
		t0, t1 := cuts[i], cuts[i+1]
		if t1-t0 < 1e-6 || !s.inside(at((t0+t1)/2)) {
			continue
		}
		if n := len(out); n > 0 && math.Abs(out[n-1].to-t0) < 1e-6 {
			out[n-1].to = t1
		} else {
			out = append(out, stretch{from: t0, to: t1})
		}
	}
	for i := range out {
		out[i].byFace = faceEnd && math.Abs(out[i].to-hi) < 1e-6
	}
	return out
}

// local is a continent point in the slab's own [u, h, v]: across its top face from `at`, and up
// from it.
func (s *Slab) local(q [3]float64) [3]float64 {
	deg := math.Pi / 180
	yaw, pitch, roll := -s.Turn[0]*deg, -s.Turn[1]*deg, -s.Turn[2]*deg
	u, h, v := q[0]-s.At[0], q[1]-s.At[1], q[2]-s.At[2]
	u, v = u*math.Cos(yaw)+v*math.Sin(yaw), -u*math.Sin(yaw)+v*math.Cos(yaw)
	h, v = h*math.Cos(pitch)-v*math.Sin(pitch), h*math.Sin(pitch)+v*math.Cos(pitch)
	u, h = u*math.Cos(roll)-h*math.Sin(roll), u*math.Sin(roll)+h*math.Cos(roll)
	return [3]float64{u, h, v}
}

func (s *Slab) rings() [][][2]float64 { return append([][][2]float64{s.Outline}, s.Holes...) }

// inside is whether [u, v] is in the outline and none of the holes.
func (s *Slab) inside(point [2]float64) bool {
	if !inPolygon(s.Outline, point) {
		return false
	}
	for _, hole := range s.Holes {
		if inPolygon(hole, point) {
			return false
		}
	}
	return true
}

// nearestEdge is the edge of the outline or a hole nearest a point.
func (s *Slab) nearestEdge(point [2]float64) (best0, best1 [2]float64) {
	near := math.Inf(1)
	for _, ring := range s.rings() {
		for i, a := range ring {
			b := ring[(i+1)%len(ring)]
			dx, dv := b[0]-a[0], b[1]-a[1]
			t := ((point[0]-a[0])*dx + (point[1]-a[1])*dv) / math.Max(dx*dx+dv*dv, 1e-12)
			t = math.Max(0, math.Min(1, t))
			if dist := math.Hypot(point[0]-a[0]-t*dx, point[1]-a[1]-t*dv); dist < near {
				near, best0, best1 = dist, a, b
			}
		}
	}
	return best0, best1
}

// turnPoint turns a point by [yaw, pitch, roll] degrees: roll, then pitch, then yaw
// (client/src/world/builtObjects.js turnPoint).
func turnPoint(p, turn [3]float64) [3]float64 {
	r := func(d float64) float64 { return d * math.Pi / 180 }
	cz, sz := math.Cos(r(turn[2])), math.Sin(r(turn[2]))
	cx, sx := math.Cos(r(turn[1])), math.Sin(r(turn[1]))
	cy, sy := math.Cos(r(turn[0])), math.Sin(r(turn[0]))
	x, y, z := p[0], p[1], p[2]
	x, y = x*cz-y*sz, x*sz+y*cz
	y, z = y*cx-z*sx, y*sx+z*cx
	x, z = x*cy+z*sy, -x*sy+z*cy
	return [3]float64{x, y, z}
}

// inPolygon is whether [x, z] is inside a polygon, by crossings.
func inPolygon(polygon [][2]float64, point [2]float64) bool {
	into := false
	for i, a := range polygon {
		b := polygon[(i+1)%len(polygon)]
		if (a[1] > point[1]) != (b[1] > point[1]) && point[0] < a[0]+(point[1]-a[1])*(b[0]-a[0])/(b[1]-a[1]) {
			into = !into
		}
	}
	return into
}

// crossing is how far along the line from p in direction d (using their [0] and [2]) it crosses
// the edge a to b.
func crossing(p, d [3]float64, a, b [2]float64) (float64, bool) {
	ex, ez := b[0]-a[0], b[1]-a[1]
	cross := d[0]*ez - d[2]*ex
	if math.Abs(cross) < 1e-12 {
		return 0, false
	}
	fx, fz := a[0]-p[0], a[1]-p[2]
	t := (fx*ez - fz*ex) / cross
	s := (fx*d[2] - fz*d[0]) / cross
	return t, s >= -1e-9 && s <= 1+1e-9
}

func add3(a, b [3]float64) [3]float64 { return [3]float64{a[0] + b[0], a[1] + b[1], a[2] + b[2]} }
func sub3(a, b [3]float64) [3]float64 { return [3]float64{a[0] - b[0], a[1] - b[1], a[2] - b[2]} }
