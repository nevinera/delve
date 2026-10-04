package classdps

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Elevations is every relative elevation (ee = item elvl - map elvl) Spread
// runs, in a fixed, stable order: docs/combat_balance.md's three target
// elevations, plus +10 (raid epics back in dungeons - see docs/stats.md's
// "Elevation" feel table), which has no target yet.
var Elevations = []int{-10, -5, 0, 10}

// elevationLabels names each of Elevations - purely descriptive, has no
// effect on the simulation itself.
var elevationLabels = map[int]string{
	-10: "dungeon",
	-5:  "stretch",
	0:   "heroic",
	10:  "raid",
}

func elevationLabel(ee int) string {
	if l, ok := elevationLabels[ee]; ok {
		return l
	}
	return ""
}

// Spread runs Simulate once per Elevations entry, gearing the attacker with
// a freshly synthesized Trainee Gear kit (see traineegear.go) at that
// elevation, for duration seconds. Returns len(Elevations) cells, in
// Elevations' order.
func Spread(class instanceconfig.CharacterClass, strategy Strategy, duration float64, rng *rand.Rand) []ElevationResult {
	cells := make([]ElevationResult, 0, len(Elevations))
	for _, ee := range Elevations {
		cfg := AttackerConfig{Class: class, EquippedItems: newTraineeGear(class, class.DefaultStatPriority(), ee)}
		cells = append(cells, ElevationResult{
			Elevation: ee,
			Label:     elevationLabel(ee),
			Result:    Simulate(cfg, strategy, duration, rng),
		})
	}
	return cells
}

// ElevationResult is one Elevations cell's outcome from Spread.
type ElevationResult struct {
	Elevation int
	Label     string
	Result    Result
}
