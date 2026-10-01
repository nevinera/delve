package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/delve-mmo/game-server/internal/instance"
)

// WorldVersions handles requests about every instance of one world version.
type WorldVersions struct {
	registry *instance.Registry
}

// NewWorldVersions returns a WorldVersions handler backed by registry.
func NewWorldVersions(registry *instance.Registry) *WorldVersions {
	return &WorldVersions{registry: registry}
}

type expireRequestBody struct {
	ExpiresAt time.Time `json:"expires_at"` // RFC 3339
}

type expireResponse struct {
	InstancesUpdated int `json:"instances_updated"`
}

// Expire handles POST /world-versions/{worldVersionID}/expire. Rails calls
// it when a newer version of the world is released: every running instance
// of this version starts counting down to expires_at (see
// instance.tickExpiry).
func (h *WorldVersions) Expire(w http.ResponseWriter, r *http.Request) {
	var req expireRequestBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, MaxRequestBytes)).Decode(&req); err != nil {
		writeError(w, r, http.StatusUnprocessableEntity, "invalid request body: "+err.Error())
		return
	}
	if req.ExpiresAt.IsZero() {
		writeError(w, r, http.StatusUnprocessableEntity, "expires_at is required")
		return
	}

	worldVersionID := chi.URLParam(r, "worldVersionID")
	updated := 0
	for _, inst := range h.registry.List() {
		if inst.WorldVersionID == worldVersionID {
			inst.SetExpiresAt(req.ExpiresAt)
			updated++
		}
	}
	writeJSON(w, r, http.StatusOK, expireResponse{InstancesUpdated: updated})
}
