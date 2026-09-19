package pathing

import (
	"math"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Graph is a zone's set of visibility graphs, one per (map, size bucket)
// pair - see bucketRadius - stitched together at their MapConnection points
// so a route can be planned toward a map other than the one it starts on.
// It's built once and queried at chase time; it is not safe to share across
// separate Instances of the same zone, since a future door-toggle rebuild
// will mutate a specific map's graph in place.
type Graph struct {
	buckets map[float64]*zoneGraph
}

// zoneGraph is one size bucket's worth of precomputed graphs: a MapGraph
// per map (inflated for that bucket's radius), and a small meta-graph over
// just their connection nodes, used by FindPathTowardMap.
type zoneGraph struct {
	maps map[string]*MapGraph

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

// bucketRadius rounds r up to the nearest agent-size bucket: 1ft, 3ft, 5ft,
// then every 5 feet from there (10, 15, 20, ...). A zone with several
// differently-sized units doesn't need a fully separate graph per exact
// radius - only per bucket - while still giving each unit a graph inflated
// close to its own true size, rather than the single largest-unit-on-the-
// map compromise this package started with.
func bucketRadius(r float64) float64 {
	switch {
	case r <= 1:
		return 1
	case r <= 3:
		return 3
	case r <= 5:
		return 5
	default:
		return math.Ceil(r/5) * 5
	}
}

// Build precomputes a visibility graph for every map in the zone, once per
// size bucket actually needed by some unit somewhere in the zone (plus
// fallbackRadius's bucket, for maps with no units placed on them at all -
// see neededBucketRadii). Every MapConnection referenced by a ZoneLink gets a
// graph node on its own map in every bucket, plus an entry in that
// bucket's cross-map meta-graph connecting it to whichever connection it
// links to - see FindPathTowardMap. A bucket's graphs are entirely
// independent of every other bucket's: a connection or route that doesn't
// fit a larger bucket's agent size simply doesn't appear in that bucket's
// graph, while smaller buckets route through it normally.
func Build(zone instanceconfig.Zone, fallbackRadius float64) (*Graph, error) {
	indexes := make(map[string]*barrierIndex, len(zone.Maps))
	for _, m := range zone.Maps {
		if err := validateGeometry(m); err != nil {
			return nil, err
		}
		indexes[m.Identifier] = newBarrierIndex(m.Barriers)
	}

	g := &Graph{buckets: make(map[float64]*zoneGraph)}
	for _, radius := range neededBucketRadii(zone, fallbackRadius) {
		zg, err := buildZoneGraph(zone, indexes, radius)
		if err != nil {
			return nil, err
		}
		g.buckets[radius] = zg
	}
	return g, nil
}

// neededBucketRadii returns the sorted, deduplicated set of size buckets
// required to cover every unit placed anywhere in the zone, plus
// fallbackRadius's own bucket (used for maps with no units at all).
func neededBucketRadii(zone instanceconfig.Zone, fallbackRadius float64) []float64 {
	seen := map[float64]bool{bucketRadius(fallbackRadius): true}
	for _, m := range zone.Maps {
		for _, u := range m.Units {
			if ut, ok := zone.UnitTypes[u.UnitType]; ok {
				seen[bucketRadius(ut.TokenRadius)] = true
			}
		}
	}
	radii := make([]float64, 0, len(seen))
	for r := range seen {
		radii = append(radii, r)
	}
	for i := 1; i < len(radii); i++ {
		for j := i; j > 0 && radii[j-1] > radii[j]; j-- {
			radii[j-1], radii[j] = radii[j], radii[j-1]
		}
	}
	return radii
}

// buildZoneGraph builds one size bucket's worth of per-map graphs and
// stitches their connection nodes into a cross-map meta-graph.
func buildZoneGraph(zone instanceconfig.Zone, indexes map[string]*barrierIndex, agentRadius float64) (*zoneGraph, error) {
	zg := &zoneGraph{
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

		mg, anchorIdx, err := buildMapGraph(m, indexes[m.Identifier], agentRadius, anchors)
		if err != nil {
			return nil, err
		}
		zg.maps[m.Identifier] = mg

		for i, connID := range anchorConnIDs {
			if anchorIdx[i] < 0 {
				continue // connection point sat inside a barrier; can't use it
			}
			mn := mapNode{m.Identifier, anchorIdx[i]}
			connNode[connKey{m.Identifier, connID}] = mn
			zg.addMetaNode(mn, anchors[i])
		}
	}

	// Same-map edges between every pair of connection nodes on one map,
	// using that map's own precomputed all-pairs table.
	for i, mi := range zg.meta {
		mg := zg.maps[mi.mapID]
		for j, mj := range zg.meta {
			if i == j || mi.mapID != mj.mapID {
				continue
			}
			if d, ok := mg.anchorDistance(mi.node, mj.node); ok {
				zg.metaAdj[i] = append(zg.metaAdj[i], metaEdge{to: j, cost: d})
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
		zg.addMetaEdge(a, b)
		if !zl.OneWay {
			zg.addMetaEdge(b, a)
		}
	}

	return zg, nil
}

func (zg *zoneGraph) addMetaNode(mn mapNode, p Point) {
	if _, exists := zg.metaIndex[mn]; exists {
		return
	}
	zg.metaIndex[mn] = len(zg.meta)
	zg.meta = append(zg.meta, metaNode{mapID: mn.mapID, node: mn.node, point: p})
	zg.metaAdj = append(zg.metaAdj, nil)
}

func (zg *zoneGraph) addMetaEdge(from, to mapNode) {
	fi, ok := zg.metaIndex[from]
	if !ok {
		return
	}
	ti, ok := zg.metaIndex[to]
	if !ok {
		return
	}
	zg.metaAdj[fi] = append(zg.metaAdj[fi], metaEdge{to: ti, cost: 0})
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

// FindPath routes a unit of the given collision radius from (sx,sy) to
// (tx,ty) on the named map. Returns false if agentRadius's size bucket or
// the map is unknown, or no path exists.
func (g *Graph) FindPath(agentRadius float64, mapIdentifier string, sx, sy, tx, ty float64) ([]Point, bool) {
	zg, ok := g.buckets[bucketRadius(agentRadius)]
	if !ok {
		return nil, false
	}
	mg, ok := zg.maps[mapIdentifier]
	if !ok {
		return nil, false
	}
	return mg.FindPath(sx, sy, tx, ty)
}

// SegmentClear reports whether a unit of the given collision radius could
// travel in a straight line between the two points on the named map
// without overlapping a barrier. Returns true if agentRadius's size bucket
// or the map is unknown, matching instanceconfig.LineOfSightClear's
// convention.
func (g *Graph) SegmentClear(agentRadius float64, mapIdentifier string, x1, y1, x2, y2 float64) bool {
	zg, ok := g.buckets[bucketRadius(agentRadius)]
	if !ok {
		return true
	}
	mg, ok := zg.maps[mapIdentifier]
	if !ok {
		return true
	}
	return mg.SegmentClear(x1, y1, x2, y2)
}

// FindPathTowardMap routes a unit of the given collision radius from
// (sx,sy) on fromMap toward whichever connection leads (possibly through
// further intermediate maps) to toMap, and returns the waypoints to travel
// on fromMap to reach that connection - not a full multi-map route, since
// once a unit actually crosses, the receiving map's own layout (and the
// target's exact position there) get re-evaluated fresh anyway, the same
// way any other chase decision does every tick. Returns false if
// agentRadius's size bucket is unknown, fromMap == toMap (use FindPath
// directly for same-map routing), or toMap isn't reachable through any
// connection this bucket's agent size can actually fit through.
func (g *Graph) FindPathTowardMap(agentRadius float64, fromMap string, sx, sy float64, toMap string) ([]Point, bool) {
	if fromMap == toMap {
		return nil, false
	}
	zg, ok := g.buckets[bucketRadius(agentRadius)]
	if !ok {
		return nil, false
	}
	mg, ok := zg.maps[fromMap]
	if !ok {
		return nil, false
	}
	exit, ok := zg.nearestExitToward(fromMap, sx, sy, toMap)
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
func (zg *zoneGraph) nearestExitToward(fromMap string, sx, sy float64, toMap string) (Point, bool) {
	mg := zg.maps[fromMap]

	dist := make([]float64, len(zg.meta))
	origin := make([]int, len(zg.meta)) // which fromMap seed connection started the best route to this node
	visited := make([]bool, len(zg.meta))
	for i := range dist {
		dist[i] = math.Inf(1)
		origin[i] = -1
	}
	for i, mn := range zg.meta {
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
		if zg.meta[u].mapID == toMap {
			return zg.meta[origin[u]].point, true
		}
		for _, e := range zg.metaAdj[u] {
			if nd := dist[u] + e.cost; nd < dist[e.to] {
				dist[e.to] = nd
				origin[e.to] = origin[u]
			}
		}
	}
}
