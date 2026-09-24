package classdps

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// Elevations is every relative elevation (ee = item elvl - map elvl) Spread
// runs, in a fixed, stable order - named after docs/stats.md's "Elevation"
// feel table / intro paragraph (BC-dungeon-in-quest-greens, on-level
// heroics, raid-epics-back-in-dungeons), extended one tier further down for
// Trainee Gear's own starting point.
var Elevations = []int{-20, -10, 0, 10}

// elevationLabels names each of Elevations - purely descriptive, has no
// effect on the simulation itself.
var elevationLabels = map[int]string{
	-20: "trainee",
	-10: "dungeon",
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
		cfg := AttackerConfig{Class: class, EquippedItems: newTraineeGear(class, ee)}
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
