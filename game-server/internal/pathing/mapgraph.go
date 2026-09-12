// Package pathing builds and queries short-range visibility-graph paths
// around a map's barriers, for units that need to route around obstacles
// rather than walking straight at a target. It depends only on
// instanceconfig (barrier/map geometry) and has no knowledge of the tick
// loop, unit state, or anything else engine-side, so it can be built and
// tested in isolation and simply called into at runtime.
package pathing

import (
	"fmt"
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// MaxNodesPerMap is the hard cap on visibility-graph nodes for a single
// map's pathing graph. The map editor is expected to enforce a barrier
// budget that keeps maps under this limit; BuildMapGraph returns an error
// if it's exceeded rather than silently eating an expensive all-pairs
// precompute (or worse, a runaway one) at runtime.
const MaxNodesPerMap = 400

// circleSampleCount is how many points approximate a circle barrier's
// boundary as a polygon for graph-node purposes. This is a deliberate
// simplification: true shortest paths around a circular obstacle can
// include an arc, but for gameplay-scale barriers a modestly-sampled
// polygon is indistinguishable and far simpler to reason about.
const circleSampleCount = 16

// nodeDedupeDist merges candidate nodes closer together than this, to avoid
// near-duplicate nodes (and degenerate zero-length edges) where multiple
// barrier features generate almost-coincident offset points.
const nodeDedupeDist = 0.01

// Point is a location in map feet-coordinates.
type Point struct {
	X, Y float64
}

// MapGraph is a precomputed visibility graph for one map, inflated for a
// specific agent radius. It's immutable after Build and safe to query
// concurrently for reads, though callers should not share one across
// instances that might rebuild it independently.
type MapGraph struct {
	agentRadius float64
	barriers    []instanceconfig.Barrier
	nodes       []Point
	dist        [][]float64
	next        [][]int // next[i][j] = next node index on the shortest path i->j, or -1
}

// BuildMapGraph precomputes a visibility graph over m's barriers for a unit
// of the given collision radius. It returns an error if the barrier
// geometry produces more than MaxNodesPerMap candidate nodes.
func BuildMapGraph(m instanceconfig.Map, agentRadius float64) (*MapGraph, error) {
	nodes := generateNodes(m.Barriers, agentRadius)
	if len(nodes) > MaxNodesPerMap {
		return nil, fmt.Errorf("pathing: map %q needs %d visibility-graph nodes, exceeds limit of %d",
			m.Identifier, len(nodes), MaxNodesPerMap)
	}

	g := &MapGraph{
		agentRadius: agentRadius,
		barriers:    m.Barriers,
		nodes:       nodes,
	}
	g.buildAllPairs()
	return g, nil
}

// generateNodes produces candidate visibility-graph nodes: offset points
// around wall corners/endpoints, and sampled points around circle
// boundaries, filtered to those a unit of agentRadius could actually stand
// at without overlapping any barrier.
func generateNodes(barriers []instanceconfig.Barrier, agentRadius float64) []Point {
	var candidates []Point

	for _, b := range barriers {
		switch b.Type {
		case "wall":
			candidates = append(candidates, wallVertexCandidates(b, agentRadius)...)
		case "circle":
			if b.Location != nil {
				candidates = append(candidates, sampleCircumscribedCircle(b.Location.X, b.Location.Y, b.Radius+agentRadius, circleSampleCount)...)
			}
		}
	}

	var nodes []Point
	for _, c := range candidates {
		if pointBlockedByBarriers(c.X, c.Y, agentRadius, barriers) {
			continue
		}
		if containsNear(nodes, c) {
			continue
		}
		nodes = append(nodes, c)
	}
	return nodes
}

func containsNear(nodes []Point, p Point) bool {
	for _, n := range nodes {
		if math.Hypot(n.X-p.X, n.Y-p.Y) < nodeDedupeDist {
			return true
		}
	}
	return false
}

// wallVertexCandidates generates candidate nodes around every distinct
// vertex of a wall polyline, by sampling a full circumscribed circle at
// each one (see sampleCircumscribedCircle). This treats every vertex
// uniformly - an open dead-end, a gentle bend, and a sharp corner all just
// get a ring of samples around the point - and lets the validity filter in
// generateNodes prune whichever arc of that ring actually overlaps the
// wall's own segments. That's deliberately simpler than special-casing each
// vertex shape (bevel joins, mitered corners, rounded caps): a plain
// two-point perpendicular offset at a vertex is unsafe in general, because
// the straight chord between the two offset points cuts inside the true
// clearance boundary whenever the vertex has any bend at all (the sharper
// the corner, the worse the cut) - sampling avoids that by construction.
func wallVertexCandidates(b instanceconfig.Barrier, agentRadius float64) []Point {
	var out []Point
	var seen []instanceconfig.Location
	for _, v := range b.Locations {
		duplicate := false
		for _, s := range seen {
			if s == v {
				duplicate = true
				break
			}
		}
		if duplicate {
			continue
		}
		seen = append(seen, v)
		out = append(out, sampleCircumscribedCircle(v.X, v.Y, agentRadius, wallVertexSampleCount)...)
	}
	return out
}

// wallVertexSampleCount is how many points sample the ring around each wall
// vertex. Lower than circleSampleCount since only the outward-facing arc of
// each ring survives filtering in practice; a full circle is generated
// because which arc that is depends on the vertex's neighboring segments.
const wallVertexSampleCount = 12

// sampleCircumscribedCircle samples count points evenly around (cx,cy), on
// a circle slightly larger than radius (radius / cos(pi/count)) rather than
// exactly on it. A chord between two points placed exactly on a circle
// always dips inside it (a chord is closer to the center than its arc),
// which would make every edge between consecutive samples cross into the
// clearance zone they're meant to skirt; circumscribing keeps each edge
// tangent to (never inside) the true boundary.
func sampleCircumscribedCircle(cx, cy, radius float64, count int) []Point {
	samplingRadius := radius / math.Cos(math.Pi/float64(count))
	out := make([]Point, count)
	for k := range count {
		angle := 2 * math.Pi * float64(k) / float64(count)
		out[k] = Point{
			X: cx + samplingRadius*math.Cos(angle),
			Y: cy + samplingRadius*math.Sin(angle),
		}
	}
	return out
}

// buildAllPairs computes directed edges between every pair of nodes with a
// clear line between them, then runs Floyd-Warshall for all-pairs shortest
// paths. Edges are directed (rather than assumed symmetric) so future
// one-way barriers (trapdoors, slides) can produce asymmetric clearance
// without changing this shape.
func (g *MapGraph) buildAllPairs() {
	n := len(g.nodes)
	g.dist = make([][]float64, n)
	g.next = make([][]int, n)
	for i := range n {
		g.dist[i] = make([]float64, n)
		g.next[i] = make([]int, n)
		for j := range n {
			g.next[i][j] = -1
			if i == j {
				g.dist[i][j] = 0
				continue
			}
			g.dist[i][j] = math.Inf(1)
		}
	}

	for i := range n {
		for j := range n {
			if i == j {
				continue
			}
			a, b := g.nodes[i], g.nodes[j]
			if segmentBlockedByBarriers(a.X, a.Y, b.X, b.Y, g.agentRadius, g.barriers) {
				continue
			}
			d := math.Hypot(b.X-a.X, b.Y-a.Y)
			g.dist[i][j] = d
			g.next[i][j] = j
		}
	}

	for k := range n {
		for i := range n {
			if g.dist[i][k] == math.Inf(1) {
				continue
			}
			for j := range n {
				through := g.dist[i][k] + g.dist[k][j]
				if through < g.dist[i][j] {
					g.dist[i][j] = through
					g.next[i][j] = g.next[i][k]
				}
			}
		}
	}
}

// FindPath returns a list of waypoints (not including the start point) to
// travel from (sx,sy) to (tx,ty) without a unit of this graph's agent
// radius overlapping any barrier. If the straight line is already clear,
// the result is just the target point. Returns false if no route exists
// (target unreachable within this map's graph).
func (g *MapGraph) FindPath(sx, sy, tx, ty float64) ([]Point, bool) {
	if !segmentBlockedByBarriers(sx, sy, tx, ty, g.agentRadius, g.barriers) {
		return []Point{{X: tx, Y: ty}}, true
	}

	startVisible := g.visibleNodes(sx, sy)
	goalVisible := g.visibleNodes(tx, ty)
	if len(startVisible) == 0 || len(goalVisible) == 0 {
		return nil, false
	}

	best := math.Inf(1)
	bestFrom, bestTo := -1, -1
	for _, i := range startVisible {
		for _, j := range goalVisible {
			if g.dist[i][j] == math.Inf(1) {
				continue
			}
			total := math.Hypot(g.nodes[i].X-sx, g.nodes[i].Y-sy) +
				g.dist[i][j] +
				math.Hypot(tx-g.nodes[j].X, ty-g.nodes[j].Y)
			if total < best {
				best = total
				bestFrom, bestTo = i, j
			}
		}
	}
	if bestFrom == -1 {
		return nil, false
	}

	path := []Point{g.nodes[bestFrom]}
	for cur := bestFrom; cur != bestTo; {
		cur = g.next[cur][bestTo]
		path = append(path, g.nodes[cur])
	}
	path = append(path, Point{X: tx, Y: ty})
	return path, true
}

func (g *MapGraph) visibleNodes(x, y float64) []int {
	var out []int
	for i, n := range g.nodes {
		if !segmentBlockedByBarriers(x, y, n.X, n.Y, g.agentRadius, g.barriers) {
			out = append(out, i)
		}
	}
	return out
}
