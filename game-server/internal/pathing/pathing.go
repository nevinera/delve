package pathing

import (
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Graph is a zone's set of per-map visibility graphs, one per map
// identifier. It's built once (currently for a single agent radius, shared
// by every unit on the map) and queried at chase time; it is not safe to
// share across separate Instances of the same zone, since a future
// door-toggle rebuild will mutate a specific map's graph in place.
type Graph struct {
	maps map[string]*MapGraph
}

// Build precomputes a visibility graph for every map in the zone, sized for
// a unit with the given collision radius. This is the v1, single-size
// entry point; per-size-bucket graphs will replace the single agentRadius
// parameter once multiple unit sizes need to path independently.
func Build(zone instanceconfig.Zone, agentRadius float64) (*Graph, error) {
	g := &Graph{maps: make(map[string]*MapGraph, len(zone.Maps))}
	for _, m := range zone.Maps {
		mg, err := BuildMapGraph(m, agentRadius)
		if err != nil {
			return nil, err
		}
		g.maps[m.Identifier] = mg
	}
	return g, nil
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
