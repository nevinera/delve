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

// ClassTTDSim handles the class time-to-die endpoint (issue #135): the same
// request shape as ClassDPSSim, but the class fights the reference pulls
// from docs/combat_balance.md and the response is survivability cells.
type ClassTTDSim struct{}

func NewClassTTDSim() *ClassTTDSim { return &ClassTTDSim{} }

type classTTDSimRequest struct {
	Class    instanceconfig.CharacterClass `json:"class"`
	Strategy classdps.Strategy             `json:"strategy"`
	Seed     *int64                        `json:"seed,omitempty"`
	Extended bool                          `json:"extended,omitempty"` // raise the survival cap from 300s to 1200s
}

// Simulate handles POST /class-ttd-sim and returns classdps.TTDMatrix's cells.
func (h *ClassTTDSim) Simulate(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, MaxRequestBytes+1))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "failed to read request body")
		return
	}
	if int64(len(body)) > MaxRequestBytes {
		writeError(w, r, http.StatusRequestEntityTooLarge, "request body exceeds 4MB limit")
		return
	}

	var req classTTDSimRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}

	seed := time.Now().UnixNano()
	if req.Seed != nil {
		seed = *req.Seed
	}
	cells := classdps.TTDMatrix(req.Class, req.Strategy, req.Extended, rand.New(rand.NewSource(seed)))
	writeJSON(w, r, http.StatusOK, map[string]any{"results": cells})
}
