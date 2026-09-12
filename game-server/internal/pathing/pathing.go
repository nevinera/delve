package pathing

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Graph is a zone's set of per-map visibility graphs, one per map
// identifier, stitched together at their MapConnection points so a route
// can be planned toward a map other than the one it starts on. It's built
// once and queried at chase time; it is not safe to share across separate
// Instances of the same zone, since a future door-toggle rebuild will
// mutate a specific map's graph in place.
type Graph struct {
	maps map[string]*MapGraph

	// meta is a small graph over just the connection nodes across every
	// map (not the full per-map node sets), used to plan which connection
	// to head for when the goal is on a different map. See
	// nearestExitToward.
	meta      []metaNode
	metaIndex map[mapNode]int
	metaAdj   [][]metaEdge
}

type mapNode struct {
	mapID string
	node  int
}

type metaNode struct {
	mapID string
	node  int
	point Point
}

type metaEdge struct {
	to   int
	cost float64
}

// Build precomputes a visibility graph for every map in the zone, each
// sized for the largest unit placed on that specific map (see
// MaxUnitRadius) - this is the v1, single-size-per-map approach; per-size
// buckets will replace it once multiple unit sizes need to path
// independently on the same map. fallbackRadius is used for maps with no
// units placed on them at all.
//
// Every MapConnection referenced by a ZoneLink gets a graph node on its own
// map (so ordinary same-map routing already reaches it), plus an entry in
// the cross-map meta-graph connecting it to whichever connection it links
// to - see FindPathTowardMap.
func Build(zone instanceconfig.Zone, fallbackRadius float64) (*Graph, error) {
	g := &Graph{
		maps:      make(map[string]*MapGraph, len(zone.Maps)),
		metaIndex: make(map[mapNode]int),
	}

	connNode := make(map[connKey]mapNode)
	for _, m := range zone.Maps {
		var anchors []Point
		var anchorConnIDs []string
		for _, c := range m.Connections {
			p, ok := connectionPoint(c)
			if !ok {
				continue
			}
			anchors = append(anchors, p)
			anchorConnIDs = append(anchorConnIDs, c.Identifier)
		}

		mg, anchorIdx, err := BuildMapGraph(m, MaxUnitRadius(zone, m, fallbackRadius), anchors)
		if err != nil {
			return nil, err
		}
		g.maps[m.Identifier] = mg

		for i, connID := range anchorConnIDs {
			if anchorIdx[i] < 0 {
				continue // connection point sat inside a barrier; can't use it
			}
			mn := mapNode{m.Identifier, anchorIdx[i]}
			connNode[connKey{m.Identifier, connID}] = mn
			g.addMetaNode(mn, anchors[i])
		}
	}

	// Same-map edges between every pair of connection nodes on one map,
	// using that map's own precomputed all-pairs table.
	for i, mi := range g.meta {
		mg := g.maps[mi.mapID]
		for j, mj := range g.meta {
			if i == j || mi.mapID != mj.mapID {
				continue
			}
			if d := mg.dist[mi.node][mj.node]; d != math.Inf(1) {
				g.metaAdj[i] = append(g.metaAdj[i], metaEdge{to: j, cost: d})
			}
		}
	}

	// Cross-map edges, one per ZoneLink (both directions unless OneWay).
	for _, zl := range zone.ZoneLinks {
		a, aOK := connNode[connKey{zl.ConnectionA.Map, zl.ConnectionA.Connection}]
		b, bOK := connNode[connKey{zl.ConnectionB.Map, zl.ConnectionB.Connection}]
		if !aOK || !bOK {
			continue
		}
		g.addMetaEdge(a, b)
		if !zl.OneWay {
			g.addMetaEdge(b, a)
		}
	}

	return g, nil
}

func (g *Graph) addMetaNode(mn mapNode, p Point) {
	if _, exists := g.metaIndex[mn]; exists {
		return
	}
	g.metaIndex[mn] = len(g.meta)
	g.meta = append(g.meta, metaNode{mapID: mn.mapID, node: mn.node, point: p})
	g.metaAdj = append(g.metaAdj, nil)
}

func (g *Graph) addMetaEdge(from, to mapNode) {
	fi, ok := g.metaIndex[from]
	if !ok {
		return
	}
	ti, ok := g.metaIndex[to]
	if !ok {
		return
	}
	g.metaAdj[fi] = append(g.metaAdj[fi], metaEdge{to: ti, cost: 0})
}

// connKey identifies one side of a map connection, as declared by a
// ZoneLink (map identifier + that map's MapConnection.Identifier).
type connKey struct {
	mapID  string
	connID string
}

// connectionPoint returns the representative point of a MapConnection to
// use as a graph node: its exact position for a "point" connection, or the
// midpoint of its line for a "line" connection (the actual proportional
// placement on the other side of a crossing is handled by the existing
// map-transition logic, not by pathing - this point only needs to anchor
// routing on this map).
func connectionPoint(c instanceconfig.MapConnection) (Point, bool) {
	switch c.Type {
	case "point":
		if c.Position == nil {
			return Point{}, false
		}
		return Point{X: c.Position.X, Y: c.Position.Y}, true
	case "line":
		if c.Start == nil || c.End == nil {
			return Point{}, false
		}
		return Point{X: (c.Start.X + c.End.X) / 2, Y: (c.Start.Y + c.End.Y) / 2}, true
	default:
		return Point{}, false
	}
}

// MaxUnitRadius returns the largest UnitType.TokenRadius among units placed
// on the given map, or fallback if the map has no units (or references an
// unknown unit type). This is a convenience for callers building a single
// agentRadius per map for v1; it will be superseded by per-size-bucket
// radii once those exist.
func MaxUnitRadius(zone instanceconfig.Zone, m instanceconfig.Map, fallback float64) float64 {
	max := fallback
	for _, u := range m.Units {
		ut, ok := zone.UnitTypes[u.UnitType]
		if !ok {
			continue
		}
		if ut.TokenRadius > max {
			max = ut.TokenRadius
		}
	}
	return max
}

// FindPath routes a unit of this graph's agent radius from (sx,sy) to
// (tx,ty) on the named map. Returns false if the map is unknown or no path
// exists.
func (g *Graph) FindPath(mapIdentifier string, sx, sy, tx, ty float64) ([]Point, bool) {
	mg, ok := g.maps[mapIdentifier]
	if !ok {
		return nil, false
	}
	return mg.FindPath(sx, sy, tx, ty)
}

// SegmentClear reports whether a unit of this graph's agent radius could
// travel in a straight line between the two points on the named map
// without overlapping a barrier. Returns true if the map is unknown,
// matching instanceconfig.LineOfSightClear's convention.
func (g *Graph) SegmentClear(mapIdentifier string, x1, y1, x2, y2 float64) bool {
	mg, ok := g.maps[mapIdentifier]
	if !ok {
		return true
	}
	return mg.SegmentClear(x1, y1, x2, y2)
}

// FindPathTowardMap routes from (sx,sy) on fromMap toward whichever
// connection leads (possibly through further intermediate maps) to toMap,
// and returns the waypoints to travel on fromMap to reach that connection -
// not a full multi-map route, since once a unit actually crosses, the
// receiving map's own layout (and the target's exact position there) get
// re-evaluated fresh anyway, the same way any other chase decision does
// every tick. Returns false if fromMap == toMap (use FindPath directly for
// same-map routing) or toMap isn't reachable through any known connection.
func (g *Graph) FindPathTowardMap(fromMap string, sx, sy float64, toMap string) ([]Point, bool) {
	if fromMap == toMap {
		return nil, false
	}
	mg, ok := g.maps[fromMap]
	if !ok {
		return nil, false
	}
	exit, ok := g.nearestExitToward(fromMap, sx, sy, toMap)
	if !ok {
		return nil, false
	}
	return mg.FindPath(sx, sy, exit.X, exit.Y)
}

// nearestExitToward runs Dijkstra over the small cross-map connection graph
// to find, among all of fromMap's own connections, the one that starts the
// cheapest route (by walking distance on fromMap, then zero-cost hops
// between linked connections, then further walking distance on any
// intermediate maps) that eventually reaches toMap. The returned point is
// always on fromMap - it's the connection the caller should walk to, not
// wherever the route eventually arrives.
func (g *Graph) nearestExitToward(fromMap string, sx, sy float64, toMap string) (Point, bool) {
	mg := g.maps[fromMap]

	dist := make([]float64, len(g.meta))
	origin := make([]int, len(g.meta)) // which fromMap seed connection started the best route to this node
	visited := make([]bool, len(g.meta))
	for i := range dist {
		dist[i] = math.Inf(1)
		origin[i] = -1
	}
	for i, mn := range g.meta {
		if mn.mapID != fromMap {
			continue
		}
		if d, ok := mg.distFromPoint(sx, sy, mn.node); ok {
			dist[i] = d
			origin[i] = i
		}
	}

	for {
		u := -1
		best := math.Inf(1)
		for i, d := range dist {
			if !visited[i] && d < best {
				best, u = d, i
			}
		}
		if u == -1 {
			return Point{}, false
		}
		visited[u] = true
		if g.meta[u].mapID == toMap {
			return g.meta[origin[u]].point, true
		}
		for _, e := range g.metaAdj[u] {
			if nd := dist[u] + e.cost; nd < dist[e.to] {
				dist[e.to] = nd
				origin[e.to] = origin[u]
			}
		}
	}
}
