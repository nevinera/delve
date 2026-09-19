package handler

import (
	"encoding/json"
	"io"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/delve-mmo/game-server/internal/dpsspread"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// DefaultDPSSimDuration is how long each (gearing plan x elevation) cell
// runs when the request omits durationSeconds - long enough for the Monte
// Carlo average to converge tightly (see internal/dpssim's tests for the
// convergence this relies on).
const DefaultDPSSimDuration = 300.0 // seconds

// MaxDPSSimDuration bounds durationSeconds, so a single request can't tie
// up the handler for an unreasonable amount of wall-clock time.
// dpsspread.Spread is an in-memory event loop (no I/O, no sleeping) run
// dpsspread.Plans x dpsspread.Elevations times, so even the max here runs
// in well under a second - this is a sanity ceiling, not a performance
// necessity.
const MaxDPSSimDuration = 3600.0 // seconds

// DPSSim handles the enemy DPS calculator endpoint (issue #72). It only
// takes an enemy UnitType - the target side is dpsspread's own mocked-up
// gearing plans x elevations, not something a caller hand-picks (that
// lower layer, dpssim.Simulate/TargetStats, is an internal Go primitive
// with no HTTP surface of its own).
type DPSSim struct{}

func NewDPSSim() *DPSSim { return &DPSSim{} }

// dpsSimRequest is the body shape for POST /dps-sim. Enemy reuses
// instanceconfig.UnitType's own JSON shape directly - the same JSON a zone
// config or the unit-type editor already authors - rather than a bespoke
// subset.
type dpsSimRequest struct {
	Enemy    instanceconfig.UnitType `json:"enemy"` // Required
	Duration float64                 `json:"durationSeconds,omitempty"`
	Seed     *int64                  `json:"seed,omitempty"` // omitted: a fresh, non-reproducible run
}

// dpsSimCellResponse is one (gearing plan x elevation) result.
type dpsSimCellResponse struct {
	GearingPlan       string   `json:"gearingPlan"`
	Elevation         float64  `json:"elevation"`
	DPS               float64  `json:"dps"`
	TTDSeconds        *float64 `json:"ttdSeconds"`
	BasicAttackDamage float64  `json:"basicAttackDamage"`
	PowerDamage       float64  `json:"powerDamage"`
	StatusTickDamage  float64  `json:"statusTickDamage"`
	TotalDamage       float64  `json:"totalDamage"`
}

func cellToResponse(c dpsspread.Cell) dpsSimCellResponse {
	resp := dpsSimCellResponse{
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

// Simulate handles POST /dps-sim: runs dpsspread.Spread once against the
// posted enemy and returns the full gearing-plan x elevation matrix.
// Protected by the same Bearer-token auth as the rest of the API - only
// the Rails server should be calling this.
func (h *DPSSim) Simulate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	req := dpsSimRequest{Duration: DefaultDPSSimDuration}
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}

	if req.Duration <= 0 || req.Duration > MaxDPSSimDuration {
		writeError(w, r, http.StatusUnprocessableEntity, "durationSeconds must be > 0 and <= 3600")
		return
	}

	seed := time.Now().UnixNano()
	if req.Seed != nil {
		seed = *req.Seed
	}
	rng := rand.New(rand.NewSource(seed))

	cells := dpsspread.Spread(req.Enemy, req.Duration, rng)
	resp := make([]dpsSimCellResponse, len(cells))
	for i, c := range cells {
		resp[i] = cellToResponse(c)
	}
	writeJSON(w, r, http.StatusOK, map[string]any{"results": resp})
}
