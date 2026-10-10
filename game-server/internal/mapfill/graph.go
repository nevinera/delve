package mapfill

import (
	"math"
	"sort"
)

type vertex struct {
	id  int
	p   Point
	out []*halfEdge
}

type halfEdge struct {
	from, to *vertex
	edge     *Edge
	twin     *halfEdge
	angle    float64
	index    int
	cycle    *cycle
}

// cycle is one traced ring of half-edges. A positive area is a bounded face
// (counterclockwise); a negative one is a connected piece's outside.
type cycle struct {
	halfEdges []*halfEdge
	points    []Point
	area      float64
	minX      float64
	minY      float64
	maxX      float64
	maxY      float64
	state     State // a face's own state
	side      State // what a half-edge on this cycle has to its left
	holes     []*cycle
}

type graph struct {
	vertices []*vertex
	edges    []*Edge
}

type bucketKey struct{ x, y int64 }

// buildGraph joins the pieces into a planar graph, merging points within
// merge of each other into one vertex.
func buildGraph(pieces []segment) *graph {
	g := &graph{}
	buckets := map[bucketKey][]*vertex{}
	vertexAt := func(p Point) *vertex {
		bx, by := int64(math.Floor(p.X/merge)), int64(math.Floor(p.Y/merge))
		for dx := int64(-1); dx <= 1; dx++ {
			for dy := int64(-1); dy <= 1; dy++ {
				for _, v := range buckets[bucketKey{bx + dx, by + dy}] {
					if dist(v.p, p) <= merge {
						return v
					}
				}
			}
		}
		v := &vertex{id: len(g.vertices), p: p}
		g.vertices = append(g.vertices, v)
		buckets[bucketKey{bx, by}] = append(buckets[bucketKey{bx, by}], v)
		return v
	}

	byPair := map[[2]int]*Edge{}
	for _, piece := range pieces {
		u, v := vertexAt(piece.a), vertexAt(piece.b)
		if u == v {
			continue
		}
		pair := [2]int{min(u.id, v.id), max(u.id, v.id)}
		if existing, ok := byPair[pair]; ok {
			existing.onBorder = existing.onBorder || piece.kind == Border
			if piece.kind.rank() > existing.Kind.rank() {
				existing.Kind = piece.kind
			}
			continue
		}
		e := &Edge{A: u.p, B: v.p, Kind: piece.kind, onBorder: piece.kind == Border}
		e.forward = &halfEdge{from: u, to: v, edge: e}
		e.backward = &halfEdge{from: v, to: u, edge: e}
		e.forward.twin, e.backward.twin = e.backward, e.forward
		u.out = append(u.out, e.forward)
		v.out = append(v.out, e.backward)
		byPair[pair] = e
		g.edges = append(g.edges, e)
	}
	for _, v := range g.vertices {
		for _, h := range v.out {
			h.angle = math.Atan2(h.to.p.Y-v.p.Y, h.to.p.X-v.p.X)
		}
		sort.Slice(v.out, func(i, j int) bool { return v.out[i].angle < v.out[j].angle })
		for i, h := range v.out {
			h.index = i
		}
	}
	return g
}

// traceCycles walks every half-edge's face, which lies on its left: from
// u→v, turn to the next edge clockwise from v→u.
func traceCycles(g *graph) []*cycle {
	var cycles []*cycle
	for _, v := range g.vertices {
		for _, start := range v.out {
			if start.cycle != nil {
				continue
			}
			c := &cycle{}
			for h := start; h.cycle == nil; {
				h.cycle = c
				c.halfEdges = append(c.halfEdges, h)
				c.points = append(c.points, h.from.p)
				around := h.to.out
				h = around[(h.twin.index-1+len(around))%len(around)]
			}
			c.area = ringArea(c.points)
			c.minX, c.minY, c.maxX, c.maxY = bounds(c.points)
			cycles = append(cycles, c)
		}
	}
	return cycles
}

// classify fills the faces that reach the map's edge (where a wall doesn't
// cover it) or hold a fill point. A hole - a piece of outline not joined to
// the rest - takes the state of the face around it, and the map edge's own
// outside is Outside. Returns the faces.
func classify(g *graph, cycles []*cycle, fillPoints []Point) []*cycle {
	component := connectedPieces(g)
	var faces []*cycle
	for _, c := range cycles {
		if c.area <= 0 {
			continue
		}
		c.state = Open
		for _, h := range c.halfEdges {
			if h.edge.Kind == Border {
				c.state = Filled
				break
			}
		}
		faces = append(faces, c)
	}
	for _, p := range fillPoints {
		if c := innermost(p, faces, nil); c != nil {
			c.state = Filled
		}
	}
	for _, c := range faces {
		c.side = c.state
	}
	for _, ring := range cycles {
		if ring.area > 0 {
			continue
		}
		if onBorder(ring) {
			ring.side = Outside
			continue
		}
		piece := component[ring.halfEdges[0].from.id]
		container := innermost(ring.points[0], faces, func(f *cycle) bool {
			return component[f.halfEdges[0].from.id] != piece
		})
		ring.side = Open
		if container != nil {
			ring.side = container.state
			container.holes = append(container.holes, ring)
		}
	}
	return faces
}

func onBorder(c *cycle) bool {
	for _, h := range c.halfEdges {
		if h.edge.onBorder {
			return true
		}
	}
	return false
}

// innermost returns the smallest face containing p, among those keep
// allows (all of them when keep is nil).
func innermost(p Point, faces []*cycle, keep func(*cycle) bool) *cycle {
	var best *cycle
	for _, f := range faces {
		if p.X < f.minX || p.X > f.maxX || p.Y < f.minY || p.Y > f.maxY {
			continue
		}
		if (best == nil || f.area < best.area) && (keep == nil || keep(f)) && pointInRing(p, f.points) {
			best = f
		}
	}
	return best
}

// connectedPieces maps each vertex id to its piece's root id (union-find
// over the edges).
func connectedPieces(g *graph) []int {
	parent := make([]int, len(g.vertices))
	for i := range parent {
		parent[i] = i
	}
	root := func(i int) int {
		for parent[i] != i {
			parent[i] = parent[parent[i]]
			i = parent[i]
		}
		return i
	}
	for _, e := range g.edges {
		parent[root(e.forward.from.id)] = root(e.forward.to.id)
	}
	for i := range parent {
		parent[i] = root(i)
	}
	return parent
}
