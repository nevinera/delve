package worlds

import (
	"archive/zip"
	"bufio"
	"encoding/json"
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
	// structureMargin is how far past a structure's reach its floors and walls might hold a
	// character.
	structureMargin = 8.0
)

// Sample is the ground at a point.
type Sample struct {
	Ground float64 // feet, smoothly between cell centers
	Water  float64 // the water's surface over the cell, or NaN
	// Structure is whether a structure stands near enough that its floors, stairs and walls,
	// rather than the ground, may hold the character.
	Structure bool
}

// Ground reads one continent's ground, a plate at a time as it's needed, and keeps what it's read.
type Ground struct {
	path, prefix, continent string // the world's zip, its top directory
	mu                      sync.Mutex
	plates                  map[[2]int]*plate // nil for a plate the world doesn't have
}

type plate struct {
	tiles      map[[2]int]*tileGround
	structures []structure
}

type tileGround struct {
	height, water []float32 // tileCells × tileCells, row by row; water NaN where there's none
}

type structure struct{ x, z, reach float64 }

// objectKind is a line of a plate's object table, as far as the ground needs it.
type objectKind struct {
	structure bool
	reach     float64
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
	s.Structure, err = g.nearStructure(x, z)
	return s, err == nil, err
}

// nearStructure is whether a structure reaches near (x, z), in its plate or the ones beside it.
func (g *Ground) nearStructure(x, z float64) (bool, error) {
	px, pz := int(math.Floor(x/plateFt)), int(math.Floor(z/plateFt))
	for dz := -1; dz <= 1; dz++ {
		for dx := -1; dx <= 1; dx++ {
			// A plate beside this one matters only near the edge they share.
			if (dx < 0 && x-float64(px)*plateFt > 256) || (dx > 0 && float64(px+1)*plateFt-x > 256) ||
				(dz < 0 && z-float64(pz)*plateFt > 256) || (dz > 0 && float64(pz+1)*plateFt-z > 256) {
				continue
			}
			p, err := g.plate(px+dx, pz+dz)
			if err != nil {
				return false, err
			}
			if p == nil {
				continue
			}
			for _, st := range p.structures {
				if math.Hypot(x-st.x, z-st.z) <= st.reach+structureMargin {
					return true, nil
				}
			}
		}
	}
	return false, nil
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

// readPlate reads the height and water layers of a plate's tiles, and where its structures stand.
func readPlate(r io.Reader) (*plate, error) {
	p := &plate{tiles: map[[2]int]*tileGround{}}
	var kinds []objectKind
	var origin [2]float64
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
		case "plate":
			f := strings.Fields(rest)
			if len(f) < 2 {
				return nil, fmt.Errorf("bad plate line %q", line)
			}
			x, z, err := pair(f[1])
			if err != nil {
				return nil, err
			}
			origin = [2]float64{float64(x) * plateFt, float64(z) * plateFt}
		case "object":
			// object <id> <footprint> <height> <kind>, or in version 1 plates object <id> <kind>.
			f := strings.Fields(rest)
			k := objectKind{}
			if len(f) >= 4 {
				k.structure = strings.HasPrefix(f[3], "structure:")
				if open, ok := strings.CutPrefix(f[1], "open:"); ok {
					k.reach, _ = strconv.ParseFloat(open, 64)
				}
			}
			kinds = append(kinds, k)
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
		case "place":
			st, ok, err := placed(rest, kinds, origin)
			if err != nil {
				return nil, err
			}
			if ok {
				p.structures = append(p.structures, st)
			}
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

// placed reads a place line, for a structure: place <id> <x z yaw scale> [<colors>] [<json>].
// Its position is x and z within the plate in 1/32 ft (3 symbols each), then yaw and scale; JSON
// at the end holds `at` when the object lies outside the plate.
func placed(rest string, kinds []objectKind, origin [2]float64) (structure, bool, error) {
	text, extra, _ := strings.Cut(rest, " {")
	f := strings.Fields(text)
	if len(f) < 2 || len(f[1]) != 10 {
		return structure{}, false, fmt.Errorf("bad place line %q", rest)
	}
	id, err := decode(f[0])
	if err != nil || id >= len(kinds) {
		return structure{}, false, fmt.Errorf("place line %q names no object", rest)
	}
	if !kinds[id].structure {
		return structure{}, false, nil
	}
	x, err1 := decode(f[1][0:3])
	z, err2 := decode(f[1][3:6])
	if err1 != nil || err2 != nil {
		return structure{}, false, fmt.Errorf("bad place line %q", rest)
	}
	st := structure{x: origin[0] + float64(x)/32, z: origin[1] + float64(z)/32, reach: kinds[id].reach}
	if extra != "" {
		var fields struct{ At []float64 }
		if err := json.Unmarshal([]byte("{"+extra), &fields); err != nil {
			return structure{}, false, fmt.Errorf("place line %q: %w", rest, err)
		}
		if len(fields.At) == 2 {
			st.x, st.z = fields.At[0], fields.At[1]
		}
	}
	return st, true, nil
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
