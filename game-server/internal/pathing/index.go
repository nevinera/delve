package pathing

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// cellGrid is a uniform axis-aligned lattice over some rectangle of the
// map, shared by the barrier index and the navigation grid.
type cellGrid struct {
	minX, minY float64
	cell       float64
	w, h       int
}

func (g cellGrid) clampX(cx int) int { return max(0, min(g.w-1, cx)) }
func (g cellGrid) clampY(cy int) int { return max(0, min(g.h-1, cy)) }

func (g cellGrid) colOf(x float64) int { return g.clampX(int(math.Floor((x - g.minX) / g.cell))) }
func (g cellGrid) rowOf(y float64) int { return g.clampY(int(math.Floor((y - g.minY) / g.cell))) }

func (g cellGrid) centerX(cx int) float64 { return g.minX + (float64(cx)+0.5)*g.cell }
func (g cellGrid) centerY(cy int) float64 { return g.minY + (float64(cy)+0.5)*g.cell }

// forCellsNear calls fn for every cell that could lie within expand of the
// segment (x1,y1)-(x2,y2). It walks row by row and only visits the columns
// the segment actually crosses in that row, so a long diagonal costs
// O(length) rather than O(bounding box area). Cells are conservative (a few
// extra are visited), never missed.
func (g cellGrid) forCellsNear(x1, y1, x2, y2, expand float64, fn func(cx, cy int)) {
	loY, hiY := math.Min(y1, y2)-expand, math.Max(y1, y2)+expand
	for cy := g.rowOf(loY); cy <= g.rowOf(hiY); cy++ {
		rowLo := g.minY + float64(cy)*g.cell - expand
		rowHi := g.minY + float64(cy+1)*g.cell + expand

		xa, xb := x1, x2
		if y1 != y2 {
			t0, t1 := (rowLo-y1)/(y2-y1), (rowHi-y1)/(y2-y1)
			if t0 > t1 {
				t0, t1 = t1, t0
			}
			t0, t1 = math.Max(t0, 0), math.Min(t1, 1)
			if t0 > t1 {
				continue
			}
			xa, xb = x1+t0*(x2-x1), x1+t1*(x2-x1)
		}
		if xa > xb {
			xa, xb = xb, xa
		}
		for cx := g.colOf(xa - expand); cx <= g.colOf(xb+expand); cx++ {
			fn(cx, cy)
		}
	}
}

// barrierIndexCellSize is the barrier index's bucket size in feet: small
// enough that a bucket holds a handful of primitives even in dense maps,
// large enough that a typical unit-radius query touches only a few buckets.
const barrierIndexCellSize = 16.0

// barrierIndex answers the exact-geometry clearance queries this package is
// built on (is this straight line clear for a unit of radius r?) by only
// examining the barrier primitives near the query, rather than every
// barrier on the map. That's what keeps both graph construction and the
// per-tick SegmentClear calls independent of a map's total barrier count.
//
// Immutable after newBarrierIndex, so safe for concurrent reads.
type barrierIndex struct {
	prims   []prim
	grid    cellGrid
	buckets [][]int32 // per cell: indexes into prims
}

func newBarrierIndex(barriers []instanceconfig.Barrier) *barrierIndex {
	idx := &barrierIndex{prims: flatten(barriers)}

	minX, minY, maxX, maxY := 0.0, 0.0, 0.0, 0.0
	for i, p := range idx.prims {
		x0, y0, x1, y1 := p.bounds()
		if i == 0 {
			minX, minY, maxX, maxY = x0, y0, x1, y1
			continue
		}
		minX, minY, maxX, maxY = math.Min(minX, x0), math.Min(minY, y0), math.Max(maxX, x1), math.Max(maxY, y1)
	}
	cell := barrierIndexCellSize
	w := int(math.Ceil((maxX-minX)/cell)) + 1
	h := int(math.Ceil((maxY-minY)/cell)) + 1
	idx.grid = cellGrid{minX: minX, minY: minY, cell: cell, w: w, h: h}
	idx.buckets = make([][]int32, w*h)

	for i, p := range idx.prims {
		if p.circle {
			idx.grid.forCellsNear(p.x1, p.y1, p.x1, p.y1, p.r, func(cx, cy int) {
				idx.buckets[cy*w+cx] = append(idx.buckets[cy*w+cx], int32(i))
			})
			continue
		}
		idx.grid.forCellsNear(p.x1, p.y1, p.x2, p.y2, 0, func(cx, cy int) {
			idx.buckets[cy*w+cx] = append(idx.buckets[cy*w+cx], int32(i))
		})
	}
	return idx
}

// anyNear reports whether test returns true for any primitive registered in
// a cell within expand of the segment. A primitive registered in several
// cells may be tested more than once; that's cheaper than deduplicating.
func (idx *barrierIndex) anyNear(x1, y1, x2, y2, expand float64, test func(p prim) bool) bool {
	if len(idx.prims) == 0 {
		return false
	}
	found := false
	idx.grid.forCellsNear(x1, y1, x2, y2, expand, func(cx, cy int) {
		if found {
			return
		}
		for _, pi := range idx.buckets[cy*idx.grid.w+cx] {
			if test(idx.prims[pi]) {
				found = true
				return
			}
		}
	})
	return found
}

// segmentBlocked reports whether a unit of the given radius can travel in a
// straight line from (x1,y1) to (x2,y2) without its body coming within
// radius of any barrier. Strict: use it between two already-validated
// positions (graph cells); use travelBlocked from a live unit position.
func (idx *barrierIndex) segmentBlocked(x1, y1, x2, y2, radius float64) bool {
	return idx.anyNear(x1, y1, x2, y2, radius, func(p prim) bool {
		return p.blocked(x1, y1, x2, y2, radius)
	})
}

// pointBlocked reports whether a unit of the given radius standing centered
// at (x,y) would overlap any barrier.
func (idx *barrierIndex) pointBlocked(x, y, radius float64) bool {
	return idx.segmentBlocked(x, y, x, y, radius)
}

// travelBlocked is like segmentBlocked, but for checking travel FROM a live,
// arbitrary point (x1,y1) - a unit's actual current position, not a
// precomputed graph position - rather than between two validated ones.
//
// A real unit's position is a given fact, not a choice: collision
// resolution rests it at its own true radius from a wall, which is less
// than this package's padded clearance radius (see cornerClearancePadding)
// by design. Using the strict check here would mean any unit resting
// against a wall - a completely normal thing - reads every single
// direction as blocked (the segment's minimum distance to that wall is
// already close at t=0, regardless of which way the segment points),
// leaving it unable to ever plan a route away again.
//
// So for each barrier, the required clearance is capped at however close
// (x1,y1) already legitimately is to it: the barrier only blocks the
// segment if some point along it comes CLOSER than the start already is,
// never merely for matching the start's own existing distance. For a start
// point that already has full clearance from every barrier (the common
// case, and always true for a validated graph cell) this is identical to
// segmentBlocked - the leniency only ever kicks in exactly where it's
// needed.
func (idx *barrierIndex) travelBlocked(x1, y1, x2, y2, radius float64) bool {
	return idx.anyNear(x1, y1, x2, y2, radius, func(p prim) bool {
		return p.travelBlocked(x1, y1, x2, y2, radius)
	})
}
