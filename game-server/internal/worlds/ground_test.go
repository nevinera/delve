package worlds

import (
	"encoding/json"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

// fixture is the world in testdata/world (written by testdata/world.mjs), read from a zip on disk,
// and what /create finds on it (testdata/expected.json).
func fixture(t *testing.T) (*World, expected) {
	t.Helper()
	files := map[string]string{}
	err := filepath.WalkDir("testdata/world", func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		body, err := os.ReadFile(path)
		rel, _ := filepath.Rel("testdata/world", path)
		files[filepath.ToSlash(rel)] = string(body)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "world.zip")
	if err := os.WriteFile(path, worldZip(t, files), 0o644); err != nil {
		t.Fatal(err)
	}
	w, err := Read(path)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile("testdata/expected.json")
	if err != nil {
		t.Fatal(err)
	}
	var e expected
	if err := json.Unmarshal(raw, &e); err != nil {
		t.Fatal(err)
	}
	return w, e
}

type expected struct {
	Ground []struct {
		At     [2]float64
		Ground *float64
		Water  *float64
	}
	Fills []struct {
		Tile   [2]int
		Things []struct {
			Type      string
			X, Z, Yaw float64
			Footprint footprint
			Height    float64
		}
	}
	Standing []struct {
		Type string
		At   [2]float64
		Y    float64
	}
	Footholds []struct {
		At        [2]float64
		Footholds []float64
	}
	CaveFloors []struct {
		At     [2]float64
		Ground float64
		Floors []float64
		Open   bool
		Rock   []struct {
			Y     float64
			Solid bool
		}
	}
}

func near(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

func TestGroundMatchesCreate(t *testing.T) {
	w, e := fixture(t)
	g := w.Ground("main")
	for _, p := range e.Ground {
		s, ok, err := g.At(p.At[0], p.At[1])
		if err != nil || !ok {
			t.Fatalf("%v: ok %v, %v", p.At, ok, err)
		}
		want := emptyFt
		if p.Ground != nil {
			want = *p.Ground
		}
		if !near(s.Ground, want) {
			t.Errorf("%v: ground = %v, want %v", p.At, s.Ground, want)
		}
		if (p.Water == nil) != math.IsNaN(s.Water) || (p.Water != nil && s.Water != *p.Water) {
			t.Errorf("%v: water = %v, want %v", p.At, s.Water, p.Water)
		}
	}
}

func TestSlotsFillAsCreateFillsThem(t *testing.T) {
	w, e := fixture(t)
	g := w.Ground("main")
	key := func(typ string, x, z float64) string {
		return typ + "@" + jsonOf([2]float64{math.Round(x*1000) / 1000, math.Round(z*1000) / 1000})
	}
	for _, f := range e.Fills {
		got, err := g.fill(f.Tile[0], f.Tile[1])
		if err != nil {
			t.Fatal(err)
		}
		mine := map[string]thing{}
		for _, th := range got {
			mine[key(th.Type, th.X, th.Z)] = th
		}
		if len(got) != len(f.Things) {
			t.Errorf("tile %v: %d things, want %d", f.Tile, len(got), len(f.Things))
		}
		for _, want := range f.Things {
			th, ok := mine[key(want.Type, want.X, want.Z)]
			if !ok && strings.HasSuffix(strings.ToLower(want.Type), "boulder") {
				// Boulders across cascades come from sines of large numbers, which Go and the browser
				// work out a little differently: they're near enough.
				drifted := false
				for _, o := range got {
					drifted = drifted || (o.Type == want.Type && math.Hypot(o.X-want.X, o.Z-want.Z) < 0.1 && math.Abs(o.Footprint.reach()-want.Footprint.reach()) < 0.01)
				}
				if drifted {
					continue
				}
			}
			if !ok {
				t.Errorf("tile %v: no %s at %v, %v", f.Tile, want.Type, want.X, want.Z)
				continue
			}
			if !near(th.Yaw, want.Yaw) || !near(th.Footprint.reach(), want.Footprint.reach()) || (!th.tree && !near(th.Height, want.Height)) {
				t.Errorf("tile %v: %s at %v, %v is %+v, want %+v", f.Tile, want.Type, want.X, want.Z, th, want)
			}
		}
	}
}

func jsonOf(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func TestPlacedObjectsStandAsInCreate(t *testing.T) {
	w, e := fixture(t)
	g := w.Ground("main")
	p, err := g.plate(0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range e.Standing {
		found := false
		for _, o := range p.objects {
			if o.Type != want.Type || o.X != want.At[0] || o.Z != want.At[1] {
				continue
			}
			found = true
			if y, err := g.objectY(o); err != nil || !near(y, want.Y) {
				t.Errorf("%s stands at %v (%v), want %v", o.Type, y, err, want.Y)
			}
		}
		if !found {
			t.Errorf("no %s at %v", want.Type, want.At)
		}
	}
	// A built object keeps its footprint in the file; the game server doesn't know its kind.
	types := []string{}
	for _, o := range p.objects {
		types = append(types, o.Type)
	}
	sort.Strings(types)
	if jsonOf(types) != `["boulder","built:shed0001","rubble","stump"]` {
		t.Errorf("objects %v", types)
	}
}

func TestGroundFindsSlabFootholdsAsCreateDoes(t *testing.T) {
	w, e := fixture(t)
	g := w.Ground("main")
	for _, p := range e.Footholds {
		s, _, err := g.At(p.At[0], p.At[1])
		if err != nil {
			t.Fatal(err)
		}
		sort.Float64s(s.Footholds)
		sort.Float64s(p.Footholds)
		if len(s.Footholds) != len(p.Footholds) {
			t.Errorf("%v: footholds = %v, want %v", p.At, s.Footholds, p.Footholds)
			continue
		}
		for i := range p.Footholds {
			if !near(s.Footholds[i], p.Footholds[i]) {
				t.Errorf("%v: footholds = %v, want %v", p.At, s.Footholds, p.Footholds)
			}
		}
	}
}

func TestGroundStopsMovesIntoSlabsAndThings(t *testing.T) {
	w, _ := fixture(t)
	g := w.Ground("main")
	floor := heightAtFixture(100, 500) + 1
	tree := firstTree(t, g)
	shed, _, err := g.heightAt(200, 600)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		name     string
		from, to [3]float64
		want     string
	}{
		{"through the wall", [3]float64{104, floor, 502}, [3]float64{104, floor, 496}, "a slab"},
		{"through the doorway", [3]float64{112, floor, 502}, [3]float64{112, floor, 496}, ""},
		{"across the floor", [3]float64{102, floor, 502}, [3]float64{108, floor, 508}, ""},
		{"out of a wall it's in", [3]float64{104, floor, 499.5}, [3]float64{104, floor, 502}, ""},
		{"through a tree", [3]float64{tree.X - 10, 0, tree.Z}, [3]float64{tree.X + 10, 0, tree.Z}, "a tree"},
		{"past a tree", [3]float64{tree.X - 10, 0, tree.Z + tree.Footprint.Circle + 1}, [3]float64{tree.X + 10, 0, tree.Z + tree.Footprint.Circle + 1}, ""},
		{"through a shed", [3]float64{196, shed, 600}, [3]float64{204, shed, 600}, "a built:shed0001"},
		{"over a shed", [3]float64{196, shed + 10, 600}, [3]float64{204, shed + 10, 600}, ""},
	} {
		if c.name == "through a tree" || c.name == "past a tree" {
			c.from[1], c.to[1] = tree.Y, tree.Y
		}
		got, err := g.Enters(c.from, c.to)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("%s: Enters = %q, want %q", c.name, got, c.want)
		}
	}
}

// heightAtFixture is testdata/world.mjs's heightAt.
func heightAtFixture(x, z float64) float64 {
	h := 20 + 15*math.Sin(x/180) + 10*math.Cos(z/140)
	if x > 600 {
		h += math.Min(60, (x-600)*3)
	}
	if d := math.Hypot(x-300, z-300); d < 110 {
		h -= 25 * (1 - d/110)
	}
	return jsRound(h*4) / 4
}

// firstTree is a tree in the fixture away from other things, standing at its ground.
func firstTree(t *testing.T, g *Ground) thing {
	t.Helper()
	g.mu.Lock()
	defer g.mu.Unlock()
	for tz := 0; tz <= 2; tz++ {
		for tx := 0; tx <= 2; tx++ {
			filled, err := g.fill(tx, tz)
			if err != nil {
				t.Fatal(err)
			}
		next:
			for _, th := range filled {
				if !th.tree {
					continue
				}
				for _, o := range filled {
					if (o.X != th.X || o.Z != th.Z) && math.Abs(o.X-th.X) < 14 && math.Abs(o.Z-th.Z) < 14 {
						continue next
					}
				}
				th.Y, _, _ = g.heightAt(th.X, th.Z)
				return th
			}
		}
	}
	t.Fatal("no tree on its own")
	return thing{}
}

func TestGroundFindsCaveFloorsAndRockAsCreateDoes(t *testing.T) {
	w, e := fixture(t)
	g := w.Ground("main")
	if len(e.CaveFloors) == 0 {
		t.Fatal("the fixture has no caves")
	}
	for _, p := range e.CaveFloors {
		s, _, err := g.At(p.At[0], p.At[1])
		if err != nil {
			t.Fatal(err)
		}
		if len(s.Floors) != len(p.Floors) || s.Open != p.Open {
			t.Errorf("%v: floors %v, open %v; want %v, %v", p.At, s.Floors, s.Open, p.Floors, p.Open)
			continue
		}
		for k := range s.Floors {
			if !near(s.Floors[k], p.Floors[k]) {
				t.Errorf("%v: floors = %v, want %v", p.At, s.Floors, p.Floors)
			}
		}
		g.mu.Lock()
		for _, r := range p.Rock {
			in, err := g.inCaveRock(p.At[0], r.Y, p.At[1], s.Ground)
			if err != nil {
				t.Fatal(err)
			}
			if in != r.Solid {
				t.Errorf("%v: in rock at %v = %v, want %v", p.At, r.Y, in, r.Solid)
			}
		}
		g.mu.Unlock()
	}
}

func TestGroundStopsMovesIntoCaveRock(t *testing.T) {
	w, _ := fixture(t)
	g := w.Ground("main")
	for _, c := range []struct {
		name     string
		from, to [3]float64
		want     string
	}{
		{"across the domed cave", [3]float64{545, -20, 425}, [3]float64{555, -20, 435}, ""},
		{"out through its wall", [3]float64{550, -20, 450}, [3]float64{550, -20, 470}, "a cave's rock"},
		{"down the tunnel", [3]float64{535, 4.7, 325}, [3]float64{540, -3.8, 350}, ""},
		{"in through the mouth", [3]float64{530, 17.5, 296}, [3]float64{531.3, 12.1, 301.7}, ""},
		{"out of rock it's in", [3]float64{550, -20, 470}, [3]float64{550, -20, 450}, ""},
		{"over the ground", [3]float64{520, 14, 460}, [3]float64{530, 14, 470}, ""},
	} {
		got, err := g.Enters(c.from, c.to)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("%s: Enters = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestReadCavesRefusesBadFiles(t *testing.T) {
	for _, text := range []string{
		"cave 2 0 0\n",
		"caves 3 0 0\n",
		"caves 2 0 0\ntile 0 a\n",
		"caves 2 0 0\ntile 0 a\nc9 00\n",
		"caves 2 0 0\ntile 0 a\nc1 01 99999999999999\n",
	} {
		if _, err := readCaves([]byte(text)); err == nil {
			t.Errorf("read %q", text)
		}
	}
	for _, text := range []string{"\x1f\x8b binary", "caves 1 0 0\n"} {
		if c, err := readCaves([]byte(text)); err != nil || len(c) != 0 {
			t.Errorf("%q: %v, %v; want no caves", text, c, err)
		}
	}
}

func TestReadPlateRefusesBadPlates(t *testing.T) {
	for _, text := range []string{
		"\x1f\x8b binary",
		"plate 7 0 0\n",
		"plat 8 0 0\n",
		"plate 8 0 0\ntile 0\nh q\n",
		"plate 8 0 0\ntile 0\nh c\nh fAAA\n",
		"plate 8 0 0\ntile 99\n",
	} {
		if _, err := readPlate([]byte(text), 0, 0); err == nil {
			t.Errorf("read %q", text)
		}
	}
}

func TestGroundOfAWorldNotFromAZip(t *testing.T) {
	if (&World{}).Ground("main") != nil {
		t.Error("a world not read from a zip has ground")
	}
}

func TestFillIsTheClients(t *testing.T) {
	theirs, err := os.ReadFile("../../../client/src/v2/fill.json")
	if err != nil {
		t.Fatal(err)
	}
	if string(theirs) != string(fillJSON) {
		t.Error("fill.json differs from client/src/v2/fill.json: copy it over")
	}
}

func TestFillBiomesAreNamed(t *testing.T) {
	for name := range fillTable.Biomes {
		found := false
		for _, known := range biomeNames {
			found = found || known == name
		}
		if !found {
			t.Errorf("fill.json has biome %q, which biomeNames doesn't", name)
		}
	}
	for _, name := range biomeNames {
		if _, ok := fillTable.Biomes[name]; !ok {
			t.Errorf("fill.json has no biome %q", name)
		}
	}
}

func TestFillBuiltObjects(t *testing.T) {
	any := false
	for _, sizes := range fillTable.Biomes {
		for _, entries := range sizes {
			for _, e := range entries {
				if !strings.HasPrefix(e.Object, "built:") {
					continue
				}
				any = true
				if e.Scales == nil || e.Footprint == nil {
					t.Errorf("%s says no scales or footprint", e.Object)
				}
			}
		}
	}
	if !any || len(fillThrough) == 0 {
		t.Error("expected built objects in fill.json, some you see through")
	}
}
