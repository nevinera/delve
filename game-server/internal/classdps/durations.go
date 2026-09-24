package classdps

import (
	"math/rand"

	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

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
func Matrix(class instanceconfig.CharacterClass, strategy Strategy, rng *rand.Rand) []DurationRow {
	rows := make([]DurationRow, 0, len(Durations))
	for _, d := range Durations {
		rows = append(rows, DurationRow{Duration: d, Cells: Spread(class, strategy, d, rng)})
	}
	return rows
}

// FlatCell is one (duration x elevation) Matrix result, flattened for
// serialization - the shared JSON shape both the POST /class-dps-sim
// handler and the class-dps-sim CLI print.
type FlatCell struct {
	DurationSeconds   float64 `json:"durationSeconds"`
	Elevation         int     `json:"elevation"`
	ElevationLabel    string  `json:"elevationLabel"`
	DPS               float64 `json:"dps"`
	BasicAttackDamage float64 `json:"basicAttackDamage"`
	PowerDamage       float64 `json:"powerDamage"`
	StatusTickDamage  float64 `json:"statusTickDamage"`
	TotalDamage       float64 `json:"totalDamage"`
}

// Flatten converts Matrix's nested (duration -> elevation cells) rows into
// a single flat list, in the same (durations outer, elevations inner)
// order Matrix produces.
func Flatten(rows []DurationRow) []FlatCell {
	cells := make([]FlatCell, 0, len(rows)*len(Elevations))
	for _, row := range rows {
		for _, cell := range row.Cells {
			cells = append(cells, FlatCell{
				DurationSeconds:   row.Duration,
				Elevation:         cell.Elevation,
				ElevationLabel:    cell.Label,
				DPS:               cell.Result.DPS,
				BasicAttackDamage: cell.Result.BasicAttackDamage,
				PowerDamage:       cell.Result.PowerDamage,
				StatusTickDamage:  cell.Result.StatusTickDamage,
				TotalDamage:       cell.Result.TotalDamage,
			})
		}
	}
	return cells
}
