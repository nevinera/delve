package pathing

import (
	"math"
	"math/rand"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// denseMap builds a first-camp-sized map (931x1116ft) with ~segments wall
// segments, drawn as short meandering polylines, plus a scatter of circles.
func denseMap(id string, segments int, rng *rand.Rand) instanceconfig.Map {
	const w, h, segsPerWall = 931.0, 1116.0, 30
	var barriers []instanceconfig.Barrier
	for made := 0; made < segments; made += segsPerWall {
		x, y, ang := rng.Float64()*w, rng.Float64()*h, rng.Float64()*2*math.Pi
		locs := []instanceconfig.Location{{X: x, Y: y}}
		for range segsPerWall {
			ang += (rng.Float64() - 0.5) * 1.2
			x = math.Max(0, math.Min(w, x+8*math.Cos(ang)))
			y = math.Max(0, math.Min(h, y+8*math.Sin(ang)))
			locs = append(locs, instanceconfig.Location{X: x, Y: y})
		}
		barriers = append(barriers, wallBarrier(locs...))
	}
	for range 50 {
		barriers = append(barriers, circleBarrier(rng.Float64()*w, rng.Float64()*h, 1+rng.Float64()*4))
	}
	return instanceconfig.Map{Identifier: id, FeetDimensions: instanceconfig.Dimensions{Width: w, Height: h}, Barriers: barriers}
}

func denseZone(maps, segments int) instanceconfig.Zone {
	rng := rand.New(rand.NewSource(1))
	zone := instanceconfig.Zone{UnitTypes: map[string]instanceconfig.UnitType{}}
	for i := range maps {
		zone.Maps = append(zone.Maps, denseMap(string(rune('a'+i)), segments, rng))
	}
	return zone
}

// The pathing precompute for a big zone (a dozen maps of 3000 wall segments
// each) has to stay a small fraction of a second, or instance creation
// stalls. The ceiling is deliberately generous versus the measured time so
// this catches a complexity regression, not a slow CI box.
func TestBuild_LargeZonePrecomputeStaysFast(t *testing.T) {
	zone := denseZone(12, 3000)

	start := time.Now()
	g, err := Build(zone, 1.0)
	elapsed := time.Since(start)

	require.NoError(t, err)
	require.NotNil(t, g)
	t.Logf("built %d maps x 3000 segments in %v", len(zone.Maps), elapsed)
	assert.Less(t, elapsed, 3*time.Second)
}

// Paths across a dense map must come back valid. (Speed is logged, not
// asserted: it varies too much by machine.)
func TestFindPath_DenseMapRoutesAreClear(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	m := denseMap("dense", 3000, rng)
	g, _, err := BuildMapGraph(m, 1.0, nil)
	require.NoError(t, err)

	routed := 0
	start := time.Now()
	const queries = 100
	for range queries {
		sx, sy := rng.Float64()*931, rng.Float64()*1116
		tx, ty := rng.Float64()*931, rng.Float64()*1116
		if g.idx.pointBlocked(sx, sy, 1) || g.idx.pointBlocked(tx, ty, 1) {
			continue // random point landed inside a barrier
		}
		path, ok := g.FindPath(sx, sy, tx, ty)
		if !ok {
			continue
		}
		routed++
		x, y := sx, sy
		for i, p := range path {
			// Clear at the unit's own true radius: the padding exists to absorb
			// grid quantization (see chooseGrid), so legs may dip into it.
			trueRadius := g.agentRadius - cornerClearancePadding
			var blocked bool
			switch {
			case i == 0:
				blocked = g.idx.travelBlocked(x, y, p.X, p.Y, trueRadius)
			case i == len(path)-1:
				blocked = g.idx.travelBlocked(p.X, p.Y, x, y, trueRadius)
			default:
				blocked = g.idx.segmentBlocked(x, y, p.X, p.Y, trueRadius)
			}
			assert.False(t, blocked, "leg %d (%v,%v)->(%v,%v) crosses a barrier", i, x, y, p.X, p.Y)
			x, y = p.X, p.Y
		}
	}
	t.Logf("%d/%d random queries routed, avg %v each", routed, queries, time.Since(start)/queries)
	assert.NotZero(t, routed)
}

func BenchmarkBuild_TwelveMapsOf3000Segments(b *testing.B) {
	zone := denseZone(12, 3000)
	b.ResetTimer()
	for range b.N {
		if _, err := Build(zone, 1.0); err != nil {
			b.Fatal(err)
		}
	}
}
