package handler

import (
	"encoding/json"
	"io"
	"math/rand"
	"net/http"
	"time"

	"github.com/delve-mmo/game-server/internal/classdps"
	"github.com/delve-mmo/game-server/internal/instanceconfig"
)

// ClassDPSSim handles the class DPS calculator endpoint (issue #75). Unlike
// DPSSim (which only takes an enemy - the target side is fixed gearing
// plans x elevations picked by the calculator itself), a class also needs a
// caller-supplied Strategy: a CharacterClass has no UnitType.Tactics to
// drive its own power selection, so the request must say which rotation to
// run.
type ClassDPSSim struct{}

func NewClassDPSSim() *ClassDPSSim { return &ClassDPSSim{} }

// classDPSSimRequest is the body shape for POST /class-dps-sim. Class
// reuses instanceconfig.CharacterClass's own JSON shape directly - the same
// JSON the class editor already authors.
type classDPSSimRequest struct {
	Class    instanceconfig.CharacterClass `json:"class"`          // Required
	Strategy classdps.Strategy             `json:"strategy"`       // Required (empty = basic attack only)
	Seed     *int64                        `json:"seed,omitempty"` // omitted: a fresh, non-reproducible run
}

// Simulate handles POST /class-dps-sim: runs classdps.Matrix (every
// Durations x Elevations cell, per the plan's decision to always show
// 1m/5m/20m rather than take a caller-chosen duration) against the posted
// class and strategy, and returns the full flattened matrix. Protected by
// the same Bearer-token auth as the rest of the API - only the Rails server
// should be calling this.
func (h *ClassDPSSim) Simulate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	var req classDPSSimRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}

	seed := time.Now().UnixNano()
	if req.Seed != nil {
		seed = *req.Seed
	}
	rng := rand.New(rand.NewSource(seed))

	rows := classdps.Matrix(req.Class, req.Strategy, rng)
	writeJSON(w, r, http.StatusOK, map[string]any{"results": classdps.Flatten(rows)})
}
