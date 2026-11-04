package worlds

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// The cases client/src/play/sight.test.js runs too.
func TestSightCases(t *testing.T) {
	raw, err := os.ReadFile("testdata/sight.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Wall, Floor, Holed json.RawMessage
		Cases              []struct {
			Name     string
			Clear    bool
			Feet     float64
			From, To *[3]float64
			Ridge    *struct {
				X, Half, Top float64
				Air          *[2]float64
			}
			Things []struct {
				Tree      string
				Size      int
				X, Z      float64
				At        [2]float64
				Yaw       float64
				Footprint footprint
				Height    float64
				Bottom    float64
			}
			Slabs []string
		}
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	named := map[string]json.RawMessage{"wall": file.Wall, "floor": file.Floor, "holed": file.Holed}
	for _, c := range file.Cases {
		t.Run(c.Name, func(t *testing.T) {
			from, to := [3]float64{0, c.Feet, 0}, [3]float64{100, c.Feet, 0}
			if c.From != nil {
				from = *c.From
			}
			if c.To != nil {
				to = *c.To
			}
			rock := func(x, y, z float64) (bool, error) {
				if c.Ridge == nil || math.Abs(x-c.Ridge.X) > c.Ridge.Half || y >= c.Ridge.Top {
					return y < 0, nil
				}
				return c.Ridge.Air == nil || y < c.Ridge.Air[0] || y > c.Ridge.Air[1], nil
			}
			var solids []solid
			for _, th := range c.Things {
				if th.Tree != "" {
					s, k := treeSizes[th.Size], treeKind(th.Tree)
					h := s.height * k.height
					solids = append(solids, solid{thing{Type: th.Tree, X: th.X, Z: th.Z, Footprint: footprint{Circle: s.trunk * k.trunk}, Height: h, tree: true, crown: crownOf(th.Tree, h, s.crown)}, 0})
					continue
				}
				solids = append(solids, solid{thing{X: th.At[0], Z: th.At[1], Yaw: th.Yaw, Footprint: th.Footprint, Height: th.Height}, th.Bottom})
			}
			var slabs []*Slab
			for _, name := range c.Slabs {
				s, err := readSlab(string(named[name]))
				if err != nil {
					t.Fatal(err)
				}
				slabs = append(slabs, s)
			}
			a, b := [3]float64{from[0], from[1] + sightEyeFt, from[2]}, [3]float64{to[0], to[1] + sightChestFt, to[2]}
			got, err := sightClear(a, b, rock, solids, slabs)
			if err != nil {
				t.Fatal(err)
			}
			if got != c.Clear {
				t.Errorf("clear = %v", got)
			}
		})
	}
}
