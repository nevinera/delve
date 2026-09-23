// Package unitdpscli implements the unit-dps-sim CLI's logic - fills the
// gap issue #72 left open (that calculator's CLI was never actually
// built). Reads an enemy UnitType JSON document from a file or stdin, runs
// internal/dpsspread.Spread, and prints the resulting (gearing plan x
// elevation) matrix as JSON. No new simulation logic - a thin wrapper
// around the existing dpssim/dpsspread packages, same as POST /dps-sim.
package unitdpscli

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"os"
	"time"

	"github.com/delve-mmo/game-server/internal/dpsspread"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// request is the input document's shape - the same body POST /dps-sim
// takes, so the same JSON works against either.
type request struct {
	Enemy    instanceconfig.UnitType `json:"enemy"`
	Duration float64                 `json:"durationSeconds,omitempty"`
	Seed     *int64                  `json:"seed,omitempty"`
}

// defaultDuration mirrors handler.DefaultDPSSimDuration.
const defaultDuration = 300.0

// cellResponse is one (gearing plan x elevation) result - mirrors
// handler.dpsSimCellResponse's JSON shape.
type cellResponse struct {
	GearingPlan       string   `json:"gearingPlan"`
	Elevation         float64  `json:"elevation"`
	DPS               float64  `json:"dps"`
	TTDSeconds        *float64 `json:"ttdSeconds"`
	BasicAttackDamage float64  `json:"basicAttackDamage"`
	PowerDamage       float64  `json:"powerDamage"`
	StatusTickDamage  float64  `json:"statusTickDamage"`
	TotalDamage       float64  `json:"totalDamage"`
}

func cellToResponse(c dpsspread.Cell) cellResponse {
	resp := cellResponse{
		GearingPlan:       string(c.GearingPlan),
		Elevation:         c.Elevation,
		DPS:               c.Result.DPS,
		BasicAttackDamage: c.Result.BasicAttackDamage,
		PowerDamage:       c.Result.PowerDamage,
		StatusTickDamage:  c.Result.StatusTickDamage,
		TotalDamage:       c.Result.TotalDamage,
	}
	if !math.IsInf(c.Result.TTD, 1) {
		resp.TTDSeconds = &c.Result.TTD
	}
	return resp
}

// Run is the entry point for the unit-dps-sim CLI. It accepts args (the
// non-program portion of os.Args), stdout, and stderr writers, and returns
// an exit code. Factored out of main so it can be tested without exec.
func Run(args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 {
		_, _ = fmt.Fprintln(stderr, "usage: unit-dps-sim <path|->")
		return 1
	}

	data, err := readInput(args[0])
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "error reading input: %v\n", err)
		return 1
	}

	req := request{Duration: defaultDuration}
	if err := json.Unmarshal(data, &req); err != nil {
		_, _ = fmt.Fprintf(stderr, "error parsing input: %v\n", err)
		return 1
	}

	seed := time.Now().UnixNano()
	if req.Seed != nil {
		seed = *req.Seed
	}
	rng := rand.New(rand.NewSource(seed))

	cells := dpsspread.Spread(req.Enemy, req.Duration, rng)
	resp := make([]cellResponse, len(cells))
	for i, c := range cells {
		resp[i] = cellToResponse(c)
	}

	out, err := json.MarshalIndent(map[string]any{"results": resp}, "", "  ")
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "error encoding output: %v\n", err)
		return 1
	}

	_, _ = fmt.Fprintln(stdout, string(out))
	return 0
}

func readInput(path string) ([]byte, error) {
	if path == "-" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path)
}
