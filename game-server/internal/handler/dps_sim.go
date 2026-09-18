package handler

import (
	"encoding/json"
	"io"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/delve-mmo/game-server/internal/dpssim"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// DefaultDPSSimDuration is how long a run lasts when the request omits
// durationSeconds - long enough for the Monte Carlo average to converge
// tightly (see internal/dpssim's tests for the convergence this relies on).
const DefaultDPSSimDuration = 300.0 // seconds

// MaxDPSSimDuration bounds durationSeconds, so a single request can't tie up
// the handler for an unreasonable amount of wall-clock time. dpssim.Simulate
// is an in-memory event loop (no I/O, no sleeping), so even the max here
// runs in well under a second - this is a sanity ceiling, not a performance
// necessity.
const MaxDPSSimDuration = 3600.0 // seconds

// DPSSim handles the enemy DPS calculator endpoint (issue #72).
type DPSSim struct{}

func NewDPSSim() *DPSSim { return &DPSSim{} }

// dpsSimRequest is the body shape for POST /dps-sim. Enemy reuses
// instanceconfig.UnitType's own JSON shape directly - the same JSON a zone
// config or the unit-type editor already authors - rather than a bespoke
// subset.
type dpsSimRequest struct {
	Enemy    instanceconfig.UnitType `json:"enemy"`  // Required
	Target   dpsSimTargetRequest     `json:"target"` // Required
	Duration float64                 `json:"durationSeconds,omitempty"`
	Seed     *int64                  `json:"seed,omitempty"` // omitted: a fresh, non-reproducible run
}

// dpsSimTargetRequest mirrors dpssim.TargetStats' fields - see that type's
// doc: already-resolved final stats, not equipped items.
type dpsSimTargetRequest struct {
	Strength      float64 `json:"strength"`
	Agility       float64 `json:"agility"`
	Intellect     float64 `json:"intellect"`
	DefenceRating float64 `json:"defenceRating"`
	MaxHealth     float64 `json:"maxHealth"`
}

func (t dpsSimTargetRequest) toTargetStats() dpssim.TargetStats {
	return dpssim.TargetStats{
		Strength:      t.Strength,
		Agility:       t.Agility,
		Intellect:     t.Intellect,
		DefenceRating: t.DefenceRating,
		MaxHealth:     t.MaxHealth,
	}
}

// dpsSimResponse mirrors dpssim.Result. TTDSeconds is a pointer since
// Result.TTD can be +Inf (a target dealt no damage at all) - encoding/json
// can't marshal that as a float, so it's null instead.
type dpsSimResponse struct {
	DurationSeconds   float64  `json:"durationSeconds"`
	DPS               float64  `json:"dps"`
	TTDSeconds        *float64 `json:"ttdSeconds"`
	BasicAttackDamage float64  `json:"basicAttackDamage"`
	PowerDamage       float64  `json:"powerDamage"`
	StatusTickDamage  float64  `json:"statusTickDamage"`
	TotalDamage       float64  `json:"totalDamage"`
}

func resultToResponse(res dpssim.Result) dpsSimResponse {
	resp := dpsSimResponse{
		DurationSeconds:   res.Duration,
		DPS:               res.DPS,
		BasicAttackDamage: res.BasicAttackDamage,
		PowerDamage:       res.PowerDamage,
		StatusTickDamage:  res.StatusTickDamage,
		TotalDamage:       res.TotalDamage,
	}
	if !math.IsInf(res.TTD, 1) {
		resp.TTDSeconds = &res.TTD
	}
	return resp
}

// Simulate handles POST /dps-sim: runs dpssim.Simulate once against the
// posted enemy/target and returns the result. Protected by the same
// Bearer-token auth as the rest of the API - only the Rails server should
// be calling this.
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

	res := dpssim.Simulate(req.Enemy, req.Target.toTargetStats(), req.Duration, rng)
	writeJSON(w, r, http.StatusOK, resultToResponse(res))
}
