package classdps

import "github.com/delve-mmo/game-server/internal/instanceconfig"

// Durations is every fight length Matrix runs, in a fixed, stable order:
// 1m, 5m, and 20m (the last one standing in for steady-state) - per the
// plan doc's decision, showing how much cooldown/opener burst matters at
// different fight lengths, the way a real DPS meter would.
var Durations = []float64{60, 300, 1200}

// DurationRow is one Durations entry's full Elevations spread.
type DurationRow struct {
	Duration float64
	Cells    []ElevationResult
}

// Matrix runs Spread once per Durations entry - the full (elevation x
// duration) result grid a single class-dps-sim request/CLI invocation
// produces, in Durations' order (outer) x Elevations' order (inner).
func Matrix(class instanceconfig.CharacterClass, strategy Strategy) []DurationRow {
	rows := make([]DurationRow, 0, len(Durations))
	for _, d := range Durations {
		rows = append(rows, DurationRow{Duration: d, Cells: Spread(class, strategy, d)})
	}
	return rows
}
