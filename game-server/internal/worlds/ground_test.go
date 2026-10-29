package worlds

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// groundWorld is vale with testdata/surface_0_0.plate (written by testdata/plate.mjs) on its main
// continent, read from a zip on disk.
func groundWorld(t *testing.T) *World {
	t.Helper()
	plate, err := os.ReadFile("testdata/surface_0_0.plate")
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{"places/continents/main/plates/surface/0_0.plate": string(plate)}
	for k, v := range vale {
		files[k] = v
	}
	path := filepath.Join(t.TempDir(), "world.zip")
	if err := os.WriteFile(path, worldZip(t, files), 0o644); err != nil {
		t.Fatal(err)
	}
	w, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

func TestGroundMatchesTheClient(t *testing.T) {
	raw, err := os.ReadFile("testdata/ground.json")
	if err != nil {
		t.Fatal(err)
	}
	var points []struct {
		At     [2]float64
		Ground *float64
		Water  *float64
	}
	if err := json.Unmarshal(raw, &points); err != nil {
		t.Fatal(err)
	}
	g := groundWorld(t).Ground("main")
	for _, p := range points {
		s, ok, err := g.At(p.At[0], p.At[1])
		if err != nil {
			t.Fatal(err)
		}
		if ok != (p.Ground != nil) {
			t.Errorf("%v: ok = %v, want %v", p.At, ok, p.Ground != nil)
			continue
		}
		if !ok {
			continue
		}
		if math.Abs(s.Ground-*p.Ground) > 1e-6 {
			t.Errorf("%v: ground = %v, want %v", p.At, s.Ground, *p.Ground)
		}
		if (p.Water == nil) != math.IsNaN(s.Water) || (p.Water != nil && s.Water != *p.Water) {
			t.Errorf("%v: water = %v, want %v", p.At, s.Water, p.Water)
		}
	}
}

func TestGroundReadsOldStructures(t *testing.T) {
	// The plate still places a dock, a structure from before templates, at (672.5, 160.25): the
	// ground there reads as ground.
	s, ok, err := groundWorld(t).Ground("main").At(672.5, 160.25)
	if err != nil || !ok || len(s.Footholds) != 0 {
		t.Errorf("sample %+v, ok %v, %v", s, ok, err)
	}
}

func TestGroundWithoutPlates(t *testing.T) {
	g := groundWorld(t).Ground("isle")
	if _, ok, err := g.At(10, 10); ok || err != nil {
		t.Errorf("ok %v, err %v; want no ground", ok, err)
	}
	if (&World{}).Ground("main") != nil {
		t.Error("a world not read from a zip has ground")
	}
}

func TestReadPlateRefusesBadPlates(t *testing.T) {
	for _, text := range []string{
		"plate 2 0,0 surface\ntile 0,0 32\n",
		"plate 2 0,0 surface\ntile 0,0 64\nlayer height\n000\n",
		"plate 2 0,0 surface\ntile 0,0 64\nlayer height =0!0\n",
		"plate 2 0,0 surface\ntile 0,0 64\nlayer water =000\n",
	} {
		if _, err := readPlate(strings.NewReader(text)); err == nil {
			t.Errorf("read %q", text)
		}
	}
}

func TestGroundFindsSlabFootholdsAsTheClientDoes(t *testing.T) {
	raw, err := os.ReadFile("testdata/slabs.json")
	if err != nil {
		t.Fatal(err)
	}
	var points []struct {
		At        [2]float64
		Footholds []float64
	}
	if err := json.Unmarshal(raw, &points); err != nil {
		t.Fatal(err)
	}
	g := groundWorld(t).Ground("main")
	for _, p := range points {
		s, ok, err := g.At(p.At[0], p.At[1])
		if err != nil || !ok {
			t.Fatalf("%v: ok = %v, err = %v", p.At, ok, err)
		}
		if len(s.Footholds) != len(p.Footholds) {
			t.Errorf("%v: footholds = %v, want %v", p.At, s.Footholds, p.Footholds)
			continue
		}
		for i := range p.Footholds {
			if math.Abs(s.Footholds[i]-p.Footholds[i]) > 1e-6 {
				t.Errorf("%v: footholds = %v, want %v", p.At, s.Footholds, p.Footholds)
			}
		}
	}
}

func TestGroundStopsMovesIntoSlabs(t *testing.T) {
	g := groundWorld(t).Ground("main")
	for _, c := range []struct {
		name     string
		from, to [3]float64
		want     bool
	}{
		{"through the wall", [3]float64{804, 10, 402}, [3]float64{804, 10, 396}, true},
		{"through the doorway", [3]float64{810, 10, 402}, [3]float64{810, 10, 396}, false},
		{"across the floor", [3]float64{802, 10, 402}, [3]float64{818, 10, 418}, false},
		{"up the ramp", [3]float64{821, 10.6, 410}, [3]float64{830, 15.8, 410}, false},
		{"under the platform", [3]float64{895, 8, 410}, [3]float64{905, 8, 410}, false},
		{"into the platform's side", [3]float64{895, 27, 410}, [3]float64{905, 27, 410}, true},
		{"out of a wall it's in", [3]float64{804, 10, 399.5}, [3]float64{804, 10, 402}, false},
	} {
		got, err := g.Enters(c.from, c.to)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("%s: Enters = %v, want %v", c.name, got, c.want)
		}
	}
}
