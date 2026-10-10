// Package mapfill finds the parts of a map nobody can stand in: every region
// whose outline reaches the map's edge somewhere a wall doesn't cover it,
// and every region holding one of the map's fillPoints
// (docs/schema/map.md#fill). It's the same algorithm as the client's
// game/mapFill.js and the Rails app's MapFill; the three needn't produce
// identical polygons, only the same regions.
//
// The outlines are the walls, the line connections and the map edge. Near
// misses are closed first: endpoints within Snap feet of each other, or of
// any outline, get a connector, and an endpoint within Snap + radius of a
// circle connects to its center. Then every segment is split where it
// crosses another and the regions between them are traced.
package mapfill

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

const (
	Snap  = 0.5  // feet
	merge = 1e-4 // feet; points closer than this are one vertex
	eps   = 1e-7
)

// State is what lies on one side of an edge, or at a point.
type State int

const (
	Open State = iota
	Filled
	Outside // off the map
)

// Kind is what an outline piece came from.
type Kind int

const (
	Border Kind = iota + 1
	Connector
	Wall
	Connection
)

// rank is which kind wins when two pieces coincide: a wall along the map's
// edge seals it.
func (k Kind) rank() int {
	switch k {
	case Wall, Connection:
		return 3
	case Connector:
		return 2
	}
	return 1
}

// Point is a location in map feet.
type Point struct{ X, Y float64 }

// Edge is one piece of outline between two vertices, with what lies to the
// Left and Right of A→B.
type Edge struct {
	A, B        Point
	Kind        Kind
	Left, Right State

	onBorder          bool
	forward, backward *halfEdge
}

// Region is one filled face: its outer ring and the rings of anything
// inside it that isn't part of it.
type Region struct {
	Outer []Point
	Holes [][]Point
}

// Fill is a map's computed fill. Immutable after Compute, so safe for
// concurrent reads. A nil *Fill has no fill at all: everything is Open.
type Fill struct {
	Edges   []Edge
	Regions []Region

	width, height float64
	faces         []*cycle
}

// Compute traces m's fill. It returns nil for a map without dimensions.
func Compute(m instanceconfig.Map) *Fill {
	w, h := m.FeetDimensions.Width, m.FeetDimensions.Height
	if w <= 0 || h <= 0 {
		return nil
	}
	g := buildGraph(splitAtCrossings(outlineSegments(m, w, h)))
	cycles := traceCycles(g)
	fillPoints := make([]Point, len(m.FillPoints))
	for i, p := range m.FillPoints {
		fillPoints[i] = Point{p.X, p.Y}
	}
	faces := classify(g, cycles, fillPoints)

	f := &Fill{width: w, height: h, faces: faces}
	for _, e := range g.edges {
		e.Left, e.Right = e.forward.cycle.side, e.backward.cycle.side
		f.Edges = append(f.Edges, *e)
	}
	for _, c := range faces {
		if c.state != Filled {
			continue
		}
		r := Region{Outer: c.points}
		for _, hole := range c.holes {
			r.Holes = append(r.Holes, hole.points)
		}
		f.Regions = append(f.Regions, r)
	}
	return f
}

// StateAt reports whether (x,y) is in the fill, on open ground, or off the
// map.
func (f *Fill) StateAt(x, y float64) State {
	if f == nil {
		return Open
	}
	if x < 0 || y < 0 || x > f.width || y > f.height {
		return Outside
	}
	if c := innermost(Point{x, y}, f.faces, nil); c != nil {
		return c.state
	}
	return Filled
}

// Filled reports whether (x,y) is somewhere nobody can stand: in the fill
// or off the map.
func (f *Fill) Filled(x, y float64) bool { return f.StateAt(x, y) != Open }

// NearestOpen returns the nearest point to (x,y) that's at least clearance
// into open ground across one of the fill's edges, and false if the fill
// has no open ground at all.
func (f *Fill) NearestOpen(x, y, clearance float64) (Point, bool) {
	if f == nil {
		return Point{x, y}, true
	}
	best, found := Point{}, false
	bestD := math.Inf(1)
	for _, e := range f.Edges {
		openLeft := e.Left == Open && e.Right != Open
		if !openLeft && !(e.Right == Open && e.Left != Open) {
			continue
		}
		q := closestOnSegment(Point{x, y}, e.A, e.B)
		d := math.Hypot(q.X-x, q.Y-y)
		if d >= bestD {
			continue
		}
		dx, dy := e.B.X-e.A.X, e.B.Y-e.A.Y
		l := math.Hypot(dx, dy)
		nx, ny := -dy/l, dx/l // left of A→B
		if !openLeft {
			nx, ny = -nx, -ny
		}
		best, bestD, found = Point{q.X + nx*clearance, q.Y + ny*clearance}, d, true
	}
	return best, found
}

// HasOpenGround reports whether any part of the map isn't filled.
func (f *Fill) HasOpenGround() bool {
	if f == nil {
		return true
	}
	for _, c := range f.faces {
		if c.state == Open {
			return true
		}
	}
	return false
}
