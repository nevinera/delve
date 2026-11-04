package worlds

import (
	"encoding/json"
	"math"
	"strings"
)

// Line of sight (.agents/formats.md), by the rules client/src/play/sight.js keeps too, tested
// against the same cases (testdata/sight.json). Clutter doesn't block sight.

const (
	sightEyeFt   = 5.0 // sight starts this far over the feet of who's looking
	sightChestFt = 3.5 // and ends this far over the feet of what they look at
	sightEndsFt  = 2.0 // the ground this near either end doesn't block: low ceilings, steep ground
	sightStepFt  = 0.5 // how often along the line it looks
	trunkTop     = 0.9 // a trunk's top, as a share of its tree's height
)

// solid is a tree or object that blocks sight, standing at `bottom`.
type solid struct {
	thing
	bottom float64
}

// holds is whether the point is in it: a tree's trunk or crown, or an object's upright footprint.
func (s solid) holds(x, y, z float64) bool {
	up := y - s.bottom
	if !s.tree {
		return up >= 0 && up <= s.Height && s.inside(x, z)
	}
	if up >= 0 && up <= s.Height*trunkTop && s.inside(x, z) {
		return true
	}
	half := (s.crown.to - s.crown.from) / 2
	if half <= 0 {
		return false
	}
	share := (up - s.crown.from - half) / half
	return math.Abs(share) < 1 && math.Hypot(x-s.X, z-s.Z) < s.crown.radius*math.Sqrt(1-share*share)
}

// sightClear is whether the line from a to b (both the sighted points, not feet) misses them all.
// What either end is in doesn't block it.
func sightClear(a, b [3]float64, rock func(x, y, z float64) (bool, error), solids []solid, slabs []*Slab) (bool, error) {
	for _, slab := range slabs {
		if slab.Enters(a, b) {
			return false, nil
		}
	}
	length := math.Sqrt(sq(b[0]-a[0]) + sq(b[1]-a[1]) + sq(b[2]-a[2]))
	steps := max(1, int(math.Ceil(length/sightStepFt)))
	var inWay []solid
	for _, s := range solids {
		if !s.holds(a[0], a[1], a[2]) && !s.holds(b[0], b[1], b[2]) {
			inWay = append(inWay, s)
		}
	}
	for n := 0; n <= steps; n++ {
		u := float64(n) / float64(steps)
		x, y, z := a[0]+(b[0]-a[0])*u, a[1]+(b[1]-a[1])*u, a[2]+(b[2]-a[2])*u
		if along := u * length; along >= sightEndsFt && along <= length-sightEndsFt {
			if in, err := rock(x, y, z); in || err != nil {
				return false, err
			}
		}
		for _, s := range inWay {
			if s.holds(x, y, z) {
				return false, nil
			}
		}
	}
	return true, nil
}

func sq(v float64) float64 { return v * v }

// Sees is whether someone with their feet at `from` can see what has its feet at `to`.
func (g *Ground) Sees(from, to [3]float64) (bool, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	a := [3]float64{from[0], from[1] + sightEyeFt, from[2]}
	b := [3]float64{to[0], to[1] + sightChestFt, to[2]}
	mx, mz := (a[0]+b[0])/2, (a[2]+b[2])/2
	reach := math.Hypot(b[0]-a[0], b[2]-a[2]) / 2
	slabs, err := g.slabsNear(mx, mz, reach)
	if err != nil {
		return false, err
	}
	things, err := g.thingsAround(mx, mz, reach+crownReachFt, func(thing, float64) bool { return true })
	if err != nil {
		return false, err
	}
	var solids []solid
	for _, t := range things {
		if !t.tree {
			if through, err := g.seenThrough(t.Type); through || err != nil {
				if err != nil {
					return false, err
				}
				continue
			}
		}
		bottom, err := g.bottomOf(t)
		if err != nil {
			return false, err
		}
		solids = append(solids, solid{t, bottom})
	}
	return sightClear(a, b, g.rockAt, solids, slabs)
}

// rockAt is whether (x, y, z) is under the ground and in none of a cave's air. The lock is held.
func (g *Ground) rockAt(x, y, z float64) (bool, error) {
	ground, found, err := g.heightAt(x, z)
	if err != nil || !found || y >= ground {
		return false, err
	}
	spans, err := g.spans(int(math.Floor(x/voxelFt)), int(math.Floor(z/voxelFt)))
	if err != nil {
		return false, err
	}
	for _, s := range spans {
		if s.floor <= y && y <= s.ceiling {
			return false, nil
		}
	}
	return true, nil
}

// bottomOf is the height a tree or object stands at. What's in a tile's slots hasn't its own. The
// lock is held.
func (g *Ground) bottomOf(t thing) (float64, error) {
	if t.tree {
		h, _, err := g.heightAt(t.X, t.Z)
		return h, err
	}
	if t.slotted {
		t.Y = math.NaN()
	}
	return g.objectY(t)
}

// seenThrough is whether you can see through objects of a type: a built object that says so
// (objects/<id>.json), or a built-in kind that is. The lock is held.
func (g *Ground) seenThrough(kind string) (bool, error) {
	id, built := strings.CutPrefix(kind, "built:")
	if !built {
		return seeThrough[kind], nil
	}
	if through, read := g.through[id]; read {
		return through, nil
	}
	body, err := g.file("objects/" + id + ".json")
	if err != nil {
		return false, err
	}
	var object struct {
		BlocksSight *bool `json:"blocksSight"`
	}
	if body != nil {
		if err := json.Unmarshal(body, &object); err != nil {
			return false, err
		}
	}
	if g.through == nil {
		g.through = map[string]bool{}
	}
	g.through[id] = object.BlocksSight != nil && !*object.BlocksSight
	return g.through[id], nil
}
