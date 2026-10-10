package mapfill

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

type xy = [2]float64

func wall(pts ...xy) instanceconfig.Barrier {
	b := instanceconfig.Barrier{Type: "wall"}
	for _, p := range pts {
		b.Locations = append(b.Locations, instanceconfig.Location{X: p[0], Y: p[1]})
	}
	return b
}

func circle(x, y, r float64) instanceconfig.Barrier {
	return instanceconfig.Barrier{Type: "circle", Location: &instanceconfig.Location{X: x, Y: y}, Radius: r}
}

func line(id string, a, b xy) instanceconfig.MapConnection {
	return instanceconfig.MapConnection{Identifier: id, Type: "line",
		Start: &instanceconfig.Location{X: a[0], Y: a[1]}, End: &instanceconfig.Location{X: b[0], Y: b[1]}}
}

func testMap(barriers ...instanceconfig.Barrier) instanceconfig.Map {
	return instanceconfig.Map{Identifier: "m", FeetDimensions: instanceconfig.Dimensions{Width: 100, Height: 100}, Barriers: barriers}
}

var room = []xy{{20, 20}, {80, 20}, {80, 80}, {20, 80}, {20, 20}}

func sides(e Edge) [2]State {
	if e.Left > e.Right {
		return [2]State{e.Right, e.Left}
	}
	return [2]State{e.Left, e.Right}
}

func TestCompute_FillsEverythingOutsideAClosedRoom(t *testing.T) {
	f := Compute(testMap(wall(room...)))
	assert.Equal(t, Filled, f.StateAt(5, 5))
	assert.Equal(t, Open, f.StateAt(50, 50))
	assert.Equal(t, Outside, f.StateAt(-1, 50))
	for _, e := range f.Edges {
		switch e.Kind {
		case Wall:
			assert.Equal(t, [2]State{Open, Filled}, sides(e))
		case Border:
			assert.Equal(t, [2]State{Filled, Outside}, sides(e))
		}
	}
	require.Len(t, f.Regions, 1)
	assert.Len(t, f.Regions[0].Holes, 1)
}

func TestCompute_FillsNothingWhenTheWallsRunAlongTheMapEdge(t *testing.T) {
	f := Compute(testMap(wall(xy{0, 0}, xy{100, 0}, xy{100, 100}, xy{0, 100}, xy{0, 0})))
	assert.Equal(t, Open, f.StateAt(50, 50))
	for _, e := range f.Edges {
		assert.Equal(t, [2]State{Open, Outside}, sides(e))
	}
}

func TestCompute_ClosesSmallGapsAndLeaksThroughWideOnes(t *testing.T) {
	sealed := Compute(testMap(wall(xy{20, 20}, xy{80, 20}, xy{80, 80}, xy{20, 80}, xy{20, 20.4})))
	assert.Equal(t, Open, sealed.StateAt(50, 50))
	leaky := Compute(testMap(wall(xy{20, 20}, xy{80, 20}, xy{80, 80}, xy{20, 80}, xy{20, 21})))
	assert.Equal(t, Filled, leaky.StateAt(50, 50))
	assert.False(t, leaky.HasOpenGround())
}

func TestCompute_SealsThroughACircleTheWallsEndNear(t *testing.T) {
	f := Compute(testMap(wall(xy{50, 20}, xy{20, 20}, xy{20, 80}, xy{80, 80}, xy{80, 20}, xy{54, 20}), circle(52, 20, 1.5)))
	assert.Equal(t, Open, f.StateAt(50, 50))
}

func TestCompute_FillsTheRegionAroundEachFillPoint(t *testing.T) {
	m := testMap(wall(room...), wall(xy{40, 40}, xy{60, 40}, xy{60, 60}, xy{40, 60}, xy{40, 40}))
	assert.Equal(t, Open, Compute(m).StateAt(50, 50))
	m.FillPoints = []instanceconfig.Location{{X: 50, Y: 50}}
	f := Compute(m)
	assert.Equal(t, Filled, f.StateAt(50, 50))
	assert.Equal(t, Open, f.StateAt(30, 30))
}

func TestCompute_LeavesADanglingWallOpenOnBothSides(t *testing.T) {
	f := Compute(testMap(wall(room...), wall(xy{40, 50}, xy{60, 50})))
	for _, e := range f.Edges {
		if e.A.Y == 50 && e.B.Y == 50 {
			assert.Equal(t, [2]State{Open, Open}, sides(e))
		}
	}
}

func TestCompute_NilWithoutDimensions(t *testing.T) {
	f := Compute(instanceconfig.Map{})
	assert.Nil(t, f)
	assert.Equal(t, Open, f.StateAt(5, 5))
	assert.True(t, f.HasOpenGround())
}

func TestNearestOpen_StepsAcrossTheClosestBoundary(t *testing.T) {
	f := Compute(testMap(wall(room...)))
	p, ok := f.NearestOpen(50, 15, 2)
	require.True(t, ok)
	assert.InDelta(t, 50, p.X, 1e-9)
	assert.InDelta(t, 22, p.Y, 1e-9)
}

func TestOpenSide_PointsIntoTheRoom(t *testing.T) {
	m := testMap(wall(xy{45, 20}, xy{20, 20}, xy{20, 80}, xy{80, 80}, xy{80, 20}, xy{55, 20}))
	m.Connections = []instanceconfig.MapConnection{line("door", xy{45, 20}, xy{55, 20})}
	f := Compute(m)
	nx, ny, ok := f.OpenSide(*m.Connections[0].Start, *m.Connections[0].End)
	require.True(t, ok)
	assert.InDelta(t, 0, nx, 1e-9)
	assert.InDelta(t, 1, ny, 1e-9)
	assert.NoError(t, f.Check(m))
}

func TestCheck_RejectsADoorWithOpenGroundOnBothSides(t *testing.T) {
	m := testMap(wall(room...))
	m.Connections = []instanceconfig.MapConnection{line("inner", xy{40, 50}, xy{60, 50})}
	assert.ErrorContains(t, Compute(m).Check(m), `"inner"`)
}

func TestForZone_LeavesOutMapsItRejects(t *testing.T) {
	good := testMap(wall(room...))
	good.Identifier = "good"
	open := testMap()
	open.Identifier = "open"
	fills, rejected := ForZone(instanceconfig.Zone{Maps: []instanceconfig.Map{good, open}})
	assert.Contains(t, fills, "good")
	assert.NotContains(t, fills, "open")
	assert.Contains(t, rejected, "open")
}
