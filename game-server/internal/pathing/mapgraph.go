// Package pathing plans short-range paths around a map's barriers, for units
// that need to route around obstacles rather than walking straight at a
// target. It depends only on instanceconfig (barrier/map geometry) and has
// no knowledge of the tick loop, unit state, or anything else engine-side,
// so it can be built and tested in isolation and simply called into at
// runtime.
//
// Design: each (map, agent-size bucket) gets a navigation grid - a uniform
// lattice of cells, each marked blocked if a unit of that size centered on it
// would overlap a barrier - plus a connected-component label per free cell.
// A query is A* over that grid followed by "string pulling" against the
// exact barrier geometry, which straightens the cell-by-cell route into the
// few waypoints a unit actually needs.
//
// Cost is what motivated this shape. Building marks blocked cells by
// stamping each barrier segment into the cells near it (linear in barrier
// count, independent of how many barriers each other one could see), and the
// exact-geometry checks go through a spatial index (see barrierIndex), so
// neither construction nor a query ever looks at the whole barrier set. The
// previous all-pairs visibility graph paid cubic time in barrier vertices.
package pathing

import (
	"fmt"
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// cornerClearancePadding is added to every agent radius before it's used
// for anything in this package - grid blocking and every clearance check
// alike. Grid cells and smoothed waypoints sit deliberately right at a
// barrier's true clearance boundary, which leaves zero margin for cell
// quantization and any floating-point slop in the intersection math; a unit
// could end up nominally "clear" by a hair and still visually clip a corner.
// This trades a small, fixed amount of path optimality for not being that
// exact right at the one place (barrier corners) where exactness has no room
// for error.
const cornerClearancePadding = 0.25

// maxGridCells bounds a single grid's size. A map big enough to exceed it at
// the natural cell size gets coarser cells instead, so an unusually large map
// costs precision (including the quantization guarantee in chooseGrid)
// rather than memory or build time.
const maxGridCells = 2_000_000

// maxAttachCandidates is how many nearby free cells FindPath will consider
// for each endpoint before giving up on it.
const maxAttachCandidates = 3

// Point is a location in map feet-coordinates.
type Point struct {
	X, Y float64
}

// bitGrid is one bit per grid cell.
type bitGrid []uint64

func newBitGrid(cells int) bitGrid { return make(bitGrid, (cells+63)/64) }

func (b bitGrid) get(i int) bool { return b[i>>6]&(1<<(uint(i)&63)) != 0 }
func (b bitGrid) set(i int)      { b[i>>6] |= 1 << (uint(i) & 63) }

// MapGraph is a precomputed navigation grid for one map, inflated for a
// specific agent radius. It's immutable after Build and safe to query
// concurrently for reads.
type MapGraph struct {
	agentRadius float64
	idx         *barrierIndex
	grid        cellGrid
	blocked     bitGrid
	comp        []uint16 // connected-component id of each free cell; see labelComponents
	anchorCell  []int32  // grid cell of each anchor passed to BuildMapGraph, -1 if unusable
}

// BuildMapGraph precomputes a navigation grid over m's barriers for a unit
// of the given collision radius (plus cornerClearancePadding - see its doc).
// anchors are extra positions that must be routable regardless of barrier
// geometry - map-connection points, for stitching separate maps' graphs
// together. The returned anchorIndex[i] is anchors[i]'s anchor index (for
// anchorDistance/distFromPoint), or -1 if that position was blocked by a
// barrier. Returns an error if the map's geometry contains non-finite
// coordinates.
func BuildMapGraph(m instanceconfig.Map, agentRadius float64, anchors []Point) (*MapGraph, []int, error) {
	if err := validateGeometry(m); err != nil {
		return nil, nil, err
	}
	agentRadius += cornerClearancePadding

	idx := newBarrierIndex(m.Barriers)
	g := &MapGraph{agentRadius: agentRadius, idx: idx}
	g.grid = chooseGrid(m, idx, agentRadius, anchors)
	g.blocked = newBitGrid(g.grid.w * g.grid.h)
	g.markBlocked()
	g.labelComponents()

	anchorIndex := make([]int, len(anchors))
	g.anchorCell = make([]int32, len(anchors))
	for i, a := range anchors {
		g.anchorCell[i] = -1
		anchorIndex[i] = -1
		if idx.pointBlocked(a.X, a.Y, agentRadius) {
			continue
		}
		if cells := g.attach(a.X, a.Y, 1); len(cells) > 0 {
			g.anchorCell[i] = cells[0]
			anchorIndex[i] = i
		}
	}
	return g, anchorIndex, nil
}

func validateGeometry(m instanceconfig.Map) error {
	finite := func(vs ...float64) bool {
		for _, v := range vs {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				return false
			}
		}
		return true
	}
	for i, b := range m.Barriers {
		for _, l := range b.Locations {
			if !finite(l.X, l.Y) {
				return fmt.Errorf("pathing: map %q barrier %d has a non-finite coordinate", m.Identifier, i)
			}
		}
		if b.Location != nil && !finite(b.Location.X, b.Location.Y, b.Radius) {
			return fmt.Errorf("pathing: map %q barrier %d has a non-finite coordinate", m.Identifier, i)
		}
	}
	return nil
}

// chooseGrid sizes the grid to cover the map's declared dimensions, every
// barrier, and every anchor, padded enough that a unit can circle the
// outermost barrier.
//
// Cell size is a precision/cost trade. Cells are about half the agent radius
// (at least 1ft) so a corridor just wide enough for the unit still shows up
// as free cells. But it's also capped so quantization stays inside the
// padding: two adjacent free cell centers each clear a barrier tip by the
// padded radius, yet the segment between them can pass closer to it - by up
// to R - sqrt(R^2 - cell^2/2) for a diagonal step - and that shortfall must
// stay under cornerClearancePadding so a route is still clear at the unit's
// own true radius. That gives cell <= sqrt(R - padding/2).
func chooseGrid(m instanceconfig.Map, idx *barrierIndex, radius float64, anchors []Point) cellGrid {
	minX, minY, maxX, maxY := math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)
	grow := func(x0, y0, x1, y1 float64) {
		minX, minY, maxX, maxY = math.Min(minX, x0), math.Min(minY, y0), math.Max(maxX, x1), math.Max(maxY, y1)
	}
	if m.FeetDimensions.Width > 0 && m.FeetDimensions.Height > 0 {
		grow(0, 0, m.FeetDimensions.Width, m.FeetDimensions.Height)
	}
	for _, p := range idx.prims {
		grow(p.bounds())
	}
	for _, a := range anchors {
		grow(a.X, a.Y, a.X, a.Y)
	}
	if math.IsInf(minX, 1) {
		grow(0, 0, 0, 0)
	}

	pad := 2*radius + 1
	minX, minY, maxX, maxY = minX-pad, minY-pad, maxX+pad, maxY+pad

	cell := math.Max(1, math.Min(radius/2, math.Sqrt(radius-cornerClearancePadding/2)))
	for {
		w := int(math.Ceil((maxX-minX)/cell)) + 1
		h := int(math.Ceil((maxY-minY)/cell)) + 1
		if w*h <= maxGridCells {
			return cellGrid{minX: minX, minY: minY, cell: cell, w: w, h: h}
		}
		cell *= 1.25
	}
}

// markBlocked flags every cell whose center a unit of the agent's radius
// could not stand at. Each barrier primitive is stamped into just the cells
// near it, so this is linear in barrier count.
func (g *MapGraph) markBlocked() {
	w := g.grid.w
	for _, p := range g.idx.prims {
		mark := func(cx, cy int) {
			i := cy*w + cx
			if g.blocked.get(i) {
				return
			}
			x, y := g.grid.centerX(cx), g.grid.centerY(cy)
			if p.blocked(x, y, x, y, g.agentRadius) {
				g.blocked.set(i)
			}
		}
		// A cell's center can be up to a half-cell diagonal from any point
		// in the cell, so expand the search by that much to never miss one.
		reach := g.agentRadius + p.r + g.grid.cell
		g.grid.forCellsNear(p.x1, p.y1, p.x2, p.y2, reach, mark)
	}
}

// noComponent marks a blocked cell in MapGraph.comp; overflowComponent is
// shared by every component past the 65534th (see labelComponents). Real ids
// start at 1.
const (
	noComponent       uint16 = 0
	overflowComponent uint16 = math.MaxUint16
)

// labelComponents assigns each free cell the id of its 8-connected free
// region (using the same no-corner-squeezing rule as search), so a query
// can reject an unreachable goal in O(1) instead of by exhausting the map.
//
// Ids are 16-bit to keep the per-cell cost at two bytes. A map with more
// than 65534 separate regions (pathological) lumps the excess into
// overflowComponent, whose cells are simply never rejected early: the
// component check is only an optimization, and an unreachable goal there
// costs a full search that then correctly returns false.
func (g *MapGraph) labelComponents() {
	w, h := g.grid.w, g.grid.h
	g.comp = make([]uint16, w*h)
	var stack []int32
	next := uint16(1)
	for start := range g.comp {
		if g.blocked.get(start) || g.comp[start] != noComponent {
			continue
		}
		id := next
		g.comp[start] = id
		stack = append(stack[:0], int32(start))
		for len(stack) > 0 {
			ci := int(stack[len(stack)-1])
			stack = stack[:len(stack)-1]
			cx, cy := ci%w, ci/w
			for _, o := range neighborOffsets {
				nx, ny := cx+o[0], cy+o[1]
				if nx < 0 || ny < 0 || nx >= w || ny >= h {
					continue
				}
				ni := ny*w + nx
				if g.blocked.get(ni) || g.comp[ni] != noComponent {
					continue
				}
				if o[0] != 0 && o[1] != 0 && (g.blocked.get(cy*w+nx) || g.blocked.get(ny*w+cx)) {
					continue
				}
				g.comp[ni] = id
				stack = append(stack, int32(ni))
			}
		}
		if next < overflowComponent {
			next++
		}
	}
}

// attach finds up to limit free cells near the live point (x,y), nearest
// first, that (x,y) can travel to directly. (x,y) is a unit's actual
// position or desired destination, not a grid cell, so it may itself sit in
// a blocked cell or closer to a barrier than the padded radius allows;
// travelBlocked's leniency about that is what makes it usable here.
func (g *MapGraph) attach(x, y float64, limit int) []int32 {
	type cand struct {
		cell int32
		d    float64
	}
	var found []cand

	cx0, cy0 := g.grid.colOf(x), g.grid.rowOf(y)
	maxRing := int(math.Ceil(g.agentRadius/g.grid.cell)) + 2
	lastRing := -1
	for ring := 0; ring <= maxRing; ring++ {
		if len(found) >= limit && ring > lastRing+1 {
			break // Chebyshev rings are only approximately distance-ordered; one extra ring covers that
		}
		for cy := cy0 - ring; cy <= cy0+ring; cy++ {
			for cx := cx0 - ring; cx <= cx0+ring; cx++ {
				onRing := cy == cy0-ring || cy == cy0+ring || cx == cx0-ring || cx == cx0+ring
				if !onRing || cx < 0 || cy < 0 || cx >= g.grid.w || cy >= g.grid.h {
					continue
				}
				i := cy*g.grid.w + cx
				if g.blocked.get(i) {
					continue
				}
				px, py := g.grid.centerX(cx), g.grid.centerY(cy)
				if g.idx.travelBlocked(x, y, px, py, g.agentRadius) {
					continue
				}
				found = append(found, cand{int32(i), math.Hypot(px-x, py-y)})
				lastRing = ring
			}
		}
	}

	// Insertion sort by distance; candidate lists are tiny.
	for i := 1; i < len(found); i++ {
		for j := i; j > 0 && found[j-1].d > found[j].d; j-- {
			found[j-1], found[j] = found[j], found[j-1]
		}
	}
	out := make([]int32, 0, min(limit, len(found)))
	for _, c := range found[:min(limit, len(found))] {
		out = append(out, c.cell)
	}
	return out
}

// FindPath returns a list of waypoints (not including the start point) to
// travel from (sx,sy) to (tx,ty) without a unit of this graph's agent
// radius overlapping any barrier. If the straight line is already clear,
// the result is just the target point. Returns false if no route exists
// (target unreachable within this map's graph).
//
// (sx,sy) and (tx,ty) are treated leniently if either is already closer to
// a barrier than this graph's agent radius allows (see
// barrierIndex.travelBlocked) - they're a unit's actual position and desired
// destination, not grid cells, and may not themselves satisfy the full
// clearance this package otherwise requires.
func (g *MapGraph) FindPath(sx, sy, tx, ty float64) ([]Point, bool) {
	if !g.idx.travelBlocked(sx, sy, tx, ty, g.agentRadius) {
		return []Point{{X: tx, Y: ty}}, true
	}

	startCells := g.attach(sx, sy, maxAttachCandidates)
	goalCells := g.attach(tx, ty, maxAttachCandidates)
	for _, from := range startCells {
		for _, to := range goalCells {
			cells, _, ok := g.search(from, to)
			if !ok {
				continue
			}
			return g.smooth(sx, sy, tx, ty, cells), true
		}
	}
	return nil, false
}

// smooth turns a cell-by-cell route into a short waypoint list by string
// pulling: from each anchor, jump to the furthest later point on the route
// that's still directly reachable per the exact barrier geometry.
// Reachability is treated as monotone along the route (if the anchor can see
// point k it can see everything before k), which lets a galloping-then-binary
// search find that point in O(log n) exact checks; where the assumption is
// wrong the result is merely a slightly less straight path, still valid
// because consecutive grid cells are always mutually reachable.
func (g *MapGraph) smooth(sx, sy, tx, ty float64, cells []int32) []Point {
	pts := make([]Point, 0, len(cells)+2)
	pts = append(pts, Point{X: sx, Y: sy})
	for _, c := range cells {
		pts = append(pts, Point{X: g.grid.centerX(int(c) % g.grid.w), Y: g.grid.centerY(int(c) / g.grid.w)})
	}
	last := len(pts)
	pts = append(pts, Point{X: tx, Y: ty})

	visible := func(i, j int) bool {
		a, b := pts[i], pts[j]
		switch {
		case i == 0:
			return !g.idx.travelBlocked(a.X, a.Y, b.X, b.Y, g.agentRadius)
		case j == last:
			return !g.idx.travelBlocked(b.X, b.Y, a.X, a.Y, g.agentRadius)
		default:
			return !g.idx.segmentBlocked(a.X, a.Y, b.X, b.Y, g.agentRadius)
		}
	}

	var out []Point
	for i := 0; i < last; {
		best, k := i+1, 1
		for i+k <= last && visible(i, i+k) {
			best = i + k
			k *= 2
		}
		lo, hi := best, min(i+k, last+1)
		for hi-lo > 1 {
			mid := (lo + hi) / 2
			if visible(i, mid) {
				lo = mid
			} else {
				hi = mid
			}
		}
		i = lo
		out = append(out, pts[i])
	}
	return out
}

// SegmentClear reports whether a unit of this graph's agent radius could
// travel in a straight line between the two points without overlapping a
// barrier. Used to sanity-check a cached waypoint is still safely reachable
// from wherever a unit actually ended up (e.g. after being shoved off its
// path by crowd separation), not just from where the path was computed.
// (x1,y1) is treated leniently the same way FindPath's start point is.
func (g *MapGraph) SegmentClear(x1, y1, x2, y2 float64) bool {
	return !g.idx.travelBlocked(x1, y1, x2, y2, g.agentRadius)
}

// anchorDistance returns the walking distance between two anchors (by
// anchor index, as returned from BuildMapGraph). ok is false if they're not
// mutually reachable.
func (g *MapGraph) anchorDistance(a, b int) (float64, bool) {
	ca, cb := g.anchorCell[a], g.anchorCell[b]
	if ca < 0 || cb < 0 {
		return 0, false
	}
	if a == b {
		return 0, true
	}
	_, cost, ok := g.search(ca, cb)
	return cost * g.grid.cell, ok
}

// distFromPoint returns the walking distance from an arbitrary point (x,y) -
// not necessarily a grid cell - to the given anchor. ok is false if the
// anchor is unusable or unreachable from (x,y).
func (g *MapGraph) distFromPoint(x, y float64, anchor int) (float64, bool) {
	target := g.anchorCell[anchor]
	if target < 0 {
		return 0, false
	}
	tx, ty := g.grid.centerX(int(target)%g.grid.w), g.grid.centerY(int(target)/g.grid.w)
	if !g.idx.travelBlocked(x, y, tx, ty, g.agentRadius) {
		return math.Hypot(tx-x, ty-y), true
	}
	for _, from := range g.attach(x, y, maxAttachCandidates) {
		if _, cost, ok := g.search(from, target); ok {
			fx, fy := g.grid.centerX(int(from)%g.grid.w), g.grid.centerY(int(from)/g.grid.w)
			return math.Hypot(fx-x, fy-y) + cost*g.grid.cell, true
		}
	}
	return 0, false
}
