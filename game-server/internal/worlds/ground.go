package worlds

import (
	"archive/zip"
	"bufio"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
	"sync"
)

// The ground: a continent's heights and water, read from its surface plates (docs/formats/plates.md),
// and sampled as the client's walker samples them (client/src/editor/walker.js groundAt).

const (
	cellFt    = TileFt / tileCells
	tileCells = 64 // cells a tile side

	plateFt = 16 * TileFt
)

// Sample is the ground at a point.
type Sample struct {
	Ground float64 // feet, smoothly between cell centers
	Water  float64 // the water's surface over the cell, or NaN
	// Footholds are the heights of slab faces there gentle enough to stand on (Slab.Footholds).
	Footholds []float64
}

// MaxClimb is the rise over run of the steepest ground or slab a character walks up, as
// client/src/editor/walker.js has it.
const MaxClimb = 1.2

// Ground reads one continent's ground, a plate at a time as it's needed, and keeps what it's read.
type Ground struct {
	path, prefix, continent string // the world's zip, its top directory
	mu                      sync.Mutex
	plates                  map[[2]int]*plate // nil for a plate the world doesn't have
}

type plate struct {
	tiles map[[2]int]*tileGround
	slabs []*Slab
}

type tileGround struct {
	height, water []float32 // tileCells × tileCells, row by row; water NaN where there's none
}

// Ground is the ground of one of the world's continents, or nil for a world not read from a zip.
func (w *World) Ground(continent string) *Ground {
	if w.path == "" {
		return nil
	}
	return &Ground{path: w.path, prefix: w.prefix, continent: continent, plates: map[[2]int]*plate{}}
}

// At samples the ground at continent feet (x, z). ok is false where the continent has no tile,
// which the client doesn't let a character walk onto.
func (g *Ground) At(x, z float64) (s Sample, ok bool, err error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	cellAt := func(ci, cj int) (*tileGround, int, error) {
		tx, tz := floorDiv(ci, tileCells), floorDiv(cj, tileCells)
		p, err := g.plate(floorDiv(tx, 16), floorDiv(tz, 16))
		if err != nil || p == nil {
			return nil, 0, err
		}
		t := p.tiles[[2]int{tx, tz}]
		if t == nil {
			return nil, 0, nil
		}
		return t, (cj-tz*tileCells)*tileCells + (ci - tx*tileCells), nil
	}
	height := func(ci, cj int) (float64, bool, error) {
		t, k, err := cellAt(ci, cj)
		if t == nil {
			return 0, false, err
		}
		return float64(t.height[k]), true, nil
	}

	u, v := x/cellFt-0.5, z/cellFt-0.5
	i, j := int(math.Floor(u)), int(math.Floor(v))
	var corners [4]float64
	all := true
	for n, c := range [4][2]int{{i, j}, {i + 1, j}, {i, j + 1}, {i + 1, j + 1}} {
		h, found, err := height(c[0], c[1])
		if err != nil {
			return s, false, err
		}
		corners[n], all = h, all && found
	}
	if all {
		fu, fv := u-float64(i), v-float64(j)
		top := corners[0] + (corners[1]-corners[0])*fu
		bottom := corners[2] + (corners[3]-corners[2])*fu
		s.Ground = top + (bottom-top)*fv
	} else if s.Ground, ok, err = height(int(math.Floor(u+0.5)), int(math.Floor(v+0.5))); !ok {
		return s, false, err
	}

	t, k, err := cellAt(int(math.Floor(x/cellFt)), int(math.Floor(z/cellFt)))
	if t == nil {
		return s, false, err
	}
	s.Water = float64(t.water[k])
	slabs, err := g.slabsNear(x, z, 0)
	for _, slab := range slabs {
		s.Footholds = append(s.Footholds, slab.Footholds(x, z, MaxClimb)...)
	}
	return s, err == nil, err
}

// Enters is whether the straight move from a to b (continent feet, the feet's height) runs into a
// slab at a character's body height, as client/src/editor/walker.js stops it: from a step over
// its feet up to its eyes. A slab it starts in doesn't stop it moving.
func (g *Ground) Enters(a, b [3]float64) (bool, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	reach := math.Hypot(b[0]-a[0], b[2]-a[2])
	slabs, err := g.slabsNear((a[0]+b[0])/2, (a[2]+b[2])/2, reach/2)
	if err != nil {
		return false, err
	}
	for _, slab := range slabs {
		for _, up := range bodyHeights {
			if slab.Enters([3]float64{a[0], a[1] + up, a[2]}, [3]float64{b[0], b[1] + up, b[2]}) {
				return true, nil
			}
		}
	}
	return false, nil
}

// bodyHeights are the heights over the feet a move is checked against slabs at: over a step, up
// to the eyes.
var bodyHeights = []float64{2, 3.5, 5}

// slabsNear are the slabs whose corners come within `by` feet of (x, z) across the ground, from
// its plate and those beside it. The lock is held.
func (g *Ground) slabsNear(x, z, by float64) ([]*Slab, error) {
	px, pz := int(math.Floor(x/plateFt)), int(math.Floor(z/plateFt))
	edge := slabReachFt*2 + by
	var out []*Slab
	for dz := -1; dz <= 1; dz++ {
		for dx := -1; dx <= 1; dx++ {
			if (dx < 0 && x-float64(px)*plateFt > edge) || (dx > 0 && float64(px+1)*plateFt-x > edge) ||
				(dz < 0 && z-float64(pz)*plateFt > edge) || (dz > 0 && float64(pz+1)*plateFt-z > edge) {
				continue
			}
			p, err := g.plate(px+dx, pz+dz)
			if err != nil {
				return nil, err
			}
			if p == nil {
				continue
			}
			for _, slab := range p.slabs {
				if slab.near(x, z, by) {
					out = append(out, slab)
				}
			}
		}
	}
	return out, nil
}

// plate reads a plate the first time it's asked for. The lock is held.
func (g *Ground) plate(px, pz int) (*plate, error) {
	key := [2]int{px, pz}
	if p, read := g.plates[key]; read {
		return p, nil
	}
	z, err := zip.OpenReader(g.path)
	if err != nil {
		return nil, err
	}
	defer z.Close()
	name := fmt.Sprintf("%splaces/continents/%s/plates/surface/%d_%d.plate", g.prefix, g.continent, px, pz)
	var p *plate
	for _, f := range z.File {
		if f.Name != name {
			continue
		}
		r, err := f.Open()
		if err != nil {
			return nil, err
		}
		p, err = readPlate(r)
		r.Close()
		if err != nil {
			return nil, fmt.Errorf("worlds: %s: %w", name, err)
		}
	}
	g.plates[key] = p
	return p, nil
}

// readPlate reads the height and water layers of a plate's tiles, and its slabs.
func readPlate(r io.Reader) (*plate, error) {
	p := &plate{tiles: map[[2]int]*tileGround{}}
	var tile *tileGround
	var cells int
	lines := bufio.NewScanner(r)
	lines.Buffer(make([]byte, 1<<20), 1<<20)
	next := func() (string, bool) {
		if !lines.Scan() {
			return "", false
		}
		return lines.Text(), true
	}
	for line, more := next(); more; line, more = next() {
		word, rest, _ := strings.Cut(line, " ")
		switch word {
		case "tile":
			f := strings.Fields(rest)
			if len(f) != 2 {
				return nil, fmt.Errorf("bad tile line %q", line)
			}
			tx, tz, err := pair(f[0])
			if err != nil {
				return nil, err
			}
			if cells, err = strconv.Atoi(f[1]); err != nil || cells != tileCells {
				return nil, fmt.Errorf("tile %d,%d has %q cells, not %d", tx, tz, f[1], tileCells)
			}
			tile = &tileGround{}
			p.tiles[[2]int{tx, tz}] = tile
		case "layer":
			name, all, uniform := strings.Cut(rest, " =")
			var values []float32
			if name == "height" || name == "water" {
				values = make([]float32, cells*cells)
			}
			if uniform {
				if values != nil {
					v, err := level(all)
					if err != nil {
						return nil, err
					}
					for k := range values {
						values[k] = v
					}
				}
			} else {
				for j := 0; j < cells; j++ {
					row, ok := next()
					if !ok {
						return nil, fmt.Errorf("layer %s ends early", name)
					}
					if values == nil {
						continue
					}
					if len(row) != cells*3 {
						return nil, fmt.Errorf("layer %s row %d is %d long", name, j, len(row))
					}
					for i := 0; i < cells; i++ {
						v, err := level(row[i*3 : i*3+3])
						if err != nil {
							return nil, err
						}
						values[j*cells+i] = v
					}
				}
			}
			if tile != nil && name == "height" {
				tile.height = values
			} else if tile != nil && name == "water" {
				tile.water = values
			}
		case "slab":
			slab, err := readSlab(rest)
			if err != nil {
				return nil, fmt.Errorf("bad slab line %q: %w", line, err)
			}
			p.slabs = append(p.slabs, slab)
		}
	}
	if err := lines.Err(); err != nil {
		return nil, err
	}
	for at, t := range p.tiles {
		if t.height == nil {
			return nil, fmt.Errorf("tile %d,%d has no height layer", at[0], at[1])
		}
		if t.water == nil {
			t.water = make([]float32, len(t.height))
			for k := range t.water {
				t.water[k] = float32(math.NaN())
			}
		}
	}
	return p, nil
}

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"

// decode reads a value in the plates' 64-symbol alphabet.
func decode(text string) (int, error) {
	n := 0
	for _, c := range text {
		d := strings.IndexRune(alphabet, c)
		if d < 0 {
			return 0, fmt.Errorf("bad value %q", text)
		}
		n = n*64 + d
	}
	return n, nil
}

// level reads a height or water value: quarter feet above -256 ft, or ~~~ for none.
func level(text string) (float32, error) {
	if text == "~~~" {
		return float32(math.NaN()), nil
	}
	if len(text) != 3 {
		return 0, fmt.Errorf("bad level %q", text)
	}
	n, err := decode(text)
	return float32(n)/4 - 256, err
}

func pair(text string) (int, int, error) {
	a, b, ok := strings.Cut(text, ",")
	x, err1 := strconv.Atoi(a)
	z, err2 := strconv.Atoi(b)
	if !ok || err1 != nil || err2 != nil {
		return 0, 0, fmt.Errorf("bad pair %q", text)
	}
	return x, z, nil
}

func floorDiv(a, b int) int {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}
