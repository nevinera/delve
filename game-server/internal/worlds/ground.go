package worlds

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"sync"
)

// The ground of a continent, as /create's builder walks it (client/src/create/ground.js
// Renditions, things.js, scatter.js): heights and water from its plate files, slabs and objects
// from its placed files, and trees and objects in the tiles' slots and across courses' cascades.
// Off the tiles is sea.

// MaxClimb is the rise over run of the steepest ground or slab a character walks up: 50°.
var MaxClimb = math.Tan(50 * math.Pi / 180)

const (
	emptyFt = -100.0 // the sea floor's height where there are no tiles
	stepFt  = 2.5    // how far up a walker steps onto a slab, and what's lower isn't in the way
	headFt  = 6.0    // how tall a walker is, for what's in their way
	leeway  = 0.25   // how far into something a move can go before it's in the way
)

// Sample is the ground at a point.
type Sample struct {
	Ground float64 // feet, straight between cell corners
	Water  float64 // the water's surface over the cell, or NaN
	// Footholds are the heights of slab faces there gentle enough to stand on (Slab.Footholds).
	Footholds []float64
}

// Ground reads one continent's ground, a plate at a time as it's needed, and keeps what it's read.
type Ground struct {
	path, prefix, continent string // the world's zip, its top directory
	mu                      sync.Mutex
	plates                  map[[2]int]*plate
	boulders                []thing // across courses' cascades, once water.json's read
	bouldersRead            bool
}

type plate struct {
	tiles   map[int]*tile // by index in the plate
	slabs   []*Slab
	objects []thing // placed by hand
	pressed map[int]pressedTile
	filled  map[int][]thing
}

type pressedTile struct {
	heights []float32
	covered map[int]bool
}

// Ground is the ground of one of the world's continents, or nil for a world not read from a zip.
func (w *World) Ground(continent string) *Ground {
	if w.path == "" {
		return nil
	}
	return &Ground{path: w.path, prefix: w.prefix, continent: continent, plates: map[[2]int]*plate{}}
}

// At samples the ground at continent feet (x, z). ok is always true: off the tiles is sea.
func (g *Ground) At(x, z float64) (s Sample, ok bool, err error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	h, found, err := g.heightAt(x, z)
	if err != nil {
		return s, false, err
	}
	s.Ground = emptyFt
	if found {
		s.Ground = h
	}
	s.Water = math.NaN()
	if level, _, wet, err := g.waterAt(x, z); err != nil {
		return s, false, err
	} else if wet {
		s.Water = level
	}
	slabs, err := g.slabsNear(x, z, 0)
	for _, slab := range slabs {
		s.Footholds = append(s.Footholds, slab.Footholds(x, z, MaxClimb)...)
	}
	return s, err == nil, err
}

// Enters is what the straight move from a to b (continent feet, the feet's height) runs into, or
// "": a slab at a character's body height, from a step over its feet up to its eyes, or a tree
// or object. What it starts in doesn't stop it moving.
func (g *Ground) Enters(a, b [3]float64) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	reach := math.Hypot(b[0]-a[0], b[2]-a[2])
	slabs, err := g.slabsNear((a[0]+b[0])/2, (a[2]+b[2])/2, reach/2)
	if err != nil {
		return "", err
	}
	for _, slab := range slabs {
		for _, up := range bodyHeights {
			if slab.Enters([3]float64{a[0], a[1] + up, a[2]}, [3]float64{b[0], b[1] + up, b[2]}) {
				return "a slab", nil
			}
		}
	}
	things, err := g.thingsNear((a[0]+b[0])/2, (a[2]+b[2])/2, reach/2+slabReachFt, b[1])
	if err != nil {
		return "", err
	}
	steps := int(math.Ceil(reach / 0.5))
	for _, t := range things {
		if t.inside(a[0], a[2]) {
			continue
		}
		for n := 1; n <= steps; n++ {
			u := float64(n) / float64(steps)
			if t.inside(a[0]+(b[0]-a[0])*u, a[2]+(b[2]-a[2])*u) {
				if t.tree {
					return "a tree", nil
				}
				return "a " + t.Type, nil
			}
		}
	}
	return "", nil
}

// bodyHeights are the heights over the feet a move is checked against slabs at: over a step, up
// to the eyes.
var bodyHeights = []float64{2, 3.5, 5}

// inside is whether (x, z) is inside the thing's footprint by more than leeway.
func (t thing) inside(x, z float64) bool {
	f := t.Footprint
	c, s := math.Cos(t.Yaw), -math.Sin(t.Yaw)
	switch {
	case f.Open > 0:
		return false
	case f.Circle > 0:
		return math.Hypot(x-t.X, z-t.Z) < f.Circle-leeway
	case len(f.Capsule) == 2:
		r, half := f.Capsule[0], f.Capsule[1]
		ax, az, bx, bz := t.X-c*half, t.Z-s*half, t.X+c*half, t.Z+s*half
		dx, dz := bx-ax, bz-az
		u := 0.0
		if l := dx*dx + dz*dz; l > 0 {
			u = math.Min(1, math.Max(0, ((x-ax)*dx+(z-az)*dz)/l))
		}
		return math.Hypot(x-ax-dx*u, z-az-dz*u) < r-leeway
	case len(f.Rect) == 2:
		u, v := (x-t.X)*c+(z-t.Z)*s, -(x-t.X)*s+(z-t.Z)*c
		return math.Abs(u) < f.Rect[0]/2-leeway && math.Abs(v) < f.Rect[1]/2-leeway
	}
	return false
}

// thingsNear are the trees and objects within `by` feet of (x, z) in the way of a walker whose feet
// are at y: those in the tiles' slots and across cascades whatever their height, and those placed
// by hand reaching over a step above the feet and under the head. The lock is held.
func (g *Ground) thingsNear(x, z, by, y float64) ([]thing, error) {
	var out []thing
	near := func(t thing) bool {
		return math.Abs(t.X-x) <= by+t.Footprint.reach() && math.Abs(t.Z-z) <= by+t.Footprint.reach()
	}
	for tz := int(math.Floor((z - by) / TileFt)); tz <= int(math.Floor((z+by)/TileFt)); tz++ {
		for tx := int(math.Floor((x - by) / TileFt)); tx <= int(math.Floor((x+by)/TileFt)); tx++ {
			filled, err := g.fill(tx, tz)
			if err != nil {
				return nil, err
			}
			for _, t := range filled {
				if near(t) {
					out = append(out, t)
				}
			}
		}
	}
	plates, err := g.platesNear(x, z, by)
	if err != nil {
		return nil, err
	}
	for _, p := range plates {
		for _, t := range p.objects {
			if !near(t) || t.Footprint.Open > 0 {
				continue
			}
			bottom, err := g.objectY(t)
			if err != nil {
				return nil, err
			}
			if bottom < y+headFt && bottom+t.Height > y+stepFt {
				out = append(out, t)
			}
		}
	}
	return out, nil
}

// objectY is the height an object placed by hand stands at: its own, or on the slab under it, or
// on the lowest ground under it, sunk a little (client/src/create/things.js objectY).
func (g *Ground) objectY(t thing) (float64, error) {
	if !math.IsNaN(t.Y) {
		return t.Y, nil
	}
	ground := func(x, z float64) (float64, error) {
		h, ok, err := g.heightAt(x, z)
		if !ok {
			h = emptyFt
		}
		return h, err
	}
	here, err := ground(t.X, t.Z)
	if err != nil {
		return 0, err
	}
	slabs, err := g.slabsNear(t.X, t.Z, 0)
	if err != nil {
		return 0, err
	}
	stand := here
	for _, slab := range slabs {
		for _, top := range slab.Footholds(t.X, t.Z, MaxClimb) {
			stand = math.Max(stand, top)
		}
	}
	if stand > here {
		return stand, nil
	}
	reach := t.Footprint.Circle
	if reach == 0 && len(t.Footprint.Rect) == 2 {
		reach = math.Min(t.Footprint.Rect[0], t.Footprint.Rect[1]) / 2
	}
	low := here
	for _, d := range [4][2]float64{{reach, 0}, {-reach, 0}, {0, reach}, {0, -reach}} {
		h, err := ground(t.X+d[0], t.Z+d[1])
		if err != nil {
			return 0, err
		}
		low = math.Min(low, h)
	}
	return low - 0.1*t.Height, nil
}

// tileAt is tile (tx, tz) and its plate, or nils where there's none. The lock is held.
func (g *Ground) tileAt(tx, tz int) (*tile, *plate, int, error) {
	px, pz := floorDiv(tx, plateTiles), floorDiv(tz, plateTiles)
	p, err := g.plate(px, pz)
	if err != nil || p == nil {
		return nil, nil, 0, err
	}
	index := (tz-pz*plateTiles)*plateTiles + tx - px*plateTiles
	return p.tiles[index], p, index, nil
}

// heightAt is the ground's height at (x, z), pressed down by slabs, straight between cell corners,
// or false where there's no tile. The lock is held.
func (g *Ground) heightAt(x, z float64) (float64, bool, error) {
	tx, tz := int(math.Floor(x/TileFt)), int(math.Floor(z/TileFt))
	pt, err := g.pressedTile(tx, tz)
	if err != nil || pt == nil {
		return 0, false, err
	}
	u, v := (x-float64(tx)*TileFt)/cellFt, (z-float64(tz)*TileFt)/cellFt
	i, j := min(cellCorner-2, int(math.Floor(u))), min(cellCorner-2, int(math.Floor(v)))
	fu, fv := u-float64(i), v-float64(j)
	h := func(a, b int) float64 { return float64(pt.heights[(j+b)*cellCorner+i+a]) }
	top := h(0, 0) + (h(1, 0)-h(0, 0))*fu
	bottom := h(0, 1) + (h(1, 1)-h(0, 1))*fu
	return top + (bottom-top)*fv, true, nil
}

// pressedTile is tile (tx, tz)'s heights pressed down by slabs, and the cells they cover, or nil
// where there's no tile. The lock is held.
func (g *Ground) pressedTile(tx, tz int) (*pressedTile, error) {
	t, p, index, err := g.tileAt(tx, tz)
	if err != nil || t == nil {
		return nil, err
	}
	if pt, ok := p.pressed[index]; ok {
		return &pt, nil
	}
	// The slabs in plates within a tile of its middle, as client/src/create/main.js has them.
	near, err := g.platesNear((float64(tx)+0.5)*TileFt, (float64(tz)+0.5)*TileFt, TileFt)
	if err != nil {
		return nil, err
	}
	var slabs []*Slab
	for _, q := range near {
		slabs = append(slabs, q.slabs...)
	}
	heights, covered := pressed(t.heights, pressesOver(slabs, tx, tz), tx, tz)
	pt := pressedTile{heights, covered}
	p.pressed[index] = pt
	return &pt, nil
}

// waterAt is the water at (x, z): its level and type, and whether there's any. Off the tiles it's
// the sea's. The lock is held.
func (g *Ground) waterAt(x, z float64) (float64, uint8, bool, error) {
	tx, tz := int(math.Floor(x/TileFt)), int(math.Floor(z/TileFt))
	t, _, _, err := g.tileAt(tx, tz)
	if err != nil {
		return 0, 0, false, err
	}
	if t == nil {
		return 0, seaType, true, nil
	}
	if t.level == nil {
		return 0, 0, false, nil
	}
	k := int(math.Floor((z-float64(tz)*TileFt)/cellFt))*tileCells + int(math.Floor((x-float64(tx)*TileFt)/cellFt))
	if math.IsNaN(float64(t.level[k])) {
		return 0, 0, false, nil
	}
	return float64(t.level[k]), t.kind[k], true, nil
}

// fill is what stands in tile (tx, tz)'s slots and across cascades there, but under slabs (client/src/create/scatter.js
// fill). The lock is held.
func (g *Ground) fill(tx, tz int) ([]thing, error) {
	t, p, index, err := g.tileAt(tx, tz)
	if err != nil || t == nil {
		return nil, err
	}
	if filled, ok := p.filled[index]; ok {
		return filled, nil
	}
	pt, err := g.pressedTile(tx, tz)
	if err != nil {
		return nil, err
	}
	var failed error
	ground := func(x, z float64) float64 {
		h, _, err := g.heightAt(x, z)
		if err != nil {
			failed = err
		}
		return h
	}
	water := func(x, z float64) (float64, uint8, bool) {
		level, kind, wet, err := g.waterAt(x, z)
		if err != nil {
			failed = err
		}
		return level, kind, wet
	}
	things := fillSlots(t.slots, tx, tz, func(i, j int) uint8 { return t.biome[j*tileCells+i] }, func(x, z float64) (float64, float64, *nearWater) {
		const s = slopeFt
		nw, ne, sw, se := ground(x-s, z-s), ground(x+s, z-s), ground(x-s, z+s), ground(x+s, z+s)
		height := (nw + ne + sw + se) / 4
		hereLevel, _, here := water(x, z)
		var near *nearWater
		for _, d := range [5][2]float64{{0, 0}, {nearShoreFt, 0}, {-nearShoreFt, 0}, {0, nearShoreFt}, {0, -nearShoreFt}} {
			level, kind, wet := water(x+d[0], z+d[1])
			if !wet {
				continue
			}
			if near == nil {
				near = &nearWater{level: math.Inf(-1)}
			}
			near.level = math.Max(near.level, level)
			near.running = near.running || running(kind)
		}
		if here && hereLevel > height {
			near.wet, near.level = true, hereLevel
		}
		return height, slopeOf(nw, ne, sw, se, 2*s), near
	})
	if failed != nil {
		return nil, failed
	}
	boulders, err := g.courseBoulders()
	if err != nil {
		return nil, err
	}
	x0, z0 := float64(tx)*TileFt, float64(tz)*TileFt
	for _, b := range boulders {
		if b.X >= x0 && b.X < x0+TileFt && b.Z >= z0 && b.Z < z0+TileFt {
			things = append(things, b)
		}
	}
	// Nothing grows under slabs.
	var out []thing
	for _, th := range things {
		if pt.covered[int(math.Floor((th.Z-z0)/cellFt))*tileCells+int(math.Floor((th.X-x0)/cellFt))] {
			continue
		}
		out = append(out, th)
	}
	p.filled[index] = out
	return out, nil
}

// courseBoulders are the boulders across all the continent's courses' cascades. The lock is held.
func (g *Ground) courseBoulders() ([]thing, error) {
	if g.bouldersRead {
		return g.boulders, nil
	}
	data, err := g.file(fmt.Sprintf("places/continents/%s/water.json", g.continent))
	if err != nil {
		return nil, err
	}
	if data != nil {
		var water struct {
			Courses []course `json:"courses"`
		}
		if err := json.Unmarshal(data, &water); err != nil {
			return nil, fmt.Errorf("worlds: water.json: %w", err)
		}
		for i := range water.Courses {
			if len(water.Courses[i].Points) >= 2 {
				g.boulders = append(g.boulders, water.Courses[i].boulders()...)
			}
		}
	}
	g.bouldersRead = true
	return g.boulders, nil
}

// slabsNear are the slabs whose corners come within `by` feet of (x, z) across the ground. The
// lock is held.
func (g *Ground) slabsNear(x, z, by float64) ([]*Slab, error) {
	plates, err := g.platesNear(x, z, by+slabReachFt*2)
	if err != nil {
		return nil, err
	}
	var out []*Slab
	for _, p := range plates {
		for _, slab := range p.slabs {
			if slab.near(x, z, by) {
				out = append(out, slab)
			}
		}
	}
	return out, nil
}

// platesNear are the plates within `reach` of (x, z) that have anything. The lock is held.
func (g *Ground) platesNear(x, z, reach float64) ([]*plate, error) {
	var out []*plate
	for pz := int(math.Floor((z - reach) / plateFt)); pz <= int(math.Floor((z+reach)/plateFt)); pz++ {
		for px := int(math.Floor((x - reach) / plateFt)); px <= int(math.Floor((x+reach)/plateFt)); px++ {
			p, err := g.plate(px, pz)
			if err != nil {
				return nil, err
			}
			if p != nil {
				out = append(out, p)
			}
		}
	}
	return out, nil
}

// plate reads plate (px, pz)'s plate file and placed file the first time it's asked for, or nil
// where it has neither. The lock is held.
func (g *Ground) plate(px, pz int) (*plate, error) {
	key := [2]int{px, pz}
	if p, read := g.plates[key]; read {
		return p, nil
	}
	name := fmt.Sprintf("places/continents/%s/plates/%d_%d.plate", g.continent, px, pz)
	ground, err := g.file(name)
	if err != nil {
		return nil, err
	}
	placedName := fmt.Sprintf("places/continents/%s/placed/%d_%d.json", g.continent, px, pz)
	placed, err := g.file(placedName)
	if err != nil {
		return nil, err
	}
	var p *plate
	if ground != nil || placed != nil {
		p = &plate{tiles: map[int]*tile{}, pressed: map[int]pressedTile{}, filled: map[int][]thing{}}
	}
	if ground != nil {
		if p.tiles, err = readPlate(ground, px, pz); err != nil {
			return nil, fmt.Errorf("worlds: %s: %w", name, err)
		}
	}
	if placed != nil {
		if p.slabs, p.objects, err = readPlaced(placed); err != nil {
			return nil, fmt.Errorf("worlds: %s: %w", placedName, err)
		}
	}
	g.plates[key] = p
	return p, nil
}

// file is one of the world's files, or nil where it hasn't got it.
func (g *Ground) file(name string) ([]byte, error) {
	z, err := zip.OpenReader(g.path)
	if err != nil {
		return nil, err
	}
	defer z.Close()
	for _, f := range z.File {
		if f.Name != g.prefix+name {
			continue
		}
		r, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return io.ReadAll(r)
	}
	return nil, nil
}

// readPlaced reads a placed file's slabs and objects (docs/formats/placed.md). An object without
// its footprint and height kept takes its kind's, for a built-in kind; other kinds stand in no
// one's way.
func readPlaced(data []byte) ([]*Slab, []thing, error) {
	var file struct {
		Objects []struct {
			Type      string     `json:"type"`
			At        [2]float64 `json:"at"`
			Y         *float64   `json:"y"`
			Yaw       float64    `json:"yaw"`
			Scale     float64    `json:"scale"`
			Footprint *footprint `json:"footprint"`
			Height    *float64   `json:"height"`
		} `json:"objects"`
		Slabs []json.RawMessage `json:"slabs"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		return nil, nil, err
	}
	var slabs []*Slab
	for _, raw := range file.Slabs {
		s, err := readSlab(string(raw))
		if err != nil {
			return nil, nil, err
		}
		slabs = append(slabs, s)
	}
	var objects []thing
	for _, o := range file.Objects {
		t := thing{Type: o.Type, X: o.At[0], Z: o.At[1], Yaw: o.Yaw, Y: math.NaN()}
		if o.Y != nil {
			t.Y = *o.Y
		}
		if o.Footprint != nil && o.Height != nil {
			t.Footprint, t.Height = *o.Footprint, *o.Height
		} else if spec, ok := objectTypes[o.Type]; ok {
			t.Footprint, t.Height = spec.footprint.scaled(o.Scale), spec.height*o.Scale
		} else {
			continue
		}
		objects = append(objects, t)
	}
	return slabs, objects, nil
}

func floorDiv(a, b int) int {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}
