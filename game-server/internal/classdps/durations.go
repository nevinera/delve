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

// DurationRow is one (stat priority x Durations entry)'s full Elevations
// spread.
type DurationRow struct {
	Priority string
	Duration float64
	Cells    []ElevationResult
}

// matrixDurations is Durations without its last (20m steady-state) entry,
// unless extended - it's by far the slowest run.
func matrixDurations(extended bool) []float64 {
	if extended {
		return Durations
	}
	return Durations[:len(Durations)-1]
}

// Matrix runs Spread once per class stat priority and duration - the full
// (priority x duration x elevation) result grid a single class-dps-sim
// request/CLI invocation produces, in that nesting order. The longest
// duration only runs when extended.
func Matrix(class instanceconfig.CharacterClass, strategy Strategy, extended bool, rng *rand.Rand) []DurationRow {
	var rows []DurationRow
	for _, priority := range priorities(class) {
		for _, d := range matrixDurations(extended) {
			rows = append(rows, DurationRow{Priority: priority.Name, Duration: d, Cells: Spread(class, priority, strategy, d, rng)})
		}
	}
	return rows
}

// FlatCell is one (priority x duration x elevation) Matrix result,
// flattened for serialization - the shared JSON shape both the POST
// /class-dps-sim handler and the class-dps-sim CLI print.
type FlatCell struct {
	Priority          string  `json:"priority"`
	DurationSeconds   float64 `json:"durationSeconds"`
	Elevation         int     `json:"elevation"`
	ElevationLabel    string  `json:"elevationLabel"`
	DPS               float64 `json:"dps"`
	BasicAttackDamage float64 `json:"basicAttackDamage"`
	PowerDamage       float64 `json:"powerDamage"`
	StatusTickDamage  float64 `json:"statusTickDamage"`
	TotalDamage       float64 `json:"totalDamage"`
}

// Flatten converts Matrix's nested (priority, duration -> elevation cells) rows into
// a single flat list, in the same (durations outer, elevations inner)
// order Matrix produces.
func Flatten(rows []DurationRow) []FlatCell {
	var cells []FlatCell
	for _, row := range rows {
		for _, cell := range row.Cells {
			cells = append(cells, FlatCell{
				Priority:          row.Priority,
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
