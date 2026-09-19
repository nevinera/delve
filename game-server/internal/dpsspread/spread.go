package dpsspread

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/dpssim"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Cell is one (GearingPlan x Elevation) result from Spread.
type Cell struct {
	GearingPlan GearingPlan
	Elevation   float64
	Result      dpssim.Result
}

// Spread runs enemy's dpssim.Simulate once per (GearingPlan x Elevation)
// cell (see Plans/Elevations), each for duration seconds, using rng for
// every roll across every cell (pass a seeded *rand.Rand for a
// reproducible run). Returns len(Plans)*len(Elevations) cells, in a fixed
// order (Plans outer, Elevations inner).
func Spread(enemy instanceconfig.UnitType, duration float64, rng *rand.Rand) []Cell {
	cells := make([]Cell, 0, len(Plans)*len(Elevations))
	for _, plan := range Plans {
		raw := rawStatsFor(plan)
		for _, ee := range Elevations {
			target := targetStatsFromRaw(raw, ee)
			cells = append(cells, Cell{
				GearingPlan: plan,
				Elevation:   ee,
				Result:      dpssim.Simulate(enemy, target, duration, rng),
			})
		}
	}
	return cells
}
