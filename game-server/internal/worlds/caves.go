package worlds

import (
	"cmp"
	"fmt"
	"math"
	"slices"
	"strings"
)

// Caves files (docs/formats/caves.md, client/src/v2/caves.js): the air a plate's caves open in
// its 2 ft columns, as spans from a floor up to a ceiling. A character stands on a cave's floor,
// smoothed as /create smooths it, and can't walk into its rock.

const (
	voxelFt       = 2.0
	tileColumns   = int(TileFt / voxelFt) // 128
	caveColumns   = tileColumns * tileColumns
	cavesVersion  = "2"
	caveOffset    = 32768 // added to heights written absolutely, in quarter feet
	c2Most        = 31    // the most spans a column has in c2; digits over it are runs of empty columns
	smoothColumns = 2     // how far round a floor its smoothing reaches
)

// span is a column's air from its floor up to its ceiling, in feet.
type span struct{ floor, ceiling float64 }

// caves is a plate's caves: each tile's columns, by its index in the plate.
type caves map[int][][]span

// readCaves reads a caves file. Files from before networks, and the gzipped binary files before
// them, have no caves.
func readCaves(data []byte) (caves, error) {
	out := caves{}
	if len(data) >= 2 && data[0] == 0x1f && data[1] == 0x8b {
		return out, nil
	}
	lines := strings.Split(string(data), "\n")
	head := strings.Fields(lines[0])
	if len(head) < 2 || head[0] != "caves" {
		return nil, fmt.Errorf("not a caves file")
	}
	if head[1] != cavesVersion {
		if head[1] == "1" {
			return out, nil
		}
		return nil, fmt.Errorf("caves file version %s isn't known", head[1])
	}
	for k := 1; k < len(lines); k++ {
		f := strings.Fields(lines[k])
		if len(f) < 2 || f[0] != "tile" {
			continue
		}
		var index int
		if _, err := fmt.Sscan(f[1], &index); err != nil {
			return nil, fmt.Errorf("tile %q: %w", f[1], err)
		}
		k++
		if k >= len(lines) {
			return nil, fmt.Errorf("tile %d has no cells", index)
		}
		columns, err := readCaveCells(lines[k])
		if err != nil {
			return nil, fmt.Errorf("tile %d: %w", index, err)
		}
		into, ok := out[index]
		if !ok {
			out[index] = columns
			continue
		}
		// Another network's spans in the same tile.
		for c, column := range columns {
			if len(column) == 0 {
				continue
			}
			into[c] = append(into[c], column...)
			slices.SortFunc(into[c], func(a, b span) int { return cmp.Compare(a.floor, b.floor) })
		}
	}
	return out, nil
}

// readCaveCells reads a tile's columns from its cells' line: c1, c2 or c3, zipped or not.
func readCaveCells(line string) ([][]span, error) {
	tag, text, ok := strings.Cut(line, " ")
	if !ok {
		return nil, fmt.Errorf("cells line has no form")
	}
	if strings.HasSuffix(tag, "z") {
		zipped, err := digitsToBytes(text)
		if err != nil {
			return nil, err
		}
		raw, err := unzstd.DecodeAll(zipped, nil)
		if err != nil {
			return nil, err
		}
		tag, text = strings.TrimSuffix(tag, "z"), string(raw)
	}
	columns := make([][]span, caveColumns)
	read := func(at, startDigits, base int) (span, error) {
		start, err := readDigits(text, at+3, startDigits)
		if err != nil {
			return span{}, err
		}
		length, err := readDigits(text, at+3+startDigits, 2)
		if err != nil {
			return span{}, err
		}
		floor := float64(start+base) / 4
		return span{floor, floor + float64(length)/4}, nil
	}
	switch tag {
	case "c1":
		n, err := readDigits(text, 0, 2)
		if err != nil {
			return nil, err
		}
		for at := 3; n > 0; n, at = n-1, at+15 {
			c, err := readDigits(text, at, 3)
			if err != nil {
				return nil, err
			}
			if c >= caveColumns {
				return nil, fmt.Errorf("column %d is past the tile", c)
			}
			s, err := read(at+3, 6, -caveOffset)
			if err != nil {
				return nil, err
			}
			columns[c] = append(columns[c], s)
		}
		return columns, nil
	case "c2", "c3":
	default:
		return nil, fmt.Errorf("caves cells form %q isn't known", tag)
	}
	c2 := tag == "c2"
	base, at := -caveOffset, 0
	if c2 {
		b, err := readDigits(text, 0, 3)
		if err != nil {
			return nil, err
		}
		base, at = b-caveOffset, 4
	}
	counts := make([]int, 0, caveColumns)
	for len(counts) < caveColumns {
		d, err := readDigits(text, at, 1)
		if err != nil {
			return nil, err
		}
		at++
		if c2 && d > c2Most {
			for r := d - 30; r > 0; r-- {
				counts = append(counts, 0)
			}
		} else {
			counts = append(counts, d)
		}
	}
	at++
	size, startDigits := 11, 6
	if c2 {
		size, startDigits = 7, 2
	}
	for c, count := range counts[:caveColumns] {
		for n := 0; n < count; n, at = n+1, at+size {
			s, err := read(at, startDigits, base)
			if err != nil {
				return nil, err
			}
			columns[c] = append(columns[c], s)
		}
	}
	return columns, nil
}

// cavesOf reads plate (px, pz)'s caves file the first time it's asked for, or nil where it has
// none. The lock is held.
func (g *Ground) cavesOf(px, pz int) (caves, error) {
	key := [2]int{px, pz}
	if c, read := g.caves[key]; read {
		return c, nil
	}
	name := fmt.Sprintf("places/continents/%s/caves/%d_%d.caves", g.continent, px, pz)
	data, err := g.file(name)
	if err != nil {
		return nil, err
	}
	var c caves
	if data != nil {
		if c, err = readCaves(data); err != nil {
			return nil, fmt.Errorf("worlds: %s: %w", name, err)
		}
	}
	g.caves[key] = c
	return c, nil
}

// spans is continent column (ci, cj)'s air, lowest first. The lock is held.
func (g *Ground) spans(ci, cj int) ([]span, error) {
	tx, tz := floorDiv(ci, tileColumns), floorDiv(cj, tileColumns)
	px, pz := floorDiv(tx, plateTiles), floorDiv(tz, plateTiles)
	c, err := g.cavesOf(px, pz)
	if err != nil || c == nil {
		return nil, err
	}
	columns := c[(tz-pz*plateTiles)*plateTiles+tx-px*plateTiles]
	if columns == nil {
		return nil, nil
	}
	return columns[(cj-tz*tileColumns)*tileColumns+ci-tx*tileColumns], nil
}

// joinedFloor is the span in `spans` whose floor is within `reach` of s's and whose air overlaps
// it, or false.
func joinedFloor(spans []span, s span, reach float64) (span, bool) {
	for _, t := range spans {
		if math.Abs(t.floor-s.floor) <= reach && t.floor < s.ceiling && t.ceiling > s.floor {
			return t, true
		}
	}
	return span{}, false
}

// smoothFloor is span s's floor in column (ci, cj), smoothed: the mean of the floors joined to it
// round it, kept within a voxel of its own. The lock is held.
func (g *Ground) smoothFloor(ci, cj int, s span) (float64, error) {
	sum, n := 0.0, 0.0
	for dj := -smoothColumns; dj <= smoothColumns; dj++ {
		for di := -smoothColumns; di <= smoothColumns; di++ {
			t, ok := s, true
			if di != 0 || dj != 0 {
				spans, err := g.spans(ci+di, cj+dj)
				if err != nil {
					return 0, err
				}
				t, ok = joinedFloor(spans, s, voxelFt*float64(max(abs(di), abs(dj))))
			}
			if ok {
				sum, n = sum+t.floor, n+1
			}
		}
	}
	return math.Max(s.floor-voxelFt, math.Min(s.floor+voxelFt, sum/n)), nil
}

// floorAt is span s's smooth floor at continent feet (x, z), between the smoothed floors at the
// middles of the four columns round it. The lock is held.
func (g *Ground) floorAt(x, z float64, s span) (float64, error) {
	ci, cj := int(math.Floor(x/voxelFt)), int(math.Floor(z/voxelFt))
	own, err := g.smoothFloor(ci, cj, s)
	if err != nil {
		return 0, err
	}
	u, v := x/voxelFt-0.5, z/voxelFt-0.5
	i0, j0 := int(math.Floor(u)), int(math.Floor(v))
	at := func(i, j int) (float64, error) {
		if i == ci && j == cj {
			return own, nil
		}
		spans, err := g.spans(i, j)
		if err != nil {
			return 0, err
		}
		if t, ok := joinedFloor(spans, s, voxelFt); ok {
			return g.smoothFloor(i, j, t)
		}
		return own, nil
	}
	var h [4]float64
	for k, ij := range [4][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}} {
		if h[k], err = at(i0+ij[0], j0+ij[1]); err != nil {
			return 0, err
		}
	}
	fu, fv := u-float64(i0), v-float64(j0)
	return (h[0]*(1-fu)+h[1]*fu)*(1-fv) + (h[2]*(1-fu)+h[3]*fu)*fv, nil
}

// caveFloors are the smoothed floors of the caves under the ground at (x, z), ground `ground`
// there, and whether a cave opens the ground itself there, at a mouth. The lock is held.
func (g *Ground) caveFloors(x, z, ground float64) (floors []float64, open bool, err error) {
	spans, err := g.spans(int(math.Floor(x/voxelFt)), int(math.Floor(z/voxelFt)))
	if err != nil {
		return nil, false, err
	}
	for _, s := range spans {
		if s.floor < ground && ground < s.ceiling {
			open = true
		}
		if s.floor <= ground {
			f, err := g.floorAt(x, z, s)
			if err != nil {
				return nil, false, err
			}
			floors = append(floors, f)
		}
	}
	return floors, open, nil
}

// inCaveRock is whether (x, y, z) is in a cave's rock: under the ground there, near a cave, and
// in none of its air. Away from caves the ground's rock isn't a cave's. The lock is held.
func (g *Ground) inCaveRock(x, y, z, ground float64) (bool, error) {
	spans, err := g.spans(int(math.Floor(x/voxelFt)), int(math.Floor(z/voxelFt)))
	if err != nil || y >= ground {
		return false, err
	}
	near, err := g.nearCaves(x, z)
	if err != nil || !near {
		return false, err
	}
	for _, s := range spans {
		if s.floor <= y && y <= s.ceiling {
			return false, nil
		}
	}
	return true, nil
}

// nearCaves is whether the tile at (x, z), or one beside it, has caves, as /create has it. The
// lock is held.
func (g *Ground) nearCaves(x, z float64) (bool, error) {
	tx, tz := int(math.Floor(x/TileFt)), int(math.Floor(z/TileFt))
	for dz := -1; dz <= 1; dz++ {
		for dx := -1; dx <= 1; dx++ {
			px, pz := floorDiv(tx+dx, plateTiles), floorDiv(tz+dz, plateTiles)
			c, err := g.cavesOf(px, pz)
			if err != nil {
				return false, err
			}
			if c[(tz+dz-pz*plateTiles)*plateTiles+tx+dx-px*plateTiles] != nil {
				return true, nil
			}
		}
	}
	return false, nil
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
