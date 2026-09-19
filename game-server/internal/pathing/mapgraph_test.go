package pathing

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

func TestBuildMapGraph_NoBarriers_DirectPathOnly(t *testing.T) {
	g, _, err := BuildMapGraph(instanceconfig.Map{Identifier: "m"}, 0.5, nil)
	require.NoError(t, err)

	path, ok := g.FindPath(0, 0, 10, 0)
	require.True(t, ok)
	assert.Equal(t, []Point{{X: 10, Y: 0}}, path)
}

func TestFindPath_DetoursAroundWallEnd(t *testing.T) {
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers: []instanceconfig.Barrier{
			wallBarrier(
				instanceconfig.Location{X: 5, Y: -50},
				instanceconfig.Location{X: 5, Y: 5},
			),
		},
	}
	g, _, err := BuildMapGraph(m, 0.5, nil)
	require.NoError(t, err)

	path, ok := g.FindPath(0, 0, 10, 0)
	require.True(t, ok)
	require.NotEmpty(t, path)

	assertPathClear(t, 0, 0, path, 0.5, m.Barriers)
	assert.Equal(t, Point{X: 10, Y: 0}, path[len(path)-1])

	straight := 10.0
	assert.Greater(t, pathLength(0, 0, path), straight, "detouring around the wall end must be longer than the blocked direct line")
}

func TestFindPath_DetoursAroundCircle(t *testing.T) {
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers:   []instanceconfig.Barrier{circleBarrier(5, 0, 2)},
	}
	g, _, err := BuildMapGraph(m, 0.5, nil)
	require.NoError(t, err)

	path, ok := g.FindPath(0, 0, 10, 0)
	require.True(t, ok)
	require.NotEmpty(t, path)

	assertPathClear(t, 0, 0, path, 0.5, m.Barriers)
	assert.Equal(t, Point{X: 10, Y: 0}, path[len(path)-1])
}

func TestFindPath_UnreachableInsideClosedBox(t *testing.T) {
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers: []instanceconfig.Barrier{
			wallBarrier(
				instanceconfig.Location{X: -10, Y: -10},
				instanceconfig.Location{X: 10, Y: -10},
				instanceconfig.Location{X: 10, Y: 10},
				instanceconfig.Location{X: -10, Y: 10},
				instanceconfig.Location{X: -10, Y: -10},
			),
		},
	}
	g, _, err := BuildMapGraph(m, 0.3, nil)
	require.NoError(t, err)

	_, ok := g.FindPath(0, -20, 0, 0)
	assert.False(t, ok, "sealed box with no gap must be unreachable from outside")
}

func TestFindPath_LCornerRoutesAroundNearestOpenEnd(t *testing.T) {
	// An L-shaped wall with two 10ft legs meeting at the origin. The two
	// legs together block the entire boundary between the outside (SW) and
	// the inside notch (NE) - there's no shortcut directly across the
	// vertex itself, only around whichever leg's open end is nearer.
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers: []instanceconfig.Barrier{
			wallBarrier(
				instanceconfig.Location{X: 0, Y: 10},
				instanceconfig.Location{X: 0, Y: 0},
				instanceconfig.Location{X: 10, Y: 0},
			),
		},
	}
	g, _, err := BuildMapGraph(m, 1.0, nil)
	require.NoError(t, err)

	path, ok := g.FindPath(-5, -5, 15, 15)
	require.True(t, ok)
	assertPathClear(t, -5, -5, path, 1.0, m.Barriers)
	assert.Equal(t, Point{X: 15, Y: 15}, path[len(path)-1])

	// The route must pass near one of the wall's open ends (0,10) or
	// (10,0), not cut across the vertex itself.
	nearEnd := false
	for _, p := range path {
		if math.Hypot(p.X-0, p.Y-10) < 3 || math.Hypot(p.X-10, p.Y-0) < 3 {
			nearEnd = true
		}
	}
	assert.True(t, nearEnd, "path should route around a wall end, not cut through the corner")
}

func TestFindPath_SucceedsFromPositionRestingAtRealCollisionDistance(t *testing.T) {
	// After collision resolution, a unit rests at exactly its own true
	// radius from a wall - here, 2.0ft - which is *inside* this graph's
	// padded clearance zone (2.0 + cornerClearancePadding = 2.25ft). A
	// unit's actual position is a given fact, not a choice: it must still
	// be able to plan a route away from a wall it's legitimately resting
	// against, or it can never move again once it ends up there.
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers: []instanceconfig.Barrier{
			wallBarrier(instanceconfig.Location{X: -3, Y: 5}, instanceconfig.Location{X: 3, Y: 5}),
		},
	}
	g, _, err := BuildMapGraph(m, 2.0, nil)
	require.NoError(t, err)

	require.NotEmpty(t, g.attach(0, 3, 1), "must reach at least one cell from a real, if tight, resting position")

	path, ok := g.FindPath(0, 3, 0, 10)
	require.True(t, ok)
	assert.Equal(t, Point{X: 0, Y: 10}, path[len(path)-1])
}

func TestBuildMapGraph_FreeCellsRespectFullPaddedClearance(t *testing.T) {
	// The leniency in travelBlocked must be confined to querying FROM a live
	// position - it must never weaken which grid cells count as free.
	barrier := wallBarrier(instanceconfig.Location{X: -3, Y: 5}, instanceconfig.Location{X: 3, Y: 5})
	m := instanceconfig.Map{Identifier: "m", Barriers: []instanceconfig.Barrier{barrier}}
	g, _, err := BuildMapGraph(m, 2.0, nil)
	require.NoError(t, err)

	free := 0
	for i := range g.grid.w * g.grid.h {
		if g.blocked.get(i) {
			continue
		}
		free++
		x, y := g.grid.centerX(i%g.grid.w), g.grid.centerY(i/g.grid.w)
		d := newBarrierIndex(m.Barriers).prims[0].clearance(x, y)
		assert.GreaterOrEqual(t, d, g.agentRadius-1e-6, "free cell (%v,%v) has only %.4f ft clearance, wanted the full padded %.4f", x, y, d, g.agentRadius)
	}
	assert.NotZero(t, free)
}

func TestMapGraph_SegmentClear(t *testing.T) {
	m := instanceconfig.Map{
		Identifier: "m",
		Barriers:   []instanceconfig.Barrier{circleBarrier(5, 0, 2)},
	}
	g, _, err := BuildMapGraph(m, 0.5, nil)
	require.NoError(t, err)

	assert.True(t, g.SegmentClear(0, 5, 10, 5), "well clear of the circle")
	assert.False(t, g.SegmentClear(0, 0, 10, 0), "straight through the circle")
}

func TestBuildMapGraph_NonFiniteCoordinateErrors(t *testing.T) {
	m := instanceconfig.Map{
		Identifier: "broken",
		Barriers:   []instanceconfig.Barrier{wallBarrier(instanceconfig.Location{X: 0, Y: 0}, instanceconfig.Location{X: math.NaN(), Y: 1})},
	}
	_, _, err := BuildMapGraph(m, 1, nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "broken")
}

// assertPathClear checks that every leg of path (starting from (sx,sy)) is
// unobstructed for a unit of the given radius.
func assertPathClear(t *testing.T, sx, sy float64, path []Point, radius float64, barriers []instanceconfig.Barrier) {
	t.Helper()
	x, y := sx, sy
	for _, p := range path {
		assert.False(t, segmentBlockedByBarriers(x, y, p.X, p.Y, radius, barriers),
			"leg (%v,%v)->(%v,%v) should be clear", x, y, p.X, p.Y)
		x, y = p.X, p.Y
	}
}

func pathLength(sx, sy float64, path []Point) float64 {
	total := 0.0
	x, y := sx, sy
	for _, p := range path {
		total += math.Hypot(p.X-x, p.Y-y)
		x, y = p.X, p.Y
	}
	return total
}
