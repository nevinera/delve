package worlds

import "math"

// Level slabs press the ground down where they lie in it (client/src/create/press.js): every
// corner of each cell a slab covers any of is no higher than the slab's bottom, and nothing grows
// in those cells.

const levelFt = 0.01 // how far a slab's top may rise across it and still be level

// press is a level slab's outline from above and its bottom's height.
type press struct {
	outline [][2]float64
	bottom  float64
}

// pressing is what a slab presses, or false for one that isn't level.
func (s *Slab) pressing() (press, bool) {
	lo, hi := math.Inf(1), math.Inf(-1)
	var outline [][2]float64
	for _, p := range s.Outline {
		top := add3(s.At, turnPoint([3]float64{p[0], 0, p[1]}, s.Turn))
		lo, hi = math.Min(lo, top[1]), math.Max(hi, top[1])
		outline = append(outline, [2]float64{top[0], top[2]})
	}
	if hi-lo > levelFt || len(outline) == 0 {
		return press{}, false
	}
	first := add3(s.At, turnPoint([3]float64{s.Outline[0][0], 0, s.Outline[0][1]}, s.Turn))
	bottom := add3(first, turnPoint([3]float64{0, -s.Thickness, 0}, s.Turn))
	return press{outline, bottom[1]}, true
}

// pressesOver is what slabs press on tile (tx, tz) or its edge corners.
func pressesOver(slabs []*Slab, tx, tz int) []press {
	x0, z0 := float64(tx)*TileFt-cellFt, float64(tz)*TileFt-cellFt
	x1, z1 := float64(tx+1)*TileFt+cellFt, float64(tz+1)*TileFt+cellFt
	var out []press
	for _, s := range slabs {
		p, ok := s.pressing()
		if !ok {
			continue
		}
		lx, hx, lz, hz := bounds(p.outline)
		if lx < x1 && hx > x0 && lz < z1 && hz > z0 {
			out = append(out, p)
		}
	}
	return out
}

func bounds(outline [][2]float64) (lx, hx, lz, hz float64) {
	lx, hx, lz, hz = math.Inf(1), math.Inf(-1), math.Inf(1), math.Inf(-1)
	for _, p := range outline {
		lx, hx = math.Min(lx, p[0]), math.Max(hx, p[0])
		lz, hz = math.Min(lz, p[1]), math.Max(hz, p[1])
	}
	return
}

// pressed is tile (tx, tz)'s heights pressed down by `presses` (the same slice where nothing
// presses it), and the cells they cover.
func pressed(heights []float32, presses []press, tx, tz int) ([]float32, map[int]bool) {
	corners := map[int]float64{}
	cells := map[int]bool{}
	x0, z0 := float64(tx)*TileFt, float64(tz)*TileFt
	for _, p := range presses {
		lx, hx, lz, hz := bounds(p.outline)
		i0, i1 := max(-1, int(math.Floor((lx-x0)/cellFt))), min(tileCells, int(math.Floor((hx-x0)/cellFt)))
		j0, j1 := max(-1, int(math.Floor((lz-z0)/cellFt))), min(tileCells, int(math.Floor((hz-z0)/cellFt)))
		for j := j0; j <= j1; j++ {
			for i := i0; i <= i1; i++ {
				if !overlaps(p.outline, x0+float64(i)*cellFt, z0+float64(j)*cellFt) {
					continue
				}
				if i >= 0 && j >= 0 && i < tileCells && j < tileCells {
					cells[j*tileCells+i] = true
				}
				for _, c := range [4][2]int{{i, j}, {i + 1, j}, {i, j + 1}, {i + 1, j + 1}} {
					if c[0] < 0 || c[1] < 0 || c[0] >= cellCorner || c[1] >= cellCorner {
						continue
					}
					k := c[1]*cellCorner + c[0]
					if h, ok := corners[k]; !ok || p.bottom < h {
						corners[k] = p.bottom
					}
				}
			}
		}
	}
	if len(corners) == 0 {
		return heights, cells
	}
	out := append([]float32(nil), heights...)
	for k, h := range corners {
		if float64(out[k]) > h {
			out[k] = float32(h)
		}
	}
	return out, cells
}

// overlaps is whether the polygon covers any of the cell with its northwest corner at (x, z),
// beyond touching its edge.
func overlaps(polygon [][2]float64, x, z float64) bool {
	square := [4][2]float64{{x, z}, {x + cellFt, z}, {x + cellFt, z + cellFt}, {x, z + cellFt}}
	if inPolygon(polygon, [2]float64{x + cellFt/2, z + cellFt/2}) {
		return true
	}
	for _, p := range polygon {
		if p[0] > x && p[0] < x+cellFt && p[1] > z && p[1] < z+cellFt {
			return true
		}
	}
	for n := range polygon {
		p, q := polygon[n], polygon[(n+1)%len(polygon)]
		for m := 0; m < 4; m++ {
			if crosses(p, q, square[m], square[(m+1)%4]) {
				return true
			}
		}
	}
	return false
}

// crosses is whether segments pq and rs cross, not counting where they only touch.
func crosses(p, q, r, s [2]float64) bool {
	side := func(a, b, c [2]float64) float64 {
		v := (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0])
		switch {
		case v > 0:
			return 1
		case v < 0:
			return -1
		}
		return 0
	}
	return side(p, q, r)*side(p, q, s) < 0 && side(r, s, p)*side(r, s, q) < 0
}
